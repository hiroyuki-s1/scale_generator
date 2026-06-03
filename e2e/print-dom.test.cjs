/**
 * 印刷DOM構造を直接検証するテスト
 * スケール登録せず、直接DOM操作でsavedCardを注入して確認
 */
const { chromium } = require('playwright');

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  const page = await context.newPage();

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // アルファ告知を閉じてsavedGridにダミーカードを直接注入
  const result = await page.evaluate(() => {
    // 告知を閉じる
    document.getElementById('alphaNotice')?.classList.add('hidden');

    // savedGrid を表示させる
    const panelSaved = document.getElementById('panelSaved');
    panelSaved.classList.remove('hidden');
    document.getElementById('panelEditor').classList.add('hidden');

    // ダミーカードを3枚注入
    const grid = document.getElementById('savedGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
      const card = document.createElement('div');
      card.className = 'saved-card';
      card.textContent = `テストカード${i}`;
      card.style.height = '50px';
      card.style.border = '1px solid red';
      grid.appendChild(card);
    }

    // store layout を確認
    const layoutTriggerLabel = document.getElementById('layoutTriggerLabel');
    return { layoutLabel: layoutTriggerLabel?.textContent, cardCount: grid.querySelectorAll('.saved-card').length };
  });
  console.log('初期状態:', JSON.stringify(result));

  // layout を 1×2 に変更
  await page.evaluate(() => {
    document.getElementById('layoutTrigger')?.click();
    setTimeout(() => {
      for (const btn of document.querySelectorAll('[data-cols]')) {
        if (btn.dataset.cols === '1' && btn.dataset.rows === '2') { btn.click(); break; }
      }
    }, 100);
  });
  await page.waitForTimeout(300);

  // beforeprint を発火
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(500);

  // @media print を適用して検証
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const check = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.print-page-group')];
    const inners = [...document.querySelectorAll('.print-page-inner')];
    const panelSaved = document.getElementById('panelSaved');
    const savedGrid = document.getElementById('savedGrid');

    return {
      groupCount: groups.length,
      innerCount: inners.length,
      panelSavedDisplay: getComputedStyle(panelSaved).display,
      savedGridDisplay: getComputedStyle(savedGrid).display,
      groupDetails: groups.map((g, i) => {
        const s = getComputedStyle(g);
        const innerEl = g.querySelector('.print-page-inner');
        const innerS = innerEl ? getComputedStyle(innerEl) : null;
        return {
          index: i,
          outerDisplay: s.display,
          pageBreakAfter: s.pageBreakAfter,
          breakAfter: s.breakAfter,
          cardCount: g.querySelectorAll('.saved-card').length,
          innerDisplay: innerS?.display,
        };
      }),
    };
  });

  console.log('\n=== @media print 適用後 ===');
  console.log(`#panelSaved: ${check.panelSavedDisplay}`, check.panelSavedDisplay === 'block' ? '✅' : '❌ (block必須)');
  console.log(`#savedGrid: ${check.savedGridDisplay}`, check.savedGridDisplay === 'block' ? '✅' : '❌');
  console.log(`.print-page-group数: ${check.groupCount}`, check.groupCount === 2 ? '✅' : `❌ (期待2)`);
  console.log(`.print-page-inner数: ${check.innerCount}`, check.innerCount === 2 ? '✅' : `❌ (期待2)`);
  check.groupDetails.forEach(g => {
    const isLast = g.index === check.groupCount - 1;
    console.log(`  group${g.index+1}: display=${g.outerDisplay} pageBreakAfter=${g.pageBreakAfter} breakAfter=${g.breakAfter} cards=${g.cardCount} innerDisplay=${g.innerDisplay}${isLast?' [last-child]':''}`);
  });

  const ok = check.panelSavedDisplay === 'block'
    && check.savedGridDisplay === 'block'
    && check.groupCount === 2
    && check.innerCount === 2;

  console.log(ok ? '\n✅ DOM構造は正しい' : '\n❌ DOM構造に問題あり');

  await browser.close();
  process.exit(ok ? 0 : 1);
}
runTest().catch(e => { console.error(e); process.exit(1); });
