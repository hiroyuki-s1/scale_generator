/**
 * Playwright E2E 共通ヘルパー
 */

const DEVICES = {
  pc: {
    label: 'PC (Chrome 1280×800)',
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  },
  android: {
    label: 'Android (Chrome 390×844)',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  ios: {
    label: 'iOS Safari (375×812)',
    viewport: { width: 375, height: 812 },
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

async function setup(browser, deviceKey) {
  const device = DEVICES[deviceKey];
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile,
    userAgent: device.userAgent,
  });
  const page = await context.newPage();

  // コンソールエラーを収集
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push(e.message));

  // confirm/alert ダイアログを自動承認 (編集キャンセル・削除確認など)
  // Playwright はデフォルトで dismiss (false) するため accept に変更
  page.on('dialog', dialog => dialog.accept().catch(() => {}));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // アルファ告知を閉じる
  await page.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    try { localStorage.setItem('sg.alphaNoticeDismissed.v1', '1'); } catch {}
  });
  await page.waitForTimeout(200);

  return { page, context, errors, device };
}

async function selectInstrument(page, instrument = 'guitar') {
  await page.click('#instrumentBtn');
  await page.waitForSelector('[data-instrument]', { state: 'visible' });
  await page.click(`[data-instrument="${instrument}"]`);
  await page.waitForTimeout(300);
}

async function registerScale(page, title) {
  if (title) {
    await page.fill('#fbTitleInput', title);
  }
  await page.click('#registerBtn');
  await page.waitForTimeout(300);
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function section(msg) { console.log(`\n--- ${msg} ---`); }

module.exports = { DEVICES, setup, selectInstrument, registerScale, pass, fail, info, section };
