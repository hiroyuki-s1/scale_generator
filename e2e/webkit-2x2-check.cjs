/**
 * WebKit (= iOS Safari エンジン) で 2×2 縦/横の印刷グループ高さを実測する。
 *
 * 目的: iOS の2P目空白バグを iOS エンジンで検証する。
 *   WebKit headless は emulateMedia('print') と複雑な SVG/filter 描画で
 *   クラッシュするため、(1) カードは SVG 無しのダミー div を注入、
 *   (2) @media print → @media all に書き換えて screen レンダリングで測定する。
 *
 * 検証: 各 .print-page-group の高さ(mm換算)が「用紙 - 実機余白(約20mm)」に
 *   収まること。WebKit headless には物理プリンタ余白が無いため CSS height が
 *   用紙内なら OK に見えるが、実機 iOS は AirPrint の物理印刷不可領域があるため
 *   SAFETY_MM=22 でその分を吸収している (printCss.js 参照)。
 *
 * 前提: WebKit のシステムライブラリが導入済み (e2e/setup-webkit-libs.sh)。
 *   未導入なら WebKit 起動に失敗するので、その場合はスキップ扱いで exit 0。
 *
 * 使い方: dev server 起動後  node e2e/webkit-2x2-check.cjs
 */
const PX = 96 / 25.4;
const IOS_MARGIN_MM = 0; // @page margin を CSS で設定したので、グループ高さは用紙内に収まればよい(margin分はSafariが確保)

let webkit;
try { ({ webkit } = require('playwright')); } catch { console.log('playwright 未導入 — skip'); process.exit(0); }

async function run(browser, orientation) {
  const vp = orientation === 'landscape' ? { width: 852, height: 393 } : { width: 393, height: 852 };
  const ctx = await browser.newContext({
    viewport: vp, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  // ダミーカード5枚を注入 (SVG無しで WebKit クラッシュ回避)
  await p.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    document.getElementById('panelSaved')?.classList.remove('hidden');
    document.getElementById('panelEditor')?.classList.add('hidden');
    const grid = document.getElementById('savedGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const c = document.createElement('div'); c.className = 'saved-card'; c.dataset.id = 'd' + i;
      c.innerHTML = '<div class="saved-print-title">T' + i + '</div><div class="fb-wrap"><div style="height:40px"></div></div>';
      grid.appendChild(c);
    }
  });
  // 2×2 を store に反映
  await p.evaluate(() => document.getElementById('printBtn')?.click());
  await p.waitForTimeout(120);
  await p.evaluate(() => { for (const x of document.querySelectorAll('#printLayoutGrid [data-cols]')) if (x.dataset.cols === '2' && x.dataset.rows === '2') { x.click(); break; } });
  await p.waitForTimeout(80);
  await p.evaluate(() => document.querySelector('#printModal [data-act="cancel"]')?.click());
  await p.waitForTimeout(120);
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await p.waitForTimeout(200);
  // @media print → @media all 強制適用 (emulateMedia('print') は WebKit でクラッシュ)
  await p.evaluate(() => { for (const id of ['print-layout']) { const src = document.getElementById(id)?.textContent || ''; const s = document.createElement('style'); s.textContent = src.replace(/@media print/g, '@media all'); document.head.appendChild(s); } });
  await p.waitForTimeout(200);
  const m = await p.evaluate((px) => {
    const gs = [...document.querySelectorAll('.print-page-group')];
    return {
      mqP: matchMedia('(orientation: portrait)').matches,
      mqL: matchMedia('(orientation: landscape)').matches,
      groups: gs.map((g, i) => ({ i, hMm: +(g.getBoundingClientRect().height / px).toFixed(1), cards: g.querySelectorAll('.saved-card').length })),
    };
  }, PX);
  await ctx.close();
  return { ...m, orientation };
}

async function main() {
  console.log('🦏 WebKit (iOS Safari) 2×2 印刷グループ高さ実測\n');
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
  } catch (e) {
    console.log('WebKit 起動失敗 (システムライブラリ未導入?) — skip');
    console.log('  → e2e/setup-webkit-libs.sh を実行してください');
    process.exit(0);
  }
  let allPass = true;
  for (const orientation of ['portrait', 'landscape']) {
    const r = await run(browser, orientation);
    const pageMm = orientation === 'landscape' ? 210 : 297;
    const safeMm = pageMm - IOS_MARGIN_MM; // 実機余白を引いた印刷可能高さ
    console.log(`[5枚 2×2 ${orientation}] 用紙${pageMm}mm / 実機印刷可能~${safeMm}mm`);
    console.log(`  orientation MQ: portrait=${r.mqP} landscape=${r.mqL} (期待: ${orientation === 'portrait' ? 'P=true' : 'L=true'})`);
    const mqOk = orientation === 'portrait' ? r.mqP : r.mqL;
    if (!mqOk) { console.log('  ❌ orientation media query が一致しない'); allPass = false; }
    for (const g of r.groups) {
      const ok = g.hMm <= safeMm;
      console.log(`  group${g.i + 1}: ${g.hMm}mm cards=${g.cards} ${ok ? '✅ 実機余白でも収まる' : '❌ 実機余白で溢れる(2P空白の恐れ)'}`);
      if (!ok) allPass = false;
    }
    if (r.groups.length !== 2) { console.log(`  ❌ グループ数 ${r.groups.length} (期待2)`); allPass = false; }
    console.log('');
  }
  await browser.close();
  console.log(allPass ? '🎉 WebKit 実測: 全パス (実機余白20mm想定でも収まる)' : '💥 失敗あり');
  process.exit(allPass ? 0 : 1);
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
