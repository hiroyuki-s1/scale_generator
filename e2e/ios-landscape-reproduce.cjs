/**
 * iOS Safari 横レイアウト印刷の2ページ目空白バグの実 WebKit 再現/検証。
 *
 * 流れ:
 *   1. WebKit を iPhone 14 device emulation で起動
 *   2. localhost:5173 へアクセスし、5枚スケールを登録 (2×2 で 2ページ印刷)
 *   3. レイアウトを 2×2、向きを landscape にセット (印刷モーダル経由)
 *   4. beforeprint を発火 → wrapIntoPageGroups が走る
 *   5. emulateMedia({media:'print'}) + viewport を landscape (画面比率変更で
 *      orientation media query が landscape として評価されることが多い)
 *   6. 各 .print-page-group の実 mm 換算高さを計測
 *      - 期待: ~210mm (= 794px @ 96dpi) これ以下、>2 グループに分裂なし
 *      - 不具合の徴候: 高さがビューポート由来 (300mm+ など) → ページ超過
 *   7. portrait でも同じ手順で計測 → ~297mm (=1123px) 内
 *
 * 結果ファイル: e2e-results/ios-landscape-report.json に書き出し。
 */
const { webkit, chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PX_PER_MM = 96 / 25.4;
const LANDSCAPE_MAX_MM = 210;
const PORTRAIT_MAX_MM = 297;
const SAFETY_PX = 5; // 計測誤差許容

const ROOT = path.dirname(__dirname);
const OUT_DIR = path.join(ROOT, 'e2e-results');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function setupPage(browser, isLandscape) {
  // iPhone 14 Pro 相当 (Playwright の devices.['iPhone 14'] 相当値)
  const portraitVP = { width: 393, height: 852 };
  const landscapeVP = { width: 852, height: 393 };
  const context = await browser.newContext({
    viewport: isLandscape ? landscapeVP : portraitVP,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  // アルファ通知を閉じる
  await page.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    try { localStorage.setItem('sg.alphaNoticeDismissed.v1', '1'); } catch { /* noop */ }
  });
  await page.waitForTimeout(150);
  return { page, context, errors };
}

async function registerScales(page, n) {
  // 楽器選択
  await page.click('#instrumentBtn');
  await page.waitForSelector('[data-instrument]', { state: 'visible' });
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);

  for (let i = 1; i <= n; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(80);
    await page.fill('#fbTitleInput', `テスト${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(180);
  }
}

async function setLayout(page, cols, rows, orientation) {
  // 印刷モーダルを開いてレイアウトと向きを設定
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(150);
  await page.evaluate(({ c, r }) => {
    for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]')) {
      if (b.dataset.cols === String(c) && b.dataset.rows === String(r)) { b.click(); break; }
    }
  }, { c: cols, r: rows });
  await page.waitForTimeout(50);
  // 向きボタンは PC では出るが、モバイルでは非表示で portrait 固定の運用。
  // print-orient-btn が存在すれば操作、なければ store を直接更新。
  await page.evaluate((o) => {
    const btn = document.querySelector(`.print-orient-btn[data-orient="${o}"]`);
    if (btn) btn.click();
  }, orientation);
  await page.waitForTimeout(50);
  await page.evaluate(() => document.querySelector('#printModal [data-act="cancel"]')?.click());
  await page.waitForTimeout(200);
}

async function measurePrint(page, orientation) {
  // beforeprint で wrapIntoPageGroups が動く
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);

  const result = await page.evaluate(({ pxPerMm, orientation }) => {
    const groups = [...document.querySelectorAll('.print-page-group')];
    return {
      orientation,
      orientationMql: {
        landscape: window.matchMedia('(orientation: landscape)').matches,
        portrait:  window.matchMedia('(orientation: portrait)').matches,
      },
      groups: groups.map((g, i) => {
        const rect = g.getBoundingClientRect();
        const inner = g.querySelector('.print-page-inner');
        const innerRect = inner?.getBoundingClientRect();
        const cards = [...g.querySelectorAll('.saved-card')];
        const cs = window.getComputedStyle(g);
        return {
          index: i,
          groupHeightPx: rect.height,
          groupHeightMm: rect.height / pxPerMm,
          computedHeight: cs.height,
          innerHeightPx: innerRect?.height || 0,
          cardCount: cards.length,
        };
      }),
      panelSavedDisplay: window.getComputedStyle(document.getElementById('panelSaved')).display,
      bodyScrollHeightPx: document.body.scrollHeight,
      bodyScrollHeightMm: document.body.scrollHeight / pxPerMm,
    };
  }, { pxPerMm: PX_PER_MM, orientation });

  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(100);
  return result;
}

function analyze(label, result) {
  const maxMm = result.orientation === 'landscape' ? LANDSCAPE_MAX_MM : PORTRAIT_MAX_MM;
  const maxPx = maxMm * PX_PER_MM;
  console.log(`\n=== ${label} ===`);
  console.log(`  orientation media query: landscape=${result.orientationMql.landscape} portrait=${result.orientationMql.portrait}`);
  console.log(`  #panelSaved display: ${result.panelSavedDisplay} (block 期待)`);
  console.log(`  ページ高さ上限: ${maxMm}mm = ${maxPx.toFixed(0)}px`);
  console.log(`  body scrollHeight: ${result.bodyScrollHeightPx}px (${result.bodyScrollHeightMm.toFixed(1)}mm)`);
  console.log(`  グループ数: ${result.groups.length} (期待 = カード数 / 4 切り上げ)`);

  let pass = true;
  for (const g of result.groups) {
    const over = g.groupHeightPx > maxPx + SAFETY_PX;
    const mark = over ? '❌ ページ超過' : '✅ OK';
    console.log(`    グループ${g.index + 1}: 高さ ${g.groupHeightPx.toFixed(0)}px (${g.groupHeightMm.toFixed(1)}mm)  ${mark}  cards=${g.cardCount}  computedHeight=${g.computedHeight}`);
    if (over) pass = false;
  }
  // 期待値: 5 cards / 2×2 = 2 groups
  if (result.groups.length !== 2) {
    console.log(`  ❌ グループ数が 2 ではない (got ${result.groups.length})`);
    pass = false;
  }
  return pass;
}

async function main() {
  console.log('🦏 WebKit iOS device emulation で印刷バグ再現/検証\n');
  const reports = [];
  let allPass = true;

  for (const orientation of ['landscape', 'portrait']) {
    const browser = await webkit.launch({ headless: true });
    try {
      const { page, errors } = await setupPage(browser, orientation === 'landscape');
      await registerScales(page, 5); // 2×2 で2ページ
      await setLayout(page, 2, 2, orientation);
      const result = await measurePrint(page, orientation);
      result.pageErrors = errors;
      const pass = analyze(`WebKit iOS, 5枚, 2×2, ${orientation}`, result);
      reports.push({ orientation, pass, ...result });
      if (!pass) allPass = false;
    } finally {
      await browser.close();
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'ios-landscape-report.json'),
    JSON.stringify(reports, null, 2),
  );
  console.log(`\n結果ファイル: ${path.join(OUT_DIR, 'ios-landscape-report.json')}`);
  console.log(allPass ? '\n🎉 全パターン合格' : '\n💥 不合格パターンあり');
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
