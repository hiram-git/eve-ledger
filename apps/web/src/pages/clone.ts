import type { APIRoute } from 'astro';
import { safeBackUrl } from '../lib/safe-back';
import { setClone } from '../lib/api';

// Alfa u Omega de un piloto (conmutador de Pilotos): lo usan las Doctrinas para el tiempo de entrenamiento y las
// skills que un Alfa no puede usar. Vuelve a la página de origen
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const back = safeBackUrl(String(form.get('back') ?? '/pilotos'));
  const character = Number(form.get('character') ?? 0);
  const clone = form.get('clone');
  if (character && (clone === 'omega' || clone === 'alpha')) {
    try {
      await setClone(character, clone);
    } catch (err) {
      console.error(err);
    }
  }
  return redirect(back.pathname + back.search + (character ? `#piloto-${character}` : ''), 303);
};
