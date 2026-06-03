/** 印刷改ページ構造を PC/Android/iOS の3環境で検証 */
const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');

async function check(page) {
  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);
  for (let i = 1; i <= 5; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(80);
    await page.fill('#fbTitleInput', `T${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(150);
  }
  // 2×2
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]'))
      if (b.dataset.cols==='2'&&b.dataset.rows==='2'){b.click();break;}
    document.querySelector('#printModal [data-act="cancel"]')?.click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const g = [...document.querySelectorAll('.print-page-group')];
    return {
      cards: document.querySelectorAll('.saved-card').length,
      groups: g.length,
      g1: g[0] && { h: getComputedStyle(g[0]).height, bb: getComputedStyle(g[0]).pageBreakBefore, ba: getComputedStyle(g[0]).pageBreakAfter, ov: getComputedStyle(g[0]).overflow },
      g2: g[1] && { bb: getComputedStyle(g[1]).pageBreakBefore },
      inner: document.querySelector('.print-page-inner') && getComputedStyle(document.querySelector('.print-page-inner')).gridTemplateRows.split(' ').length,
      panelSaved: getComputedStyle(document.getElementById('panelSaved')).display,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const dev of ['pc','android','ios']) {
    const { page, context } = await setup(browser, dev);
    const r = await check(page);
    console.log(`\n=== ${dev.toUpperCase()} ===`);
    console.log(`  カード5枚 / グループ数: ${r.groups} (期待2)`, r.groups===2?'✅':'❌');
    console.log(`  group1 height: ${r.g1.h} / overflow: ${r.g1.ov}`);
    console.log(`  group1 pageBreakBefore: ${r.g1.bb} (auto期待)`, r.g1.bb!=='always'?'✅':'❌');
    console.log(`  group1 pageBreakAfter: ${r.g1.ba} (auto期待=空白ページ防止)`, r.g1.ba!=='always'?'✅':'❌');
    console.log(`  group2 pageBreakBefore: ${r.g2.bb} (always期待)`, r.g2.bb==='always'?'✅':'❌');
    console.log(`  inner grid 行数: ${r.inner} (期待2)`, r.inner===2?'✅':'❌');
    console.log(`  #panelSaved: ${r.panelSaved} (block期待)`, r.panelSaved==='block'?'✅':'❌');
    await context.close();
  }
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
