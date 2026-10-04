const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => { const b = await chromium.launch();
  for (const lang of ['es', 'en']) {
    const ctx = await b.newContext({ viewport: { width: 2000, height: 1000 }, deviceScaleFactor: 1 }); const p = await ctx.newPage();
    await p.goto('file://' + __dirname + '/brochure.html?lang=' + lang); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    await p.screenshot({ path: `${__dirname}/eve-ledger-brochure-${lang}.png` });
    await ctx.close();
  }
  await b.close(); })();
