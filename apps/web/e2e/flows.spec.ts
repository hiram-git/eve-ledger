// Calculations and flows that have broken before: the sum of the pilots is the total, the net dot doesn't leave
// the chart, an optional scope doesn't light up warnings, a pilot without sync doesn't show zeros, the chart has a
// single Tab stop and backups are created and restored
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
  expect(nets.length).toBe(2); // Nyx has no sync: «—»
  const summary = await (await request.get(`${API_URL}/summary?days=30`)).json();
  expect(nets.reduce((a, b) => a + b, 0)).toBeCloseTo(summary.totals.net, 0);
  // And the activities add up to the total
  const byActivity = summary.byActivity.reduce((n: number, a: { net: number }) => n + a.net, 0);
  expect(byActivity).toBeCloseTo(summary.totals.net, 0);
  // Opening balance + net + transfers between your pilots = balance, for each pilot with data
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
  // The line is there twice (one per layout) and only one is visible
  await expect(page.getByText('No incluye lo movido con tus otros pilotos').filter({ visible: true })).toHaveCount(1);
});

test('el punto del neto de cada día queda dentro del gráfico', async ({ page }) => {
  // Kade received 500 M from Aria: before, on that day the dot went off the chart above the Neto card
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
  // The «Pilotos» dot counts only Nyx (no first sync)
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
  // The pre-restore state is kept as a «Antes de restaurar» backup
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

test('los chips de pilotos muestran el saldo del wallet, no el neto del período', async ({ page, request }) => {
  const summary = await (await request.get(`${API_URL}/summary?days=30`)).json();
  const aria = summary.characters.find((c: { id: number }) => c.id === PILOTS.aria.id);
  const full = (v: number) => `${new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ISK`;
  await page.goto('/?days=30');
  const chip = page.locator('.pilot-strip a', { hasText: PILOTS.aria.name });
  await expect(chip).toHaveAttribute('title', `${PILOTS.aria.name}: saldo del wallet ${full(aria.balance)}`);
  await expect(chip).toHaveAttribute('aria-label', /^Aria Vex, saldo /);
  // «Todos» is the sum of the wallets, and a pilot without a sync shows «—»
  const all = summary.characters.reduce((n: number, c: { balance: number | null }) => n + (c.balance ?? 0), 0);
  await expect(page.locator('.pilot-strip a').first()).toHaveAttribute('title', `Todos tus pilotos: saldo de los wallets ${full(all)}`);
  await expect(page.locator('.pilot-strip a', { hasText: PILOTS.nyx.name }).locator('.pilot-balance')).toHaveText('—');
});

test('Descuentos: impuesto de corporación exacto y penalización de incursión estimada', async ({ page, request }) => {
  const { deductions: d } = await (await request.get(`${API_URL}/indicators`)).json();
  expect(d.byCorp[0].name).toBe('School of Applied Knowledge');
  expect(d.byCorp[0].rate).toBeCloseTo(0.1, 2);
  // Kade received 3 × 9 M in Kamela during the incursion: the same amount was lost
  expect(d.bySystem).toEqual([expect.objectContaining({ name: 'Kamela', ticks: 3, lost: 27_000_000 })]);
  expect(d.grossPerHour).toBeGreaterThan(d.iskPerHour);
  await page.goto('/indicadores');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Descuentos' }) });
  await expect(card.getByText('Se quedaron las corporaciones')).toBeVisible();
  await expect(card.getByRole('rowheader', { name: /School of Applied Knowledge/ })).toBeVisible();
  await expect(card.getByRole('rowheader', { name: /Kamela/ })).toBeVisible();
  await expect(card.getByText(/~\u2009?27,0\u00a0M/).first()).toBeVisible();
  // And «Ratting por sistema» flags the system with the incursion
  const systems = page.locator('section', { has: page.getByRole('heading', { name: 'Ratting por sistema' }) });
  await expect(systems.getByRole('rowheader', { name: /Kamela/ }).getByText('incursión')).toBeVisible();
});

test('Doctrinas: renombrar una doctrina y plegarla; el pliegue se recuerda', async ({ page, request }) => {
  const { id } = await (await request.post(`${API_URL}/doctrines`, { data: { name: 'Nombre equivocado' } })).json();
  try {
    await page.goto('/doctrinas');
    const doc = page.locator(`#doctrina-${id}`);
    await expect(doc.getByRole('heading', { level: 2, name: 'Nombre equivocado' })).toBeVisible();
    await expect(doc.locator('.doctrine-meta')).toHaveText('Sin fits');
    // Renombrar sin borrar: el campo aparece en el propio panel con el nombre actual
    await doc.locator('details.rename > summary').click();
    const input = doc.getByLabel('Nuevo nombre de «Nombre equivocado»');
    await expect(input).toHaveValue('Nombre equivocado');
    await input.fill('Beehive');
    await input.press('Enter');
    await expect(page.locator(`#doctrina-${id}`).getByRole('heading', { level: 2, name: 'Beehive' })).toBeVisible();
    await expect(page.getByText('Doctrina renombrada: «Beehive».')).toBeVisible();
    const api = await (await request.get(`${API_URL}/doctrines`)).json();
    expect(api.doctrines.find((d: { id: number }) => d.id === id).name).toBe('Beehive');
    // Plegar: el cuerpo se oculta, el título sigue a la vista y la elección sobrevive a una recarga
    await page.goto('/doctrinas');
    const fold = page.locator(`#doctrina-${id} details.doctrine-fold`);
    await expect(fold).toHaveJSProperty('open', true);
    await fold.locator('> summary').click();
    await expect(fold).toHaveJSProperty('open', false);
    await expect(page.locator(`#doctrina-${id} .add-fit`)).toBeHidden();
    await page.reload();
    await expect(page.locator(`#doctrina-${id} details.doctrine-fold`)).toHaveJSProperty('open', false);
    await expect(page.locator(`#doctrina-${id}`).getByRole('heading', { level: 2, name: 'Beehive' })).toBeVisible();
    // Una acción sobre la doctrina plegada la abre para mostrar su aviso
    await page.goto(`/doctrinas?ok=renamed&name=Beehive&at=doctrina-${id}#doctrina-${id}`);
    await expect(page.locator(`#doctrina-${id} details.doctrine-fold`)).toHaveJSProperty('open', true);
    await expect(page.getByText('Doctrina renombrada: «Beehive».')).toBeVisible();
  } finally {
    await request.delete(`${API_URL}/doctrines/${id}`);
  }
});

test('Doctrinas: la vista compacta pliega los fits a una línea y se recuerda', async ({ page }) => {
  await page.goto('/doctrinas');
  const fit = page.locator('#fit-1 details.fit-fold');
  await expect(fit).toHaveJSProperty('open', true);
  // La línea del fit resume el coste en Jita y quién lo vuela; la cabecera de la doctrina, lo mismo en conjunto
  await expect(page.locator('#fit-1 .fit-brief')).toContainText('2 de 2 pilotos');
  await expect(page.locator('#doctrina-1 .doctrine-meta')).toContainText('2 de 2 pilotos · 1 de 1 nave');
  const toggle = page.getByRole('button', { name: 'Vista compacta' });
  await toggle.click();
  await expect(fit).toHaveJSProperty('open', false);
  await expect(page.locator('#fit-1 .fit-head')).toBeHidden();
  await page.reload();
  await expect(page.locator('#fit-1 details.fit-fold')).toHaveJSProperty('open', false);
  await expect(page.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute('aria-pressed', 'true');
  // Un fit se despliega sin salir del modo compacto, y el ancla de un fit lo abre aunque la vista sea compacta
  await page.locator('#fit-1 details.fit-fold > summary').click();
  await expect(page.locator('#fit-1 .fit-head')).toBeVisible();
  await page.goto('/doctrinas#fit-1');
  await expect(page.locator('#fit-1 details.fit-fold')).toHaveJSProperty('open', true);
  await page.getByRole('button', { name: 'Vista compacta' }).click();
  await expect(page.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#fit-1 details.fit-fold')).toHaveJSProperty('open', true);
});

test('Puntos de lealtad: LP por corporación valorados al mejor cambio y EverMarks aparte', async ({ page, request }) => {
  const { loyalty } = await (await request.get(`${API_URL}/indicators`)).json();
  expect(loyalty.corps.map((c: { name: string; points: number }) => [c.name, c.points])).toEqual([['Sisters of EVE', 270_000], ['Federation Navy', 60_000]]);
  expect(loyalty.corps[0].iskPerLp).toBeCloseTo((8_000_000 - 2_400_000) / 24_000, 0);
  expect(loyalty.corps[1].value).toBeNull();
  expect(loyalty.evermarks.points).toBe(16_500);
  expect(loyalty.change).toBe(40_000);
  await page.goto('/indicadores');
  const card = page.locator('section[aria-labelledby="lp-title"]');
  // 270 000 LP × 233,33 ISK/LP = 63,0 M, estimated; the LP figure and the EverMarks are exact
  await expect(card.locator('.answer-value')).toContainText('63,0 M');
  await expect(card.locator('.answer-sub')).toContainText('330.000 LP');
  await expect(card.locator('.lp-change')).toContainText('+40.000 LP en 30 días');
  await expect(card.locator('table.lp tbody tr').first()).toContainText('Sisters of EVE');
  await expect(card.locator('.lp-evermarks')).toContainText('16.500');
  // Nyx has the scope but no sync yet: the card says so
  await expect(card.locator('.price-meta')).toContainText(PILOTS.nyx.name);
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
