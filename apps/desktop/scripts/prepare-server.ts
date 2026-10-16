// Prepares what the installer ships, from apps/api and apps/web:
//   src-tauri/resources/server/api/api.js      the API in a single file (Bun runs it)
//   src-tauri/resources/server/api/drizzle/    the migrations (applied at startup)
//   src-tauri/resources/server/web/server/     the web app (Astro SSR) as files without node_modules
//   src-tauri/resources/server/web/client/     its static assets (the server looks for them in ../client)
//   src-tauri/binaries/bun-<triple>            Bun itself, as a Tauri helper process (sidecar)
// Run it on each system you build for (Tauri doesn't cross-compile): it copies that machine's Bun.
import { $ } from 'bun';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..', '..', '..');
const api = join(root, 'apps', 'api');
const web = join(root, 'apps', 'web');
const tauri = resolve(import.meta.dir, '..', 'src-tauri');
const out = join(tauri, 'resources', 'server');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'api'), { recursive: true });

console.log('· Dependencias (escritorio, API y web)');
// The desktop one brings the Tauri CLI: without it, `bun run tauri build` says «command not found: tauri»
await $`bun install --frozen-lockfile`.cwd(resolve(import.meta.dir, '..')).quiet();
await $`bun install --frozen-lockfile`.cwd(api).quiet();
await $`bun install --frozen-lockfile`.cwd(web).quiet();

console.log('· API → api.js');
await $`bun build src/index.ts --target=bun --outfile ${join(out, 'api', 'api.js')}`.cwd(api).quiet();
cpSync(join(api, 'drizzle'), join(out, 'api', 'drizzle'), { recursive: true });

console.log('· Web → server/ + client/');
await $`bun run build`.cwd(web).quiet();
// The Node adapter finds the static assets by walking up to a «server» folder: keep server/ + client/
await $`bun build dist/server/entry.mjs --target=bun --splitting --external sharp --outdir ${join(out, 'web', 'server')}`.cwd(web).quiet();
cpSync(join(web, 'dist', 'client'), join(out, 'web', 'client'), { recursive: true });

// Launcher for the API and the web app (exits if the app dies unexpectedly; fixes Windows «verbatim» paths)
copyFileSync(join(import.meta.dir, 'launch.js'), join(out, 'launch.js'));

// Tauri expects the sidecar as binaries/<name>-<target triple>[.exe]
const triple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  (await $`rustc -vV`.text()).match(/^host: (.+)$/m)?.[1]?.trim();
if (!triple) throw new Error('No sé el triple del destino: instala Rust (rustc -vV) o define TAURI_ENV_TARGET_TRIPLE');
const ext = process.platform === 'win32' ? '.exe' : '';
const binDir = join(tauri, 'binaries');
mkdirSync(binDir, { recursive: true });
const sidecar = join(binDir, `bun-${triple}${ext}`);
if (existsSync(sidecar)) rmSync(sidecar);
copyFileSync(process.execPath, sidecar);
if (!ext) chmodSync(sidecar, 0o755);
console.log(`· Bun ${Bun.version} → binaries/bun-${triple}${ext}`);
console.log('Listo: ya se puede compilar con `bun run tauri build` (o `bun run build`).');
