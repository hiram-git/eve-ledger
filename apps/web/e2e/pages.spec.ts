// Every page, in the three languages and at 390 and 1320 px: responds, throws no errors, has a single h1, shows no
// «undefined»/«NaN» and doesn't overflow horizontally (what broke most often when the UI changed)
import { expect, test, type Page } from '@playwright/test';
import { PILOTS, WEB_URL } from './fixtures';

const PAGES = [
  { name: 'Resumen', path: '/' },
  { name: 'Resumen de un piloto', path: `/?pilot=${PILOTS.kade.id}` },
  { name: 'Resumen con inventario', path: '/?inv=1' },
  { name: 'Indicadores', path: '/indicadores' },
  { name: 'Balances', path: '/balances' },
  { name: 'Balances de un piloto', path: `/balances?pilot=${PILOTS.aria.id}` },
  { name: 'Doctrinas', path: '/doctrinas' },
  { name: 'Pilotos', path: '/pilotos' },
  { name: 'Aviso legal', path: '/aviso-legal' },
];
const LANGS = ['es', 'en', 'de'] as const;
const WIDTHS = [390, 1320];

// Page errors. CCP images (portraits, icons) don't load without network: they don't count
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource|images\.evetech\.net/.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

for (const lang of LANGS) {
  for (const p of PAGES) {
    test(`${p.name} (${lang})`, async ({ page, context }) => {
      await context.addCookies([{ name: 'lang', value: lang, url: WEB_URL }]);
      const errors = collectErrors(page);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const res = await page.goto(p.path);
        expect(res?.status(), `${p.path} a ${width} px`).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.locator('h1')).toHaveCount(1);
        const text = await page.locator('body').innerText();
        expect(text, `texto roto en ${p.path} a ${width} px`).not.toMatch(/\bundefined\b|\bNaN\b|\[object |Infinity/);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${p.path} se desborda ${overflow} px a ${width} px`).toBeLessThanOrEqual(0);
      }
      expect(errors).toEqual([]);
    });
  }
}
