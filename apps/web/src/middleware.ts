import { defineMiddleware } from 'astro:middleware';
import { allowedHosts, hostAllowed } from './lib/local-only';

const allowed = allowedHosts();

// Solo esta máquina: un Host que no sea local (DNS rebinding) no ve el dashboard
export const onRequest = defineMiddleware((context, next) => {
  if (!hostAllowed(context.request.headers.get('host'), allowed)) {
    return new Response('Host no permitido: EVE Ledger solo responde en esta máquina', { status: 403 });
  }
  return next();
});
