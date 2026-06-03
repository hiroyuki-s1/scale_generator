/**
 * 全レイアウト (1×1 ~ 3×5) で実 PDF を生成し、
 *   - 各ページに「期待枚数」のカードが配置されているか
 *   - 隠れず可視範囲内にあるか
 * を検証する。
 *
 * ユーザー報告: 「1×2 のとき、1Pに1つしかスケールが印刷されない」
 * → グループ DOM 上には 2 枚入っているが、CSS 側で 2 枚目が
 *    用紙外にはみ出している/視認できない可能性を実 PDF で確認する。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT_DIR = path.join(ROOT, 'e2e-results', 'layout-pdf');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// レイアウトプリセット (LAYOUT_PRESETS と同じ)
const LAYOUTS = [
  [1, 1], [1, 2], [2, 1], [2, 2],
  [2, 3], [2, 4], [3, 3], [3, 4], [3, 5],
];

async function setupPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.getElementById('alphaNotice')?.classList.add('hidden');
    try { localStorage.setItem('sg.alphaNoticeDismissed.v1', '1'); } catch {}
  });
  await page.waitForTimeout(150);
  await page.click('#instrumentBtn');
  await page.waitForSelector('[data-instrument]');
  await page.click('[data-instrument="guitar"]');
  await page.waitForTimeout(200);
  return { page, ctx };
}

async function register(page, n) {
  for (let i = 1; i <= n; i++) {
    await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
    await page.waitForTimeout(60);
    await page.fill('#fbTitleInput', `T${i}`);
    await page.click('#registerBtn');
    await page.waitForTimeout(140);
  }
}

async function setLayout(page, cols, rows) {
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(150);
  await page.evaluate(({ c, r }) => {
    for (const b of document.querySelectorAll('#printLayoutGrid [data-cols]')) {
      if (b.dataset.cols === String(c) && b.dataset.rows === String(r)) { b.click(); break; }
    }
  }, { c: cols, r: rows });
  await page.waitForTimeout(80);
  await page.evaluate(() => document.querySelector('#printModal [data-act="cancel"]')?.click());
  await page.waitForTimeout(150);
}

async function measureDom(page) {
  // beforeprint → wrapIntoPageGroups → print media へ
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(250);
  const dom = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.print-page-group')];
    return groups.map((g, i) => {
      const inner = g.querySelector('.print-page-inner');
      const innerRect = inner.getBoundingClientRect();
      const cards = [...g.querySelectorAll('.saved-card')];
      const cs = window.getComputedStyle(inner);
      return {
        index: i,
        groupRect: g.getBoundingClientRect(),
        innerRect: { top: innerRect.top, left: innerRect.left, width: innerRect.width, height: innerRect.height },
        gridCols: cs.gridTemplateColumns,
        gridRows: cs.gridTemplateRows,
        cards: cards.map((c) => {
          const rect = c.getBoundingClientRect();
          const svg = c.querySelector('svg.fb');
          const svgRect = svg?.getBoundingClientRect();
          return {
            top: rect.top, left: rect.left,
            width: rect.width, height: rect.height,
            visible: rect.width > 0 && rect.height > 0,
            svgHeight: svgRect?.height || 0,
            title: c.querySelector('.saved-title-input,.saved-print-title,.fb-title')?.textContent?.trim() || '',
          };
        }),
      };
    });
  });
  return dom;
}

async function restoreScreen(page) {
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(100);
}

async function run() {
  console.log('🦏 全レイアウト × 印刷 PDF 検証\n');
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  let allPass = true;
  try {
    for (const [cols, rows] of LAYOUTS) {
      const perPage = cols * rows;
      const totalCards = perPage + 1; // 端数1枚で複数ページもチェック
      const expectedPages = Math.ceil(totalCards / perPage);
      const label = `${cols}×${rows} (perPage=${perPage}, total=${totalCards}, pages=${expectedPages})`;

      const { page, ctx } = await setupPage(browser);
      try {
        await register(page, totalCards);
        await setLayout(page, cols, rows);
        const dom = await measureDom(page);

        let pass = true;
        const reasons = [];

        if (dom.length !== expectedPages) {
          pass = false;
          reasons.push(`グループ数 ${dom.length} ≠ 期待 ${expectedPages}`);
        }
        // 各グループの中のカード数 = 期待値
        dom.forEach((g, i) => {
          const expectedInGroup = (i === dom.length - 1)
            ? (totalCards - perPage * (dom.length - 1))
            : perPage;
          if (g.cards.length !== expectedInGroup) {
            pass = false;
            reasons.push(`page${i+1}: DOM 上カード数 ${g.cards.length} ≠ 期待 ${expectedInGroup}`);
          }
          // 全カードが innerRect 内に「目に見える形で」配置されているか
          // (CSS の grid-template が破綻して 2 枚目が高さ 0 / 範囲外なら検出)
          g.cards.forEach((c, ci) => {
            if (!c.visible) {
              pass = false;
              reasons.push(`page${i+1} card${ci+1}: width/height = 0 (不可視)`);
            }
            // ページ枠 (innerRect) の下端を超えていないか (はみ出し検出)
            const innerBottom = g.innerRect.top + g.innerRect.height;
            const cardBottom = c.top + c.height;
            if (cardBottom > innerBottom + 2) {
              pass = false;
              reasons.push(`page${i+1} card${ci+1}: 下端 ${cardBottom.toFixed(0)} > ページ内枠下端 ${innerBottom.toFixed(0)} (はみ出し)`);
            }
          });
        });

        // 実 PDF 生成 (見た目検証用)
        await restoreScreen(page);
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        await page.waitForTimeout(150);
        const pdfPath = path.join(OUT_DIR, `${cols}x${rows}.pdf`);
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

        const mark = pass ? '✅' : '❌';
        console.log(`${mark} ${label}`);
        dom.forEach((g, i) => {
          const titles = g.cards.map(c => c.title || '?').join(', ');
          console.log(`    page${i+1}: cards=${g.cards.length} [${titles}]  gridRows=${g.gridRows}`);
        });
        if (!pass) {
          reasons.forEach(r => console.log(`    ❌ ${r}`));
          allPass = false;
        }
        reports.push({ cols, rows, totalCards, expectedPages, pass, reasons, dom });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(`\n${allPass ? '🎉 全レイアウト合格' : '💥 失敗あり'}`);
  console.log(`PDF 出力: ${OUT_DIR}`);
  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e); process.exit(2); });
