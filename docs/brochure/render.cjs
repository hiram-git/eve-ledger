const { join } = require('node:path');
const { chromium } = require(require.resolve('@playwright/test', { paths: [join(__dirname, '../../apps/web')] }));
// Las tres piezas en los dos idiomas: eve-ledger-<pieza>-<idioma>.png (2000 × 1000)
(async () => { const b = await chromium.launch();
  for (const slide of ['portada', 'doctrinas', 'indicadores']) for (const lang of ['es', 'en']) {
    const ctx = await b.newContext({ viewport: { width: 2000, height: 1000 }, deviceScaleFactor: 1 }); const p = await ctx.newPage();
    await p.goto(`file://${__dirname}/brochure.html?slide=${slide}&lang=${lang}`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
    const name = slide === 'portada' ? 'brochure' : slide;
    await p.screenshot({ path: `${__dirname}/eve-ledger-${name}-${lang}.png` });
    await ctx.close();
  }
  await b.close(); })();
