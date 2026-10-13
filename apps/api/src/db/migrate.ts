// Applies pending migrations without starting the API (bun run db:migrate).
// The paths (data/ledger.db and ./drizzle) are relative to apps/api, same as at startup
import { runMigrations } from './client';

runMigrations();
console.log('Migraciones aplicadas en data/ledger.db');
