// Arranque de la API sobre una base de una versión anterior (lo lanza test/upgrade.test.ts en su propio proceso,
// porque la base se abre al importar el cliente): copia `update`, migraciones y las cifras de cada pantalla
const API = `${import.meta.dir}/../src`;
const { appliedMigrations, knownMigrations, rawDb, runMigrations } = await import(`${API}/db/client.ts`);
const backups = await import(`${API}/services/backups.ts`);

// Lo mismo que hace src/index.ts al arrancar
const before = appliedMigrations();
const update = backups.backupBeforeMigrations();
runMigrations();

const { getSummary } = await import(`${API}/services/summary.ts`);
const { shipLosses } = await import(`${API}/services/losses.ts`);
const { getIndicators } = await import(`${API}/services/indicators.ts`);
const { getInventory } = await import(`${API}/services/inventory.ts`);
const { listDoctrines } = await import(`${API}/services/doctrines.ts`);

const count = (table: string) => (rawDb().query(`select count(*) as n from ${table}`).get() as { n: number }).n;
const tables = ['characters', 'wallet_journal', 'wallet_transactions', 'assets', 'killmails', 'contracts', 'names'];
const counts = Object.fromEntries(tables.map((t) => [t, count(t)]));
const summary = await getSummary(30);
const kade = await getSummary(30, Number(Bun.env.KADE_ID));
const losses = await shipLosses(30);
const indicators = await getIndicators();
const inventory = await getInventory();
const doctrines = await listDoctrines();

// Y una copia de antes de actualizar se puede restaurar encima (vuelve a dejar lo mismo)
const restored = update ? backups.restoreFromFile(backups.backupPath(update.name)) : null;

console.log(
  JSON.stringify({
    before,
    after: appliedMigrations(),
    known: knownMigrations(),
    update: update ? { name: update.name, migrations: backups.inspectBackup(backups.backupPath(update.name)).migrations } : null,
    counts,
    authMethods: rawDb().query('select auth_method as m from characters order by id').all().map((r: { m: string }) => r.m),
    totals: summary.totals,
    byActivity: summary.byActivity.map((a: { activity: string; net: number }) => [a.activity, a.net]),
    kadeNet: kade.totals.net,
    losses: { count: losses.totals.count, cost: losses.totals.cost },
    ratting: { ticks: indicators.ratting.ticks, isk: indicators.ratting.isk },
    inventory: inventory.value,
    doctrines: doctrines.doctrines.length,
    restored: restored ? { migrations: restored.info.migrations, entries: restored.info.entries, after: count('wallet_journal') } : null,
  }),
);
