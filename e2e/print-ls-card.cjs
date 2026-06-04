const { chromium } = require('playwright');
async function main() {
  const b = await chromium.launch({ headless: true });
  // 横 viewport (iPhone landscape) で 100vh と orientation media query を横に
  const ctx = await b.newContext({ viewport:{width:852,height:393}, isMobile:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  p.on('dialog', d=>d.accept().catch(()=>{}));
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
  await p.evaluate(()=>{document.getElementById('alphaNotice')?.classList.add('hidden')});
  await p.evaluate(()=>document.getElementById('instrumentBtn').click());
  await p.waitForTimeout(300);
  await p.evaluate(()=>document.querySelector('[data-instrument="guitar"]').click());
  await p.waitForTimeout(300);
  await p.fill('#fbTitleInput','テストスケール');
  await p.evaluate(()=>document.getElementById('registerBtn').click());
  await p.waitForTimeout(300);
  await p.evaluate(()=>document.getElementById('printBtn').click());
  await p.waitForTimeout(120);
  await p.evaluate(()=>{for(const x of document.querySelectorAll('#printLayoutGrid [data-cols]'))if(x.dataset.cols==='1'&&x.dataset.rows==='1'){x.click();break;}});
  await p.waitForTimeout(80);
  await p.evaluate(()=>document.querySelector('#printModal [data-act="cancel"]')?.click());
  await p.waitForTimeout(120);
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  await p.waitForTimeout(200);
  await p.pdf({ path:'/tmp/ls_card.pdf', format:'A4', landscape:true, printBackground:true });
  await b.close();
  const { execSync } = require('child_process');
  console.log('1スケール 1×1 横印刷:', execSync('pdfinfo /tmp/ls_card.pdf 2>/dev/null | grep Pages').toString().trim());
}
main().catch(e=>{console.error(e);process.exit(1)});
