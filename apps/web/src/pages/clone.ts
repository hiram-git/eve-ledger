import type { APIRoute } from 'astro';
import { safeBackUrl } from '../lib/safe-back';
import { setClone } from '../lib/api';

// A pilot's Alpha or Omega (Pilotos toggle): Doctrines use it for training time and for the
// skills an Alpha can't use. Returns to the originating page
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
