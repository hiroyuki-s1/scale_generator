const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');
async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const dev of ['pc','android','ios']) {
    const { page, context } = await setup(browser, dev);
    // 印刷モーダルを開いて landscape 選択 (向きボタン押下を再現)
    await page.evaluate(() => document.getElementById('printBtn')?.click());
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector('.print-orient-btn[data-orient="landscape"]')?.click());
    await page.waitForTimeout(100);
    const orient = await page.$eval('#print-orient', el => el.textContent);
    const hasAuto = orient.includes('size: auto');
    const hasMM = orient.includes('mm 21') || orient.includes('mm 29');
    console.log(`${dev.toUpperCase()}: ${hasAuto ? 'size:auto ✅(モバイル想定)' : hasMM ? 'size:mm固定 ✅(PC想定)' : '?'}  [${orient.match(/size:[^;]*/)?.[0]}]`);
    await context.close();
  }
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
