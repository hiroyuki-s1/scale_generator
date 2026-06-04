/**
 * 「お気に入りへ追加」ボタンの表示と各プラットフォーム挙動を実ブラウザで確認。
 *
 * シナリオ:
 *  - PC Chromium: ボタンが存在し、クリックでブックマーク案内モーダルが開く
 *  - Android Chromium: ボタンが存在し、beforeinstallprompt が無いとフォールバックモーダル
 *  - iOS WebKit: ボタンクリックで「ホーム画面に追加」手順モーダル
 *
 * フッタ並びも検証: お気に入りへ追加 → ご意見・バグ報告 → 作者：シモーネ
 */
const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'e2e-results');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function setup(browser, viewport, ua) {
  const ctx = await browser.newContext({ viewport, userAgent: ua, isMobile: viewport.width < 600 });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    try { localStorage.setItem('sg.alphaNoticeDismissed.v1', '1'); } catch {}
  });
  return { page, ctx };
}

async function checkFooterOrder(page) {
  const order = await page.evaluate(() => {
    const footer = document.querySelector('.editor-footer');
    if (!footer) return null;
    return [...footer.children].map(el => {
      if (el.id === 'installBtn') return 'install';
      if (el.classList.contains('feedback-link')) return 'feedback';
      if (el.classList.contains('author-link')) return 'author';
      if (el.classList.contains('build-ver')) return 'buildver';
      return 'other:' + el.tagName;
    });
  });
  return order;
}

async function run() {
  console.log('🦏 お気に入りへ追加 — 実ブラウザ検証\n');
  const reports = [];
  let allPass = true;

  // ── 1. PC Chromium (Desktop) ─────────────────────────────────────────
  {
    const browser = await chromium.launch({ headless: true });
    const { page, ctx } = await setup(browser, { width: 1280, height: 800 },
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    const order = await checkFooterOrder(page);
    console.log('PC Chromium footer 並び:', order);
    const expected = ['install', 'feedback', 'author', 'buildver'];
    const orderOK = order && expected.every((e, i) => order[i] === e);
    await page.click('#installBtn');
    await page.waitForTimeout(150);
    const modalState = await page.evaluate(() => {
      const m = document.getElementById('installModal');
      return {
        visible: !m.classList.contains('hidden'),
        title: m.querySelector('.install-modal-title')?.textContent || '',
        body:  m.querySelector('.install-modal-body-text')?.innerHTML || '',
      };
    });
    const pcOK = orderOK && modalState.visible && /ブックマーク|Ctrl|⌘/.test(modalState.body);
    console.log(pcOK ? '✅ PC: 並び + Desktop モーダル' : '❌ PC: 失敗', JSON.stringify(modalState, null, 2));
    if (!pcOK) allPass = false;
    await page.screenshot({ path: path.join(OUT, 'install-pc.png'), fullPage: false });
    reports.push({ platform: 'pc-chromium', orderOK, modalState, pass: pcOK });
    await ctx.close(); await browser.close();
  }

  // ── 2. Android Chromium ───────────────────────────────────────────────
  {
    const browser = await chromium.launch({ headless: true });
    const { page, ctx } = await setup(browser, { width: 390, height: 844 },
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
    await page.click('#installBtn');
    await page.waitForTimeout(150);
    const modalState = await page.evaluate(() => {
      const m = document.getElementById('installModal');
      return {
        visible: !m.classList.contains('hidden'),
        title: m.querySelector('.install-modal-title')?.textContent || '',
        body:  m.querySelector('.install-modal-body-text')?.innerHTML || '',
      };
    });
    const androidOK = modalState.visible && /ホーム画面に追加|Chrome/.test(modalState.body);
    console.log(androidOK ? '✅ Android: フォールバックモーダル' : '❌ Android: 失敗', JSON.stringify(modalState, null, 2));
    if (!androidOK) allPass = false;
    await page.screenshot({ path: path.join(OUT, 'install-android.png'), fullPage: false });
    reports.push({ platform: 'android', modalState, pass: androidOK });
    await ctx.close(); await browser.close();
  }

  // ── 3. iOS WebKit (Safari) ────────────────────────────────────────────
  {
    const browser = await webkit.launch({ headless: true });
    const { page, ctx } = await setup(browser, { width: 393, height: 852 },
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    await page.click('#installBtn');
    await page.waitForTimeout(150);
    const modalState = await page.evaluate(() => {
      const m = document.getElementById('installModal');
      return {
        visible: !m.classList.contains('hidden'),
        title: m.querySelector('.install-modal-title')?.textContent || '',
        body:  m.querySelector('.install-modal-body-text')?.innerHTML || '',
      };
    });
    const iosOK = modalState.visible && /共有ボタン/.test(modalState.body) && /ホーム画面に追加/.test(modalState.body);
    console.log(iosOK ? '✅ iOS Safari: 手順モーダル' : '❌ iOS Safari: 失敗', JSON.stringify(modalState, null, 2));
    if (!iosOK) allPass = false;
    await page.screenshot({ path: path.join(OUT, 'install-ios.png'), fullPage: false });
    reports.push({ platform: 'ios-safari', modalState, pass: iosOK });
    await ctx.close(); await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'install-prompt-report.json'), JSON.stringify(reports, null, 2));
  console.log(`\n${allPass ? '🎉 全プラットフォーム合格' : '💥 失敗あり'}`);
  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e); process.exit(2); });
