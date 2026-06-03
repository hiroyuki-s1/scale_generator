/**
 * WebKit (= iOS Safari エンジン) で印刷の (orientation × layout × カード数)
 * マトリクスを実 DOM 計測する。
 *
 * 検証ポイント:
 *   1. 各 .print-page-group の高さが用紙ページ高さ以下
 *   2. グループ数 = ceil(cards / (cols*rows)) 通り (空白ページが入っていない)
 *   3. orientation media query が viewport 比率と一致して切替わる
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const PX_PER_MM = 96 / 25.4;
const MAX_MM = { landscape: 210, portrait: 297 };
const SAFETY_PX = 5;

const ROOT = path.dirname(__dirname);
const OUT_DIR = path.join(ROOT, 'e2e-results');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SCENARIOS = [
  // [cards, cols, rows, orientation, label]
  [4,  2, 2, 'landscape', '4枚 / 2×2 / 横 → 1ページ'],
  [5,  2, 2, 'landscape', '5枚 / 2×2 / 横 → 2ページ (1+端数)'],
  [8,  2, 2, 'landscape', '8枚 / 2×2 / 横 → 2ページ ぴったり'],
  [9,  2, 2, 'landscape', '9枚 / 2×2 / 横 → 3ページ (2+端数) ★複数ページ'],
  [4,  2, 2, 'portrait',  '4枚 / 2×2 / 縦 → 1ページ'],
  [5,  2, 2, 'portrait',  '5枚 / 2×2 / 縦 → 2ページ'],
  [9,  2, 2, 'portrait',  '9枚 / 2×2 / 縦 → 3ページ ★複数ページ'],
  [3,  1, 2, 'landscape', '3枚 / 1×2 / 横 → 2ページ'],
  [7,  3, 3, 'landscape', '7枚 / 3×3 / 横 → 1ページ'],
  [12, 2, 3, 'landscape', '12枚 / 2×3 / 横 → 2ページ ★複数ページ'],
  [12, 2, 3, 'portrait',  '12枚 / 2×3 / 縦 → 2ページ ★複数ページ'],
];

async function setupPage(browser, isLandscape) {
  const vp = isLandscape ? { width: 852, height: 393 } : { width: 393, height: 852 };
  const ctx = await browser.newContext({
    viewport: vp,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    try { localStorage.setItem('sg.alphaNoticeDismissed.v1', '1'); } catch {}
  });
  return { page, ctx };
}

async function register(page, n) {
  await page.click('#instrumentBtn');
  await page.waitForSelector('[data-instrument]');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(200);
  for (let i = 1; i <= n; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(60);
    await page.fill('#fbTitleInput', `T${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(140);
  }
}

async function setLayout(page, cols, rows, orientation) {
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(120);
  await page.evaluate(({ c, r }) => {
    for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]')) {
      if (b.dataset.cols === String(c) && b.dataset.rows === String(r)) { b.click(); break; }
    }
  }, { c: cols, r: rows });
  await page.waitForTimeout(50);
  await page.evaluate((o) => {
    const btn = document.querySelector(`.print-orient-btn[data-orient="${o}"]`);
    if (btn) btn.click();
  }, orientation);
  await page.waitForTimeout(50);
  await page.evaluate(() => document.querySelector('#printModal [data-act="cancel"]')?.click());
  await page.waitForTimeout(150);
}

async function measure(page, orientation) {
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(180);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(250);
  const r = await page.evaluate(({ pxPerMm }) => {
    const groups = [...document.querySelectorAll('.print-page-group')];
    return {
      mqLandscape: window.matchMedia('(orientation: landscape)').matches,
      mqPortrait: window.matchMedia('(orientation: portrait)').matches,
      groups: groups.map((g, i) => ({
        index: i,
        heightPx: g.getBoundingClientRect().height,
        heightMm: g.getBoundingClientRect().height / pxPerMm,
        cards: g.querySelectorAll('.saved-card').length,
        computed: window.getComputedStyle(g).height,
      })),
    };
  }, { pxPerMm: PX_PER_MM });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(100);
  return { ...r, orientation };
}

async function run() {
  console.log('🦏 WebKit 印刷マトリクス検証 (iOS Safari エンジン)\n');
  const reports = [];
  let allPass = true;
  const browser = await webkit.launch({ headless: true });
  try {
    for (const [cards, cols, rows, orientation, label] of SCENARIOS) {
      const expectedGroups = Math.ceil(cards / (cols * rows));
      const maxMm = MAX_MM[orientation];
      const maxPx = maxMm * PX_PER_MM;
      const { page, ctx } = await setupPage(browser, orientation === 'landscape');
      try {
        await register(page, cards);
        await setLayout(page, cols, rows, orientation);
        const r = await measure(page, orientation);
        let pass = true;
        const reasons = [];
        if (r.groups.length !== expectedGroups) {
          pass = false;
          reasons.push(`グループ数 ${r.groups.length} ≠ 期待値 ${expectedGroups}`);
        }
        const expectedMq = orientation === 'landscape';
        if (r.mqLandscape !== expectedMq) {
          pass = false;
          reasons.push(`orientation media query 不一致 (landscape=${r.mqLandscape})`);
        }
        for (const g of r.groups) {
          if (g.heightPx > maxPx + SAFETY_PX) {
            pass = false;
            reasons.push(`グループ${g.index+1} 高さ ${g.heightMm.toFixed(1)}mm > ${maxMm}mm`);
          }
        }
        // cards-per-group: 各ページの DOM 上カード数が期待値どおりか
        // (ユーザー報告 "1×2 で 1ページに 1つしか印刷されない" の再発防止)
        const perPage = cols * rows;
        r.groups.forEach((g, i) => {
          const expectedInGroup = (i === r.groups.length - 1)
            ? (cards - perPage * (r.groups.length - 1))
            : perPage;
          if (g.cards !== expectedInGroup) {
            pass = false;
            reasons.push(`ページ${i+1} カード数 ${g.cards} ≠ 期待 ${expectedInGroup}`);
          }
        });
        const mark = pass ? '✅' : '❌';
        const heights = r.groups.map(g => g.heightMm.toFixed(0)).join(', ');
        console.log(`${mark} ${label}`);
        console.log(`    グループ数=${r.groups.length}/${expectedGroups}, 各高さ=[${heights}]mm, mq=${r.mqLandscape ? 'landscape' : 'portrait'}`);
        if (!pass) {
          reasons.forEach(r => console.log(`    ❌ ${r}`));
          allPass = false;
        }
        reports.push({ label, cards, cols, rows, orientation, pass, reasons, ...r });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT_DIR, 'webkit-matrix-report.json'), JSON.stringify(reports, null, 2));
  console.log(`\n${allPass ? '🎉 全シナリオ合格' : '💥 失敗あり'}`);
  console.log(`結果: ${path.join(OUT_DIR, 'webkit-matrix-report.json')}`);
  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e); process.exit(2); });
