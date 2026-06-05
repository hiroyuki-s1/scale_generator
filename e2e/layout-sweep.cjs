/* Layout sweep across mobile/tablet/desktop. Take screenshots of key
 * screens & posmode state. Look for overflow / clipping in console.
 */
const path = require('path');
const { devices, chromium, webkit } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const BASE = 'http://localhost:4173/';

const PROFILES = [
  { name: 'iphone13',  br: webkit,   opts: { ...devices['iPhone 13'] } },
  { name: 'pixel5',    br: chromium, opts: { ...devices['Pixel 5'] } },
  { name: 'iphoneSE',  br: webkit,   opts: { ...devices['iPhone SE'] } },
  { name: 'ipadMini',  br: webkit,   opts: { ...devices['iPad Mini'] } },
  { name: 'desktop',   br: chromium, opts: { viewport: { width: 1280, height: 800 } } },
];

async function detectOverflow(page) {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const docW = Math.max(body.scrollWidth, html.scrollWidth);
    const innerW = window.innerWidth;
    const horizontalOverflow = docW > innerW + 1;
    // find elements wider than viewport
    const offenders = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > innerW + 2 && r.left >= 0) {
        offenders.push({
          tag: el.tagName, id: el.id, cls: el.getAttribute('class') || '',
          w: Math.round(r.width), left: Math.round(r.left),
        });
      }
    });
    return { docW, innerW, horizontalOverflow, offenders: offenders.slice(0, 5) };
  });
}

(async () => {
  const summary = [];
  for (const p of PROFILES) {
    const browser = await p.br.launch({ headless: true });
    const ctx = await browser.newContext(p.opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    try { await page.click('#alphaNoticeClose', { timeout: 1500 }); } catch {}

    // State 0: no instrument
    await page.screenshot({ path: `/tmp/sweep-${p.name}-0-initial.png` });
    const overflowInitial = await detectOverflow(page);

    // Select guitar + scale
    await page.click('#instrumentBtn');
    await page.click('.instr-choice-btn[data-instrument="guitar"]');
    await page.click('#scalePickerBtn');
    await page.waitForSelector('#scaleCatList', { state: 'visible' });
    const cats = await page.$$('#scaleCatList button, #scaleCatList [data-cat]');
    if (cats.length) await cats[0].click();
    await page.waitForTimeout(150);
    const names = await page.$$('#scaleNameList button');
    if (names.length) await names[0].click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: `/tmp/sweep-${p.name}-1-scale.png` });
    const overflowScale = await detectOverflow(page);

    // Enter posmode
    await page.click('#posModeBtn');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/sweep-${p.name}-2-posmode.png` });
    const overflowPosmode = await detectOverflow(page);

    // Exit posmode, go to saved tab (if any)
    await page.click('#posModeBtn');
    await page.waitForTimeout(200);
    // register
    await page.click('#registerBtn');
    await page.waitForTimeout(300);
    await page.click('[data-tab="saved"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/sweep-${p.name}-3-saved.png` });
    const overflowSaved = await detectOverflow(page);

    // Open more menu (to see BETA item)
    try {
      await page.click('#moreTrigger');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `/tmp/sweep-${p.name}-4-moremenu.png` });
    } catch {}

    summary.push({ profile: p.name, errors, overflowInitial, overflowScale, overflowPosmode, overflowSaved });
    await browser.close();
  }
  console.log(JSON.stringify(summary, null, 2));
})();
