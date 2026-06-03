/** 横印刷レイアウト検証: 横viewport + emulateMedia で4枚が2×2に並ぶか位置測定 */
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
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(80);
    await page.fill('#fbTitleInput', `T${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]'))
      if (b.dataset.cols==='2'&&b.dataset.rows==='2'){b.click();break;}
    document.querySelector('#printModal [data-act="cancel"]')?.click();
  });
  await page.waitForTimeout(150);

  // 横 viewport (iOS landscape) にして 100vh を横基準に
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const groups = document.querySelectorAll('.print-page-group');
    const cards = [...document.querySelectorAll('.saved-card')];
    const vh = window.innerHeight;
    const cardPos = cards.map((c, i) => {
      const r = c.getBoundingClientRect();
      return { i, top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom) };
    });
    const g0 = groups[0]?.getBoundingClientRect();
    return {
      vh, groups: groups.length, cards: cards.length,
      groupHeight: g0 ? Math.round(g0.height) : 0,
      groupBottom: g0 ? Math.round(g0.bottom) : 0,
      cardPos,
    };
  });

  console.log('=== 横印刷レイアウト (viewport 812×375) ===');
  console.log(`window.innerHeight (100vh基準): ${r.vh}px`);
  console.log(`グループ数: ${r.groups} / カード数: ${r.cards}`);
  console.log(`グループ高さ: ${r.groupHeight}px / bottom: ${r.groupBottom}px`);
  console.log('カード位置:');
  r.cardPos.forEach(c => console.log(`  card${c.i+1}: top=${c.top} left=${c.left} bottom=${c.bottom}`));
  // 判定: 4枚が2行2列か (top が2種類、left が2種類)
  const tops = [...new Set(r.cardPos.map(c => c.top))].sort((a,b)=>a-b);
  const lefts = [...new Set(r.cardPos.map(c => c.left))].sort((a,b)=>a-b);
  console.log(`\n行(top)の種類: ${tops.length} (2なら2行✅)`);
  console.log(`列(left)の種類: ${lefts.length} (2なら2列✅)`);
  const allInGroup = r.cardPos.every(c => c.bottom <= r.groupBottom + 2);
  console.log(`全カードがグループ(1ページ)内: ${allInGroup ? '✅' : '❌ はみ出し!'}`);

  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
