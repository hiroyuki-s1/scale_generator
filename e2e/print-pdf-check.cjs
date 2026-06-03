/** page.pdf() で実印刷PDFを生成し、ページ数とはみ出しを検証 */
const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');

async function genPdf(page, viewBoxOverride, layout, outPath) {
  await page.evaluate(({ vb, cols, rows }) => {
    document.getElementById('printBtn')?.click();
    setTimeout(() => {
      for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]'))
        if (b.dataset.cols===String(cols)&&b.dataset.rows===String(rows)){b.click();break;}
      document.querySelector('#printModal [data-act="cancel"]')?.click();
    }, 30);
  }, { vb: viewBoxOverride, cols: layout[0], rows: layout[1] });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(150);
  if (viewBoxOverride) {
    await page.evaluate((vb) => {
      document.querySelectorAll('svg.fb').forEach(s => s.setAttribute('viewBox', vb));
    }, viewBoxOverride);
  }
  await page.waitForTimeout(100);
  await page.pdf({ path: outPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(100);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await setup(browser, 'pc');

  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);
  // スケール選択
  await page.click('#scalePickerBtn');
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#scaleCatList button')?.click());
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('#scaleNameList button')?.click());
  await page.waitForTimeout(300);
  await page.fill('#fbTitleInput', 'テスト');
  await page.click('#registerBtn');
  await page.waitForTimeout(300);

  // ① 通常(横長, viewBox全域) 1×1
  await genPdf(page, null, [1,1], '/tmp/pdf_normal.pdf');
  // ② 縦長マスク (3フレット相当) 1×1
  await genPdf(page, '50 0 195 256', [1,1], '/tmp/pdf_tall.pdf');
  // ③ 極端縦長 (1フレット相当) 1×1
  await genPdf(page, '50 0 73 256', [1,1], '/tmp/pdf_xtall.pdf');

  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
