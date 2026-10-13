// Cuentas y flujos que ya se rompieron alguna vez: la suma de los pilotos es el total, el punto del neto no se sale
// del gráfico, un permiso opcional no enciende avisos, un piloto sin sync no pinta ceros, el gráfico tiene una
// sola parada de Tab y las copias de seguridad se hacen y se restauran
import { expect, test } from '@playwright/test';
import { API_URL, PILOTS, WEB_URL } from './fixtures';

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'lang', value: 'es', url: WEB_URL }]);
});

test('la suma de los netos de los pilotos es el total del resumen', async ({ page, request }) => {
  await page.goto('/?days=30');
  const nets = await page
    .locator('table.pilots tbody tr')
    .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.net).filter((v) => v !== undefined && v !== '').map(Number));
  expect(nets.length).toBe(2); // Nyx no tiene sync: «—»
  const summary = await (await request.get(`${API_URL}/summary?days=30`)).json();
  expect(nets.reduce((a, b) => a + b, 0)).toBeCloseTo(summary.totals.net, 0);
  // Y las actividades suman el total
  const byActivity = summary.byActivity.reduce((n: number, a: { net: number }) => n + a.net, 0);
  expect(byActivity).toBeCloseTo(summary.totals.net, 0);
  // Saldo anterior + neto + lo movido entre tus pilotos = saldo, en cada piloto con datos
  for (const c of summary.characters.filter((c: { journalBalance: number | null }) => c.journalBalance !== null)) {
    expect(c.openingBalance + c.walletChange).toBeCloseTo(c.journalBalance, 0);
  }
});

test('el neto de un piloto no incluye lo movido con sus otros pilotos', async ({ page, request }) => {
  const summary = await (await request.get(`${API_URL}/summary?days=30&characterId=${PILOTS.kade.id}`)).json();
  const kade = summary.characters.find((c: { id: number }) => c.id === PILOTS.kade.id);
  expect(summary.totals.net).toBeCloseTo(kade.income - kade.expenses, 0);
  expect(kade.internalReceived).toBeGreaterThan(0);
  await page.goto(`/?days=30&pilot=${PILOTS.kade.id}`);
  // La línea está dos veces (una por maquetación) y se ve una sola
  await expect(page.getByText('No incluye lo movido con tus otros pilotos').filter({ visible: true })).toHaveCount(1);
});

test('el punto del neto de cada día queda dentro del gráfico', async ({ page }) => {
  // Kade recibió 500 M de Aria: antes, ese día el punto se salía del gráfico por encima de la tarjeta de Neto
  for (const path of ['/?days=30', `/?days=30&pilot=${PILOTS.kade.id}`, `/?days=30&pilot=${PILOTS.aria.id}`]) {
    await page.goto(path);
    const plot = await page.locator('.plot .cols').boundingBox();
    expect(plot).not.toBeNull();
    const marks = await page.locator('.plot .net-mark').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top + scrollY, bottom: r.bottom + scrollY };
      }),
    );
    expect(marks.length).toBeGreaterThan(0);
    const top = plot!.y - 8;
    const bottom = plot!.y + plot!.height + 8;
    for (const m of marks) {
      expect(m.top, `punto por encima del gráfico en ${path}`).toBeGreaterThanOrEqual(top);
      expect(m.bottom, `punto por debajo del gráfico en ${path}`).toBeLessThanOrEqual(bottom);
    }
  }
});

test('el gráfico diario es una lista con una sola parada de Tab', async ({ page }) => {
  await page.goto('/?days=30');
  const list = page.locator('.plot [role="list"]');
  await expect(list).toHaveCount(1);
  await expect(list.locator('[role="listitem"][tabindex="0"]')).toHaveCount(1);
});

test('el permiso opcional de citadelas no enciende avisos; un piloto sin sync sí', async ({ page }) => {
  await page.goto('/pilotos');
  const kade = page.locator(`#piloto-${PILOTS.kade.id}`);
  const aria = page.locator(`#piloto-${PILOTS.aria.id}`);
  await expect(kade.locator('.scopes li.optional')).toHaveCount(1);
  await expect(aria.locator('.scopes li.optional')).toHaveCount(0);
  await expect(kade.getByText('Todos los permisos')).toBeVisible();
  // El punto de «Pilotos» cuenta solo a Nyx (sin primer sync)
  await expect(page.locator('a[href="/pilotos"][aria-label*="1 necesita"], a[href="/pilotos"][aria-label*="1 necesitan"]').first()).toBeVisible();

  await page.goto('/?days=30');
  const health = page.locator('.health-full');
  await expect(health).toContainText(PILOTS.nyx.name);
  await expect(health).not.toContainText(PILOTS.kade.name);
});

