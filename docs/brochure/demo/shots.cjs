// Demo screenshots for the README and the brochure (node): shot-<screen>-<language>.jpg in docs/brochure.
// Playwright from apps/web (bun install there); the demo web at DEMO_WEB (started by run.sh)
const { join } = require('node:path');
const { chromium } = require(require.resolve('@playwright/test', { paths: [join(__dirname, '../../../apps/web')] }));
const U = process.env.DEMO_WEB ?? 'http://127.0.0.1:4398';
const OUT = join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  for (const lang of ['es', 'en']) {
    const ctx = await b.newContext({ viewport: { width: 1320, height: 860 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'lang', value: lang, url: U }]);
    const p = await ctx.newPage();
    const jpg = (n) => ({ path: join(OUT, `shot-${n}-${lang}.jpg`), type: 'jpeg', quality: 88 });
    await p.goto(U + '/?days=30&inv=1');
    await p.waitForTimeout(1500);
    await p.screenshot(jpg('dashboard'));
    // The doctrine at 1040 px: the whole table (with the «Para volarlo ya» icons) fits the space in the piece
    await p.setViewportSize({ width: 1040, height: 860 });
    await p.goto(U + '/doctrinas');
    await p.waitForTimeout(1200);
    const doc = await p.locator('.doctrine').first().boundingBox();
    await p.screenshot({ ...jpg('doctrine'), clip: { x: doc.x, y: doc.y, width: doc.width, height: 900 }, fullPage: true });
    await p.setViewportSize({ width: 1320, height: 860 });
    await p.goto(U + '/doctrinas');
    await p.waitForTimeout(1200);
    await p.locator('.funds').screenshot(jpg('funds'));
    await p.goto(U + '/indicadores');
    await p.waitForTimeout(1200);
    const cards = await p.locator('.cards').first().boundingBox();
    await p.screenshot({ ...jpg('indicators'), clip: { x: cards.x, y: cards.y, width: cards.width, height: 880 }, fullPage: true });
    await p.goto(U + '/balances');
    await p.waitForTimeout(1200);
    const books = await p.locator('.books').first().boundingBox();
    await p.screenshot({ ...jpg('balances'), clip: { x: books.x, y: books.y, width: books.width, height: 880 }, fullPage: true });
    console.log(lang, 'ok');
    await ctx.close();
  }
  await b.close();
})();
