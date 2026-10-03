// Prepara lo que el instalador lleva dentro, a partir de apps/api y apps/web:
//   src-tauri/resources/server/api/api.js      la API en un solo archivo (Bun la ejecuta)
//   src-tauri/resources/server/api/drizzle/    las migraciones (se aplican al arrancar)
//   src-tauri/resources/server/web/server/     la web (Astro SSR) en archivos sin node_modules
//   src-tauri/resources/server/web/client/     sus estáticos (el servidor los busca en ../client)
//   src-tauri/binaries/bun-<triple>            el propio Bun, como proceso auxiliar (sidecar) de Tauri
// Se corre en cada sistema para el que se compila (Tauri no compila de forma cruzada): copia el Bun de esa máquina.
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
// La del escritorio trae la CLI de Tauri: sin ella, `bun run tauri build` dice «command not found: tauri»
await $`bun install --frozen-lockfile`.cwd(resolve(import.meta.dir, '..')).quiet();
await $`bun install --frozen-lockfile`.cwd(api).quiet();
await $`bun install --frozen-lockfile`.cwd(web).quiet();

console.log('· API → api.js');
await $`bun build src/index.ts --target=bun --outfile ${join(out, 'api', 'api.js')}`.cwd(api).quiet();
cpSync(join(api, 'drizzle'), join(out, 'api', 'drizzle'), { recursive: true });

console.log('· Web → server/ + client/');
await $`bun run build`.cwd(web).quiet();
// El adaptador de Node busca los estáticos subiendo hasta una carpeta «server»: se conserva server/ + client/
await $`bun build dist/server/entry.mjs --target=bun --splitting --external sharp --outdir ${join(out, 'web', 'server')}`.cwd(web).quiet();
cpSync(join(web, 'dist', 'client'), join(out, 'web', 'client'), { recursive: true });

// Lanzador de la API y la web (sale si la app muere sin avisar; arregla las rutas «verbatim» de Windows)
copyFileSync(join(import.meta.dir, 'launch.js'), join(out, 'launch.js'));

// Tauri espera el sidecar como binaries/<nombre>-<triple del destino>[.exe]
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
