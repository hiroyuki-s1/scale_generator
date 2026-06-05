/* MVP-0 feature verification in a real browser (Playwright).
 * Run against the production build served by `vite preview --port 4173`.
 *   node e2e/mvp0-verify.cjs            # chromium
 *   BROWSER=webkit node e2e/mvp0-verify.cjs
 */
const path = require('path');
const playwright = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const BROWSER = process.env.BROWSER || 'chromium';
const SHOT = (n) => `/tmp/mvp0-${BROWSER}-${n}.png`;

const results = {};
const consoleErrors = [];

function ok(name, pass, evidence) {
  results[name] = { pass, evidence };
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name} :: ${evidence}`);
}

async function dismissAlpha(page) {
  try {
    await page.waitForSelector('#alphaNoticeClose', { timeout: 2000 });
    await page.click('#alphaNoticeClose');
  } catch { /* modal may not appear */ }
}

async function selectInstrument(page) {
  await page.click('#instrumentBtn');
  await page.waitForSelector('#instrumentModal .instr-choice-btn[data-instrument="guitar"]', { state: 'visible' });
  await page.click('.instr-choice-btn[data-instrument="guitar"]');
}

async function pickPreset(page, catIndex, presetName) {
  await page.click('#scalePickerBtn');
  await page.waitForSelector('#scaleCatList', { state: 'visible' });
  // click a category by index
  const cats = await page.$$('#scaleCatList *');
  // category list items are buttons; click the requested one
  const catBtns = await page.$$('#scaleCatList button, #scaleCatList li, #scaleCatList [data-cat]');
  const useCats = catBtns.length ? catBtns : cats;
  await useCats[Math.min(catIndex, useCats.length - 1)].click();
  await page.waitForTimeout(150);
  // pick preset by visible text (fallback: first preset). Use real buttons only.
  const names = await page.$$('#scaleNameList button');
  // English presetName -> Japanese label mapping for matching (app localizes names)
  const jpAlias = { 'major penta': 'メジャーペンタ' };
  const want = presetName ? presetName.toLowerCase() : '';
  const wantJp = jpAlias[want];
  let clicked = false;
  for (const el of names) {
    const t = (await el.innerText().catch(() => '')).trim();
    const lt = t.toLowerCase();
    if (want && (lt.includes(want) || (wantJp && t.includes(wantJp)))) {
      await el.click(); clicked = true; break;
    }
  }
  if (!clicked && names.length) { await names[0].click(); clicked = true; }
  // dots render shortly after applyPreset closes the modal
  await page.waitForFunction(
    () => document.querySelectorAll('#fretboard [data-pos-key]').length > 0,
    null, { timeout: 4000 },
  ).catch(() => {});
  return clicked;
}

async function dotCount(page) {
  return page.$$eval('#fretboard .fb-dot', els => els.length).catch(() => 0);
}

async function main() {
  const browserType = playwright[BROWSER];
  const browser = await browserType.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await dismissAlpha(page);

  // ---- TEST 1: RELEASE NOTES ----
  try {
    await page.click('#moreTrigger');
    await page.waitForSelector('[data-act="release-notes"]', { state: 'visible', timeout: 3000 });
    await page.click('[data-act="release-notes"]');
    await page.waitForTimeout(400);
    const hasShow = await page.$eval('#releaseNotesModal', m => m.classList.contains('show'));
    const items = await page.$$eval('#releaseNotesList .release-note-item', els =>
      els.map(e => e.textContent.trim()));
    const versions = await page.$$eval('#releaseNotesList .release-note-version', els =>
      els.map(e => e.textContent.trim()));
    const hasV101 = versions.some(v => v.includes('v1.0.1'));
    await page.screenshot({ path: SHOT('1-release-notes') });
    ok('1-release-notes', hasShow && items.length >= 1 && hasV101,
      `show=${hasShow} items=${items.length} versions=[${versions.join(', ')}]`);
    // close
    await page.click('#releaseNotesModal [data-act="close"]').catch(() => {});
    await page.waitForTimeout(150);
  } catch (e) {
    ok('1-release-notes', false, 'error: ' + e.message);
  }

  // ---- Select instrument + load a scale into the editor (NOT yet registered) ----
  // Registering (new mode) clears the editor + jumps to saved tab, so do the
  // position test FIRST on the live editor scale, then register for tests 2 & 4.
  await selectInstrument(page);
  const picked1 = await pickPreset(page, 0, 'Major Penta');
  const dots1 = await dotCount(page);

  // ---- TEST 3: POSITION VISIBILITY (editor tab, scale loaded, before register) ----
  try {
    // ensure on editor tab
    await page.click('.tab-btn[data-tab="editor"]').catch(() => {});
    await page.waitForTimeout(150);
    await page.click('#posModeBtn');
    const active = await page.$eval('#posModeBtn', b => b.classList.contains('active'));
    const before = await page.$$eval('#fretboard .fb-dot-hidden', e => e.length);
    // click first dot with data-pos-key
    const firstKey = await page.$eval('#fretboard [data-pos-key]', el => el.getAttribute('data-pos-key')).catch(() => null);
    let afterHidden = before, resetHidden = -1;
    if (firstKey) {
      await page.evaluate(k => {
        const el = document.querySelector(`#fretboard [data-pos-key="${CSS.escape(k)}"]`);
        el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, firstKey);
      await page.waitForTimeout(250);
      afterHidden = await page.$$eval('#fretboard .fb-dot-hidden', e => e.length);
      await page.click('#posResetBtn');
      await page.waitForTimeout(250);
      resetHidden = await page.$$eval('#fretboard .fb-dot-hidden', e => e.length);
    }
    await page.screenshot({ path: SHOT('3-position') });
    ok('3-position-visibility',
      active && firstKey && afterHidden > before && resetHidden === 0,
      `active=${active} key=${firstKey} hiddenBefore=${before} hiddenAfterToggle=${afterHidden} hiddenAfterReset=${resetHidden}`);
    // turn pos mode off
    if (active) { await page.click('#posModeBtn').catch(() => {}); }
  } catch (e) {
    ok('3-position-visibility', false, 'error: ' + e.message);
  }

  // ---- Now register the editor scale (needed for tests 2 & 4) ----
  await page.click('.tab-btn[data-tab="editor"]').catch(() => {});
  await page.waitForTimeout(150);
  await page.click('#registerBtn');
  await page.waitForTimeout(400);

  // ---- TEST 2: IMAGE EXPORT (canvas rasterization on saved card) ----
  try {
    await page.click('.tab-btn[data-tab="saved"]');
    await page.waitForSelector('#savedGrid svg.fb', { timeout: 4000 });
    // hook anchor.click to capture blob href + download filename
    await page.evaluate(() => {
      window.__capture = null;
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download && this.href && this.href.startsWith('blob:')) {
          window.__capture = { href: this.href, download: this.download };
          return; // swallow the real navigation/download
        }
        return orig.apply(this, arguments);
      };
    });
    await page.click('#savedGrid .btn-image-saved');
    // wait for capture
    await page.waitForFunction(() => window.__capture && window.__capture.href, null, { timeout: 8000 });
    const analysis = await page.evaluate(async () => {
      const cap = window.__capture;
      const resp = await fetch(cap.href);
      const buf = new Uint8Array(await resp.arrayBuffer());
      const sig = [buf[0], buf[1], buf[2], buf[3]];
      const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
      // decode into canvas to inspect pixels
      const blob = new Blob([buf], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, c.width, c.height).data;
      let nonWhite = 0, sampled = 0;
      // sample a grid of pixels
      const stepX = Math.max(1, Math.floor(c.width / 120));
      const stepY = Math.max(1, Math.floor(c.height / 120));
      for (let y = 0; y < c.height; y += stepY) {
        for (let x = 0; x < c.width; x += stepX) {
          const i = (y * c.width + x) * 4;
          sampled++;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (!(r > 245 && g > 245 && b > 245)) nonWhite++;
        }
      }
      URL.revokeObjectURL(url);
      return {
        byteLength: buf.length, isPng, sig, download: cap.download,
        w: c.width, h: c.height, sampled, nonWhite,
      };
    });
    await page.screenshot({ path: SHOT('2-image-card') });
    const pass = analysis.isPng && analysis.download.endsWith('.png')
      && analysis.byteLength > 2000 && analysis.nonWhite > 0;
    ok('2-image-export', pass,
      `isPng=${analysis.isPng} sig=[${analysis.sig.map(b => '0x' + b.toString(16)).join(',')}] `
      + `bytes=${analysis.byteLength} file="${analysis.download}" size=${analysis.w}x${analysis.h} `
      + `nonWhite=${analysis.nonWhite}/${analysis.sampled} sampled`);
  } catch (e) {
    ok('2-image-export', false, 'error: ' + e.message);
  }

  // ---- TEST 4: DEGREE COLORS PER-SCALE ----
  try {
    // register a SECOND scale (different preset)
    await page.click('.tab-btn[data-tab="editor"]');
    await page.waitForTimeout(150);
    await pickPreset(page, 1, '');  // a different category's first preset
    await page.click('#registerBtn');
    await page.waitForTimeout(300);

    await page.click('.tab-btn[data-tab="saved"]');
    await page.waitForSelector('#savedGrid svg.fb', { timeout: 4000 });
    const cardCount = await page.$$eval('#savedGrid .saved-card, #savedGrid > *', () =>
      document.querySelectorAll('#savedGrid svg.fb').length);

    // header color modal edits EDITOR scale only -> open & verify title is generic
    await page.click('#colorBtn');
    await page.waitForSelector('#colorModal.show', { timeout: 3000 });
    const editorTitle = await page.$eval('#colorModalTitle', e => e.textContent.trim());
    // bulk button exists & enabled (>=1 saved)
    const bulkExists = await page.$('#colorBulkApplyBtn') != null;
    const bulkDisabled = await page.$eval('#colorBulkApplyBtn', b => b.disabled);
    await page.click('#colorModal [data-act="close"], #colorModal .modal-close').catch(async () => {
      await page.keyboard.press('Escape');
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // capture per-card dot fill/stroke signatures BEFORE change
    const sigBefore = await page.$$eval('#savedGrid svg.fb', svgs =>
      svgs.map(svg => Array.from(svg.querySelectorAll('.fb-dot')).map(d =>
        (d.getAttribute('fill') || '') + '|' + (d.getAttribute('stroke') || '')).join(';')));

    // open color modal for FIRST saved card
    await page.click('#savedGrid .btn-color-saved');
    await page.waitForSelector('#colorModal.show', { timeout: 3000 });
    const savedTitle = await page.$eval('#colorModalTitle', e => e.textContent.trim());
    // change a color chip: pick a non-active chip in the first palette row
    const changed = await page.evaluate(() => {
      const rows = document.querySelectorAll('#colorList .color-palette-row');
      if (!rows.length) return false;
      const chips = rows[0].querySelectorAll('.color-chip');
      // click a chip that is not currently active
      for (const c of chips) {
        if (!c.classList.contains('active')) { c.click(); return true; }
      }
      return false;
    });
    await page.waitForTimeout(300);
    // close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    const sigAfter = await page.$$eval('#savedGrid svg.fb', svgs =>
      svgs.map(svg => Array.from(svg.querySelectorAll('.fb-dot')).map(d =>
        (d.getAttribute('fill') || '') + '|' + (d.getAttribute('stroke') || '')).join(';')));

    const changedCards = sigBefore.map((s, i) => s !== sigAfter[i]);
    const onlyOneChanged = changedCards.filter(Boolean).length === 1;

    await page.screenshot({ path: SHOT('4-colors') });
    const titleHasName = savedTitle.includes('—') && savedTitle.length > '度数カラー設定'.length;
    const pass = editorTitle === '度数カラー設定' && bulkExists && !bulkDisabled
      && titleHasName && changed && onlyOneChanged;
    ok('4-degree-colors-per-scale', pass,
      `cards=${cardCount} editorTitle="${editorTitle}" savedTitle="${savedTitle}" `
      + `bulkExists=${bulkExists} bulkEnabled=${!bulkDisabled} chipChanged=${changed} `
      + `cardsChanged=[${changedCards.join(',')}] onlyOneChanged=${onlyOneChanged}`);
  } catch (e) {
    ok('4-degree-colors-per-scale', false, 'error: ' + e.message);
  }

  await browser.close();

  // ---- SUMMARY ----
  console.log('\n===== SUMMARY (' + BROWSER + ') =====');
  let allPass = true;
  for (const [k, v] of Object.entries(results)) {
    if (!v.pass) allPass = false;
    console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${k}`);
  }
  if (consoleErrors.length) {
    console.log('\nConsole/page errors (' + consoleErrors.length + '):');
    consoleErrors.slice(0, 20).forEach(e => console.log('  - ' + e));
  } else {
    console.log('\nNo console/page errors.');
  }
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
