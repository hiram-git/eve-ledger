import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

// SSR: cada visita consulta la API, así el dashboard siempre muestra datos frescos
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321 },
  env: {
    schema: {
      API_URL: envField.string({ context: 'server', access: 'public', default: 'http://localhost:3000' }),
      // Plazas de piloto que muestra la página de pilotos (tus personajes)
      PILOT_SLOTS: envField.number({ context: 'server', access: 'public', default: 5 }),
    },
  },
});
