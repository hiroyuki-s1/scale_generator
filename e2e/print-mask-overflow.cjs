/** マスクで縦長になった指板が印刷セル枠からはみ出さないか検証 */
const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await setup(browser, 'ios');

  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);

  // スケールを選択 (度数ドットを出す)
  await page.click('#scalePickerBtn');
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#scaleCatList button')?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#scaleNameList button')?.click());
  await page.waitForTimeout(300);

  // マスクを有効にして範囲を狭く (縦長指板にする)
  await page.evaluate(() => document.querySelector('[data-el="toggle"]')?.click());
  await page.waitForTimeout(200);
  // maxDec を押して範囲を狭める (max を大きく下げる = 縦長)
  await page.evaluate(() => {
    const maxDec = document.querySelector('[data-el="maxDec"]');
    for (let i = 0; i < 18; i++) maxDec?.click();
  });
  await page.waitForTimeout(200);

  await page.fill('#fbTitleInput', '狭いマスク');
  await page.click('#registerBtn');
  await page.waitForTimeout(300);

  // 1×1 レイアウト (1スケール1ページ、最も縦に大きい)
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]'))
      if (b.dataset.cols==='1'&&b.dataset.rows==='1'){b.click();break;}
    document.querySelector('#printModal [data-act="cancel"]')?.click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  // 確実に縦長 viewBox を再現 (3フレット分の狭いマスク = 縦長)
  // SVG.ML=54, FW=65 → 3フレット: x=54, w=195, 全高 h=256 → アスペクト比 0.76 縦長
  await page.evaluate(() => {
    const svg = document.querySelector('svg.fb');
    if (svg) svg.setAttribute('viewBox', '50 0 195 256'); // 縦長 (w<h)
  });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const group = document.querySelector('.print-page-group');
    const card = document.querySelector('.saved-card');
    const fbWrap = document.querySelector('.fb-wrap');
    const svg = document.querySelector('svg.fb');
    const gr = group.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const wr = fbWrap.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const ws = getComputedStyle(fbWrap);
    return {
      groupBottom: Math.round(gr.bottom), groupHeight: Math.round(gr.height),
      cardBottom: Math.round(cr.bottom), cardHeight: Math.round(cr.height),
      wrapBottom: Math.round(wr.bottom), wrapHeight: Math.round(wr.height),
      svgBottom: Math.round(sr.bottom), svgHeight: Math.round(sr.height),
      svgViewBox: svg.getAttribute('viewBox'),
      cardCSS: { display: cs.display, flexDir: cs.flexDirection, height: cs.height },
      wrapCSS: { display: ws.display, flex: ws.flexGrow+'/'+ws.flexShrink+'/'+ws.flexBasis, height: ws.height, minHeight: ws.minHeight },
    };
  });

  await page.emulateMedia({ media: 'screen' });
  await browser.close();

  console.log('=== マスク狭め(縦長指板) 1×1 印刷 はみ出し検証 ===\n');
  console.log(`SVG viewBox: ${r.svgViewBox}`);
  console.log(`group:   height=${r.groupHeight}px bottom=${r.groupBottom}px`);
  console.log(`card:    height=${r.cardHeight}px bottom=${r.cardBottom}px`);
  console.log(`fb-wrap: height=${r.wrapHeight}px bottom=${r.wrapBottom}px`);
  console.log(`svg:     height=${r.svgHeight}px bottom=${r.svgBottom}px`);
  console.log(`card CSS: ${JSON.stringify(r.cardCSS)}`);
  console.log(`wrap CSS: ${JSON.stringify(r.wrapCSS)}`);
  console.log('');
  const svgInGroup = r.svgBottom <= r.groupBottom + 1;
  const cardInGroup = r.cardBottom <= r.groupBottom + 1;
  console.log(`SVG が group 枠内に収まる: ${svgInGroup ? '✅' : '❌ はみ出し!'} (svg.bottom ${r.svgBottom} <= group.bottom ${r.groupBottom})`);
  console.log(`card が group 枠内に収まる: ${cardInGroup ? '✅' : '❌'}`);
  process.exit(svgInGroup && cardInGroup ? 0 : 1);
}
main().catch(e=>{console.error(e);process.exit(1);});
