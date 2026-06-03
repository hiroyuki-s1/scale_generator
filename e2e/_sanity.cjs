/** Browser launch sanity check */
const { chromium, webkit } = require('playwright');

(async () => {
  for (const [name, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    try {
      const b = await browserType.launch({ headless: true });
      const p = await b.newPage();
      await p.setContent('<h1 id="t">hello</h1>');
      const txt = await p.evaluate(() => document.getElementById('t').textContent);
      console.log(`✅ ${name}: launched, content="${txt}"`);
      await b.close();
    } catch (e) {
      console.log(`❌ ${name}: ${e.message}`);
    }
  }
})();
