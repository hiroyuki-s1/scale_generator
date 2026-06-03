/**
 * 印刷時の各要素の実高さを計測し、ページ高さを超えていないか検証する。
 * 高さオーバーフロー = 2ページ目空白の典型原因。
 */
const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');

const PX_PER_MM = 96 / 25.4; // CSS: 96px = 1inch = 25.4mm
const PAGE_H_MM = { landscape: 190, portrait: 277 }; // 印刷可能高さ (margin 10mm×2 除く)

async function measure(page, orientation, cols, rows) {
  // レイアウトを設定 (store経由)
  await page.evaluate(({ o, c, r }) => {
    document.getElementById('printBtn')?.click();
  }, { o: orientation, c: cols, r: rows });
  await page.waitForTimeout(100);
  // 印刷モーダルのレイアウトボタンで設定
  await page.evaluate(({ c, r }) => {
    for (const btn of document.querySelectorAll('#printLayoutGrid [data-cols]')) {
      if (btn.dataset.cols === String(c) && btn.dataset.rows === String(r)) { btn.click(); break; }
    }
    document.querySelector('#printModal [data-act="cancel"]')?.click();
  }, { c: cols, r: rows });
  await page.waitForTimeout(100);

  // 向きを設定
  await page.evaluate((o) => {
    // store の orientation を直接変えるため、印刷モーダルの向きボタンを使う
    document.getElementById('printBtn')?.click();
    setTimeout(() => {
      const b = document.querySelector(`.print-orient-btn[data-orient="${o}"]`);
      b?.click();
      document.querySelector('#printModal [data-act="cancel"]')?.click();
    }, 50);
  }, orientation);
  await page.waitForTimeout(200);

  // beforeprint 発火 + print media
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.print-page-group')];
    return groups.map((g, i) => {
      const rect = g.getBoundingClientRect();
      const inner = g.querySelector('.print-page-inner');
      const innerRect = inner?.getBoundingClientRect();
      const cards = [...g.querySelectorAll('.saved-card')];
      const cardRects = cards.map(c => c.getBoundingClientRect().height);
      return {
        index: i,
        groupHeightPx: rect.height,
        innerHeightPx: innerRect?.height,
        cardHeightsPx: cardRects,
        cardCount: cards.length,
      };
    });
  });

  // screen に戻す
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(100);

  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await setup(browser, 'ios'); // iOS UA

  // 楽器選択 + スケール3枚登録 (1×2で2ページ)
  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(100);
    await page.fill('#fbTitleInput', `テスト${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(200);
  }

  console.log('=== 印刷グループ高さ計測 (iOS UA, ギター) ===\n');

  for (const [orientation, cols, rows] of [['portrait', 1, 2], ['landscape', 2, 2], ['portrait', 2, 3]]) {
    const pageHmm = PAGE_H_MM[orientation];
    const pageHpx = pageHmm * PX_PER_MM;
    console.log(`--- ${orientation} ${cols}×${rows} (ページ高さ ${pageHmm}mm = ${pageHpx.toFixed(0)}px) ---`);
    const groups = await measure(page, orientation, cols, rows);
    groups.forEach(g => {
      const groupHmm = (g.groupHeightPx / PX_PER_MM).toFixed(1);
      const over = g.groupHeightPx > pageHpx;
      const mark = over ? '❌ ページ超過!' : '✅ ページ内';
      console.log(`  グループ${g.index+1}: 高さ ${g.groupHeightPx.toFixed(0)}px (${groupHmm}mm) cards=${g.cardCount} ${mark}`);
      if (g.cardHeightsPx.length) {
        const cardMm = g.cardHeightsPx.map(h => (h/PX_PER_MM).toFixed(1)).join(', ');
        console.log(`    カード高さ: ${cardMm} mm`);
      }
    });
    console.log('');
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
