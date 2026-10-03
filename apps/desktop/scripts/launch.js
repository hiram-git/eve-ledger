// Lanzador de la API y la web en la app de escritorio (lo copia scripts/prepare-server.ts a resources/server/).
// Uso: bun launch.js <script>
// - Si la app de escritorio muere sin avisar (cuelgue, kill), se cierra la tubería de stdin que la une con este
//   proceso y salimos también: si no, la API y la web quedarían ocupando los puertos.
// - En Windows, Tauri puede pasar rutas «verbatim» (\\?\C:\Program Files\…) que Bun no abre: se quita el prefijo.
import { pathToFileURL } from 'node:url';

const exit = () => process.exit(0);
process.stdin.on('end', exit);
process.stdin.on('error', exit);
process.stdin.resume();

export function plainPath(path) {
  if (path.startsWith('\\\\?\\UNC\\')) return '\\\\' + path.slice(8);
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

if (import.meta.main) await import(pathToFileURL(plainPath(process.argv[2])).href);
