// Aplica las migraciones pendientes sin arrancar la API (bun run db:migrate).
// Las rutas (data/ledger.db y ./drizzle) son relativas a apps/api, igual que al arrancar
import { runMigrations } from './client';

runMigrations();
console.log('Migraciones aplicadas en data/ledger.db');
