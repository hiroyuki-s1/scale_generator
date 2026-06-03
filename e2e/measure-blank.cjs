/**
 * 印刷時に「高さを持つ全要素」を洗い出し、空白ページの原因を特定する。
 * 4枚(2×2でちょうど1ページ)で印刷し、body全体が1ページに収まるか確認。
 */
const { chromium } = require('playwright');
const { setup } = require('./helpers.cjs');

const PX_PER_MM = 96 / 25.4;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page } = await setup(browser, 'ios');

  await page.click('#instrumentBtn');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(300);

  // ちょうど4枚 (2×2で1ページ)
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(100);
    await page.fill('#fbTitleInput', `テスト${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(200);
  }

  // レイアウト 2×2
  await page.evaluate(() => {
    document.getElementById('printBtn')?.click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('#printLayoutGrid [data-cols]')) {
      if (btn.dataset.cols === '2' && btn.dataset.rows === '2') { btn.click(); break; }
    }
    document.querySelector('#printModal [data-act="cancel"]')?.click();
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const report = await page.evaluate(() => {
    const PX_PER_MM = 96 / 25.4;
    const pageHmm = 277; // portrait 印刷可能高さ
    const pageHpx = pageHmm * PX_PER_MM;

    // 印刷時に高さを持つ全要素 (深さ問わず)
    const all = [...document.body.querySelectorAll('*')];
    const visible = all.filter(el => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.height > 1;
    });

    // bottom が最も下にある要素 top10
    const withRect = visible.map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 40),
        id: el.id || '',
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
      };
    }).sort((a, b) => b.bottom - a.bottom);

    const bodyRect = document.body.getBoundingClientRect();
    const bodyScrollH = document.body.scrollHeight;
    const htmlScrollH = document.documentElement.scrollHeight;

    return {
      pageHpx: Math.round(pageHpx),
      pageHmm,
      bodyHeight: Math.round(bodyRect.height),
      bodyScrollH,
      htmlScrollH,
      estimatedPages: (htmlScrollH / pageHpx).toFixed(2),
      bottomElements: withRect.slice(0, 12),
    };
  });

  console.log('=== 印刷時 body 高さ診断 (4枚, 2×2, portrait) ===\n');
  console.log(`1ページ高さ: ${report.pageHpx}px (${report.pageHmm}mm)`);
  console.log(`body.scrollHeight: ${report.bodyScrollH}px`);
  console.log(`html.scrollHeight: ${report.htmlScrollH}px`);
  console.log(`推定ページ数: ${report.estimatedPages} ページ`);
  console.log(`  → 4枚は2×2で1ページに収まるべき。1.0前後なら正常、2.0前後なら空白ページの原因あり\n`);
  console.log('=== 最も下にある要素 top12 (空白の犯人候補) ===');
  report.bottomElements.forEach((e, i) => {
    const overPage = e.bottom > report.pageHpx;
    console.log(`  ${i+1}. <${e.tag}${e.id?'#'+e.id:''}.${e.cls}> bottom=${e.bottom}px height=${e.height}px ${overPage?'⚠️ 1ページ超':''}`);
  });

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
