/* posmode tap reproduction across Desktop / iOS / Android.
 *
 * Verifies the actual user complaint: tapping a dot in posmode should toggle
 * `fb-dot-hidden` on that dot. Runs on:
 *   - Desktop chromium (mouse click)
 *   - iPhone (webkit, touchscreen)
 *   - Pixel 5 (chromium, touchscreen)
 *
 * Usage: node e2e/posmode-tap-repro.cjs
 * (assumes `npm run build` already produced dist/ and `npm run preview` is up on :4173)
 */
const path = require('path');
const playwright = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const { devices, chromium, webkit } = playwright;

const BASE = process.env.BASE_URL || 'http://localhost:4173/';

const PROFILES = [
  { name: 'desktop-chromium', browser: chromium, ctxOpts: { viewport: { width: 1280, height: 800 } }, useTap: false },
  { name: 'iphone-webkit',    browser: webkit,   ctxOpts: { ...devices['iPhone 13'] },              useTap: true  },
  { name: 'pixel-chromium',   browser: chromium, ctxOpts: { ...devices['Pixel 5'] },               useTap: true  },
];

async function dismissAlpha(page) {
  try {
    await page.waitForSelector('#alphaNoticeClose', { timeout: 1500 });
    await page.click('#alphaNoticeClose');
  } catch { /* noop */ }
}

async function pickGuitarAndMajorPenta(page) {
  await page.click('#instrumentBtn');
  await page.waitForSelector('.instr-choice-btn[data-instrument="guitar"]', { state: 'visible' });
  await page.click('.instr-choice-btn[data-instrument="guitar"]');

  await page.click('#scalePickerBtn');
  await page.waitForSelector('#scaleCatList', { state: 'visible' });
  // pick first category, first preset
  const cats = await page.$$('#scaleCatList button, #scaleCatList [data-cat]');
  if (cats.length) await cats[0].click();
  await page.waitForTimeout(150);
  const names = await page.$$('#scaleNameList button');
  if (names.length) await names[0].click();
  await page.waitForFunction(
    () => document.querySelectorAll('#fretboard [data-pos-key]').length > 0,
    null, { timeout: 4000 },
  );
}

async function runProfile(profile) {
  const browser = await profile.browser.launch({ headless: true });
  const ctx = await browser.newContext(profile.ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await dismissAlpha(page);
  await pickGuitarAndMajorPenta(page);

  // Wait for dotPop animation to finish (delay per fret + 300ms duration)
  await page.waitForTimeout(1500);

  // Open posmode
  await page.click('#posModeBtn');
  await page.waitForTimeout(300);
  const posOn = await page.$eval('#posModeBtn', el => el.getAttribute('aria-pressed') === 'true');

  // Inspect environment: mobileZoomed state, fb-wrap.posmode class, viewport
  const env = await page.evaluate(() => ({
    posmodeClass: document.getElementById('editFbWrap').classList.contains('posmode'),
    wrapWidth: document.getElementById('editFbWrap').clientWidth,
    fbWidth: document.getElementById('fretboard').getBoundingClientRect().width,
    dotCount: document.querySelectorAll('#fretboard [data-pos-key]').length,
    visibleDots: document.querySelectorAll('#fretboard circle[data-pos-key]:not(.fb-dot-hidden)').length,
  }));

  // Pick a visible dot whose bounding rect is nonzero (animation finished),
  // AND whose center is currently within the viewport (visible without scroll).
  const dotInfo = await page.evaluate(() => {
    const wrap = document.getElementById('editFbWrap');
    const wr = wrap.getBoundingClientRect();
    const dots = [...document.querySelectorAll('#fretboard circle[data-pos-key]')];
    for (const c of dots) {
      const r = c.getBoundingClientRect();
      if (r.width === 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < wr.left + 8 || cx > wr.right - 8) continue;
      if (cy < wr.top + 8 || cy > wr.bottom - 8) continue;
      return {
        key: c.getAttribute('data-pos-key'),
        x: cx, y: cy,
        hiddenBefore: c.classList.contains('fb-dot-hidden'),
      };
    }
    return null;
  });

  let tapped = false, tapError = null;
  if (dotInfo) {
    try {
      if (profile.useTap) {
        await page.touchscreen.tap(dotInfo.x, dotInfo.y);
      } else {
        await page.mouse.click(dotInfo.x, dotInfo.y);
      }
      tapped = true;
    } catch (e) {
      tapError = e.message;
    }
  }

  await page.waitForTimeout(200);

  const after = await page.evaluate((key) => {
    // pick any circle with this data-pos-key (there are up to 3 per position)
    const dots = document.querySelectorAll(`#fretboard [data-pos-key="${key}"]`);
    const states = [];
    dots.forEach(d => states.push({ tag: d.tagName, hidden: d.classList.contains('fb-dot-hidden') }));
    return {
      states,
      anyHidden: [...dots].some(d => d.classList.contains('fb-dot-hidden')),
    };
  }, dotInfo ? dotInfo.key : 'none');

  const toggled = dotInfo && (dotInfo.hiddenBefore !== after.anyHidden);

  console.log(`\n=== ${profile.name} ===`);
  console.log('  posOn       :', posOn);
  console.log('  env         :', env);
  console.log('  dotInfo     :', dotInfo);
  console.log('  tapped      :', tapped, tapError || '');
  console.log('  after.anyHidden:', after.anyHidden);
  console.log('  toggled (PASS=true):', toggled);
  if (errors.length) console.log('  errors      :', errors);

  await browser.close();
  return { profile: profile.name, posOn, toggled, env, errors };
}

(async () => {
  const results = [];
  for (const p of PROFILES) {
    try { results.push(await runProfile(p)); }
    catch (e) { console.log(`[${p.name}] EXCEPTION: ${e.message}`); results.push({ profile: p.name, toggled: false, error: e.message }); }
  }
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`${r.toggled ? 'PASS' : 'FAIL'} ${r.profile}`);
  }
  process.exit(results.every(r => r.toggled) ? 0 : 1);
})();