test('un piloto sin ningún sync no pinta ceros', async ({ page }) => {
  await page.goto(`/?pilot=${PILOTS.nyx.id}`);
  await expect(page.locator('.empty-pilot')).toBeVisible();
  await expect(page.locator('.plot')).toHaveCount(0);
});

test('las citadelas con nombre se ven con su nombre y las demás como «Estructura …»', async ({ page }) => {
  await page.goto('/?inv=1');
  const inventory = page.locator('main');
  await expect(inventory.getByText('Perimeter - Tranquility Trading Tower').first()).toBeVisible();
  await expect(inventory.getByText(/Estructura …617999/).first()).toBeVisible();
});

test('copias de seguridad: hacer una, verla en la lista y restaurarla', async ({ page }) => {
  await page.goto('/pilotos');
  const panel = page.locator('#copias');
  await panel.locator('.backup-actions button[type="submit"]').click();
  await expect(page).toHaveURL(/ok=backup/);
  const notice = panel.locator('.action-notice');
  await expect(notice).toContainText('Copia hecha');
  await expect(notice).toBeFocused();

  await panel.locator('.backup-list summary').click();
  const rows = panel.locator('.backup-list tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(1);
  page.once('dialog', (d) => d.accept());
  await rows.first().locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/ok=restored/);
  await expect(panel.locator('.action-notice')).toContainText('Copia restaurada');
  // Lo de antes de restaurar queda como copia «Antes de restaurar»
  await panel.locator('.backup-list summary').click();
  await expect(panel.locator('.backup-list tbody')).toContainText('Antes de restaurar');
});

test('un archivo que no es una copia se rechaza sin tocar nada', async ({ page }) => {
  await page.goto('/pilotos');
  const panel = page.locator('#copias');
  await panel.locator('.backup-upload summary').click();
  await panel.locator('#backup-file').setInputFiles({ name: 'nota.db', mimeType: 'application/octet-stream', buffer: Buffer.from('no soy una base de datos '.repeat(50)) });
  page.once('dialog', (d) => d.accept());
  await panel.locator('.backup-upload button[type="submit"]').click();
  await expect(page).toHaveURL(/error=not_sqlite/);
  await expect(panel.locator('.action-notice')).toContainText('no es una copia de EVE Ledger');
});

test('el saldo es el del wallet de ESI y Balances concilia lo que el journal aún no da', async ({ page, request }) => {
  const summary = await (await request.get(`${API_URL}/summary?days=30`)).json();
  const aria = summary.characters.find((c: { id: number }) => c.id === PILOTS.aria.id);
  expect(aria.balance - aria.journalBalance).toBeCloseTo(25_000_000, 0);
  await page.goto('/balances?days=30');
  await expect(page.getByText('Movimientos aún no en el journal').filter({ visible: true })).toHaveCount(1);
  await page.goto('/?days=30');
  await expect(page.getByText(/va por delante del journal en Aria Vex/).first()).toBeAttached();
});

test('Descuentos: impuesto de corporación exacto y penalización de incursión estimada', async ({ page, request }) => {
  const { deductions: d } = await (await request.get(`${API_URL}/indicators`)).json();
  expect(d.byCorp[0].name).toBe('School of Applied Knowledge');
  expect(d.byCorp[0].rate).toBeCloseTo(0.1, 2);
  // Kade cobró 3 × 9 M en Kamela con la incursión: se perdió lo mismo
  expect(d.bySystem).toEqual([expect.objectContaining({ name: 'Kamela', ticks: 3, lost: 27_000_000 })]);
  expect(d.grossPerHour).toBeGreaterThan(d.iskPerHour);
  await page.goto('/indicadores');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Descuentos' }) });
  await expect(card.getByText('Se quedaron las corporaciones')).toBeVisible();
  await expect(card.getByRole('rowheader', { name: /School of Applied Knowledge/ })).toBeVisible();
  await expect(card.getByRole('rowheader', { name: /Kamela/ })).toBeVisible();
  await expect(card.getByText(/~\u2009?27,0\u00a0M/).first()).toBeVisible();
  // Y «Ratting por sistema» marca el sistema con la incursión
  const systems = page.locator('section', { has: page.getByRole('heading', { name: 'Ratting por sistema' }) });
  await expect(systems.getByRole('rowheader', { name: /Kamela/ }).getByText('incursión')).toBeVisible();
});

test('el pie enlaza el aviso legal con el texto original de CCP', async ({ page }) => {
  await page.goto('/');
  await page.locator('footer').getByRole('link', { name: 'Aviso legal' }).click();
  await expect(page).toHaveURL(/\/aviso-legal/);
  await expect(page.locator('blockquote[lang="en"]')).toContainText('CCP is in no way responsible');
});

test('el selector de idioma cambia la interfaz y vuelve a la misma página', async ({ page }) => {
  await page.goto('/balances');
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL(/\/balances/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toContainText('Balance');
});
