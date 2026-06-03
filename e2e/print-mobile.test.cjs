const { chromium } = require('playwright');

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // アルファ告知を閉じる
  await page.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    try { localStorage.setItem('sg.alphaNoticeDismissed.v1', '1'); } catch {}
  });

  // 楽器選択
  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);

  // スケール3枚登録
  for (let i = 1; i <= 3; i++) {
    await page.fill('#fbTitleInput', `テストスケール${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(200);
  }

  // レイアウト1×2を設定
  await page.evaluate(() => {
    document.getElementById('layoutTrigger')?.click();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('[data-cols]')) {
      if (btn.dataset.cols === '1' && btn.dataset.rows === '2') { btn.click(); break; }
    }
  });
  await page.waitForTimeout(200);

  // beforeprint を発火
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(300);

  // @media print 適用
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.print-page-group')];
    const panelSaved = document.getElementById('panelSaved');
    const savedGrid = document.getElementById('savedGrid');
    return {
      pageGroupCount: groups.length,
      pageInnerCount: document.querySelectorAll('.print-page-inner').length,
      panelSavedDisplay: getComputedStyle(panelSaved).display,
      savedGridDisplay: getComputedStyle(savedGrid).display,
      groupStyles: groups.map((g, i) => {
        const s = getComputedStyle(g);
        return { i, display: s.display, pageBreakAfter: s.pageBreakAfter, breakAfter: s.breakAfter, cards: g.querySelectorAll('.saved-card').length };
      }),
    };
  });

  console.log('=== 結果 ===');
  console.log('#panelSaved display:', result.panelSavedDisplay, result.panelSavedDisplay === 'block' ? '✅' : '❌');
  console.log('#savedGrid display:', result.savedGridDisplay, result.savedGridDisplay === 'block' ? '✅' : '❌');
  console.log('.print-page-group 数:', result.pageGroupCount, result.pageGroupCount === 2 ? '✅' : '❌(期待2)');
  result.groupStyles.forEach(g => {
    console.log(`  グループ${g.i+1}: display=${g.display} pageBreakAfter=${g.pageBreakAfter} cards=${g.cards}`);
  });

  const ok = result.panelSavedDisplay === 'block' && result.savedGridDisplay === 'block' && result.pageGroupCount === 2;
  console.log(ok ? '\n✅ OK' : '\n❌ NG');
  await browser.close();
  process.exit(ok ? 0 : 1);
}
runTest().catch(e => { console.error(e); process.exit(1); });
