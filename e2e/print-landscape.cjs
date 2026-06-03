/** 横印刷(landscape)で空白ページが出るか page.pdf で検証
 *  モバイル運用: アプリは portrait CSS、OS シートで横 = page.pdf({landscape:true}) */
const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await setup(browser, 'ios');

  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);
  await page.click('#scalePickerBtn');
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('#scaleCatList button')?.click());
  await page.waitForTimeout(120);
  await page.evaluate(() => document.querySelector('#scaleNameList button')?.click());
  await page.waitForTimeout(250);
  // 4枚登録 (2×2でちょうど1ページ)
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(80);
    await page.fill('#fbTitleInput', `T${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(150);
  }
  // portrait 2×2 (モバイルは portrait 固定)
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

  // 縦印刷PDF
  await page.pdf({ path: '/tmp/ls_portrait.pdf', format: 'A4', printBackground: true });
  // 横印刷PDF (OS シートで横にした状態を再現)
  await page.pdf({ path: '/tmp/ls_landscape.pdf', format: 'A4', landscape: true, printBackground: true });

  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
