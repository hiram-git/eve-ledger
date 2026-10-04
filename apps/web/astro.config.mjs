import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

// SSR: cada visita consulta la API, así el dashboard siempre muestra datos frescos
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321 },
  // «secret» aunque no lo sean: así se leen al arrancar (process.env) y no quedan fijadas al compilar.
  // La app de escritorio (apps/desktop) las pasa según la configuración de cada usuario
  env: {
    schema: {
      API_URL: envField.string({ context: 'server', access: 'secret', default: 'http://localhost:3000' }),
      // Plazas de piloto que muestra la página de pilotos (tus personajes)
      PILOT_SLOTS: envField.number({ context: 'server', access: 'secret', default: 5 }),
      // Versión de la app (la pone la app de escritorio); vacía, el pie no la muestra
      APP_VERSION: envField.string({ context: 'server', access: 'secret', default: '' }),
    },
  },
});
