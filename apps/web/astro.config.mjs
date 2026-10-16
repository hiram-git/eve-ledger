import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

// SSR: every visit queries the API, so the dashboard always shows fresh data
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321 },
  // «secret» even though they aren't: that way they're read at startup (process.env) and not fixed at build time.
  // The desktop app (apps/desktop) passes them according to each user's configuration
  env: {
    schema: {
      API_URL: envField.string({ context: 'server', access: 'secret', default: 'http://localhost:3000' }),
      // Pilot slots shown on the pilots page (your characters)
      PILOT_SLOTS: envField.number({ context: 'server', access: 'secret', default: 5 }),
      // App version (set by the desktop app); when empty, the footer doesn't show it
      APP_VERSION: envField.string({ context: 'server', access: 'secret', default: '' }),
      // Repository the installer came from (https://github.com/…; set by the desktop app): the legal notice
      // links to the source code; when empty, it doesn't link it
      APP_REPO: envField.string({ context: 'server', access: 'secret', default: '' }),
    },
  },
});
