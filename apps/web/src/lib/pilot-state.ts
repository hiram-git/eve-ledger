import type { Pilot } from './api';
import type { Messages } from './i18n';

export type PilotState = { kind: 'ok' | 'pending' | 'stale' | 'error'; text: string; title?: string; hint?: string };

// Los errores llegan de la API en español/inglés técnico: se explican en el idioma elegido
export function explainError(message: string, m: Messages): string {
  if (/invalid_grant|refresh token/i.test(message)) return m.errToken;
  if (/descifrar|ENC_KEY/i.test(message)) return m.errDecrypt;
  if (/cambió de dueño|owner/i.test(message)) return m.errOwner;
  if (/ESI (401|403)/.test(message)) return m.errForbidden;
  if (/ESI (420|429)/.test(message)) return m.errRate;
  if (/ESI 5\d\d/.test(message)) return m.errDown;
  return message;
}

// Un primer sync que no ha registrado nada en este tiempo ya no está «en curso»: la API se reinició a medias
// o el sync nunca se lanzó. Si hay un sync en marcha ahora mismo, sí puede ser el suyo
const FIRST_SYNC_GRACE_MS = 10 * 60_000;

// Estado de sync de un piloto: el mismo en la página de Pilotos y en la línea de avisos del resumen
export function pilotState(p: Pilot, m: Messages, staleAfterMs: number, syncRunning = false): PilotState {
  if (p.lastError) {
    const kinds: Record<string, string> = { journal: m.kindJournal, transactions: m.kindTransactions, assets: m.kindAssets };
    const kind = kinds[p.lastError.kind] ?? p.lastError.kind;
    return { kind: 'error', text: m.stateError(kind), title: p.lastError.message, hint: explainError(p.lastError.message, m) };
  }
  if (!p.lastSyncAt) {
    const recent = Date.now() - new Date(p.createdAt).getTime() < FIRST_SYNC_GRACE_MS;
    if (syncRunning || recent) return { kind: 'pending', text: m.statePending };
    return { kind: 'stale', text: m.stateNoFirstSync, hint: m.noFirstSyncHint };
  }
  if (Date.now() - new Date(p.lastSyncAt).getTime() > staleAfterMs) return { kind: 'stale', text: m.stateStale };
  return { kind: 'ok', text: m.stateOk };
}
