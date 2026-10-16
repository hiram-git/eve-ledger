import { defineMiddleware } from 'astro:middleware';
import { allowedHosts, hostAllowed } from './lib/local-only';

const allowed = allowedHosts();

// This machine only: a non-local Host (DNS rebinding) doesn't get the dashboard
export const onRequest = defineMiddleware((context, next) => {
  if (!hostAllowed(context.request.headers.get('host'), allowed)) {
    return new Response('Host no permitido: EVE Ledger solo responde en esta máquina', { status: 403 });
  }
  return next();
});
