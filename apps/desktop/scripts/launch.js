// Launcher for the API and the web in the desktop app (scripts/prepare-server.ts copies it to resources/server/).
// Usage: bun launch.js <script>
// - If the desktop app dies without warning (hang, kill), the stdin pipe that joins it to this process
//   closes and we exit too: otherwise the API and the web would keep holding the ports.
// - On Windows, Tauri can pass "verbatim" paths (\\?\C:\Program Files\…) that Bun does not open: the prefix is stripped.
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
