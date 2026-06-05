/* Verify: posmode hides dots in editor (opacity .25) but completely hides
 * them in saved-card (.saved-card .fb-dot-hidden { display: none }).
 * Strategy: enter posmode → tap dots in editor → register the scale to
 * saved tab → switch to saved tab → check that the corresponding dots in the
 * saved card are NOT rendered (display:none), while in editor they ARE
 * rendered but faded.
 */
const path = require('path');
const { devices, webkit } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const BASE = process.env.BASE_URL || 'http://localhost:4173/';

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  try { await page.click('#alphaNoticeClose', { timeout: 1500 }); } catch {}
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

  // posmode → tap a few dots
  await page.click('#posModeBtn');
  await page.waitForTimeout(400);
  const targets = await page.evaluate(() => {
    const wrap = document.getElementById('editFbWrap');
    const wr = wrap.getBoundingClientRect();
    const seen = new Set();
    const out = [];
    document.querySelectorAll('#fretboard circle[data-pos-key]').forEach(c => {
      const k = c.getAttribute('data-pos-key');
      if (seen.has(k)) return;
      const r = c.getBoundingClientRect();
      if (r.width === 0) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx > wr.left + 30 && cx < wr.right - 30 && cy > wr.top + 15 && cy < wr.bottom - 15) {
        seen.add(k); out.push({ key: k, x: cx, y: cy });
      }
    });
    return out.slice(0, 6);
  });
  for (const t of targets) {
    await page.touchscreen.tap(t.x, t.y);
    await page.waitForTimeout(80);
  }
  const hiddenKeys = targets.map(t => t.key);
  console.log('hidden keys:', hiddenKeys);

  // Editor: check computed opacity of one hidden dot
  const editorOpacity = await page.evaluate((key) => {
    const c = document.querySelector(`#fretboard circle[data-pos-key="${key}"].fb-dot-hidden`);
    if (!c) return null;
    return { opacity: getComputedStyle(c).opacity, display: getComputedStyle(c).display };
  }, hiddenKeys[0]);
  console.log('editor hidden dot:', editorOpacity, '(expect opacity ~0.25, display !== none)');

  // Turn off posmode (otherwise the register UI may be hidden) and register
  await page.click('#posModeBtn');
  await page.waitForTimeout(200);
  await page.click('#registerBtn');
  await page.waitForTimeout(400);

  // Switch to saved tab (ソングファイル)
  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(600);

  // Check the saved card's same key dots
  const savedState = await page.evaluate((key) => {
    const cards = document.querySelectorAll('.saved-card');
    if (!cards.length) return { error: 'no saved cards' };
    const card = cards[cards.length - 1]; // most recent
    const dots = card.querySelectorAll(`circle[data-pos-key="${key}"]`);
    if (!dots.length) return { error: 'no matching dots in saved card', key };
    const states = [...dots].map(d => ({
      tag: d.tagName,
      hasHiddenCls: d.classList.contains('fb-dot-hidden'),
      display: getComputedStyle(d).display,
      opacity: getComputedStyle(d).opacity,
    }));
    return { count: dots.length, states };
  }, hiddenKeys[0]);
  console.log('saved card hidden dot:', savedState, '(expect display:none)');

  // Take screenshots
  const editorBox = await page.$eval('#panelSaved', el => {
    const r = el.getBoundingClientRect();
    return { x: 0, y: r.top, width: 390, height: Math.min(r.height, 600) };
  });
  await page.screenshot({ path: '/tmp/saved-tab-after-hide.png', clip: editorBox });

  await browser.close();
})();
