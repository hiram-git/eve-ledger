import type { Pilot } from './api';
import type { Messages } from './i18n';

export type PilotState = { kind: 'ok' | 'pending' | 'stale' | 'error'; text: string; title?: string; hint?: string };

// Errors arrive from the API in technical Spanish/English: they are explained in the chosen language
export function explainError(message: string, m: Messages): string {
  if (/invalid_grant|refresh token/i.test(message)) return m.errToken;
  if (/descifrar|ENC_KEY/i.test(message)) return m.errDecrypt;
  if (/cambió de dueño|owner/i.test(message)) return m.errOwner;
  if (/ESI (401|403)/.test(message)) return m.errForbidden;
  if (/ESI (420|429)/.test(message)) return m.errRate;
  if (/ESI 5\d\d/.test(message)) return m.errDown;
  return message;
}

// A first sync that has logged nothing in this time is no longer "in progress": the API restarted halfway
// or the sync never started. If a sync is running right now, it may well be this one
const FIRST_SYNC_GRACE_MS = 10 * 60_000;

// Optional scopes: the wallet works without them, but the inventory or the lost ships are missing
export const ASSETS_SCOPE = 'esi-assets.read_assets.v1';
export const LOSSES_SCOPE = 'esi-killmails.read_killmails.v1';
export const CONTRACTS_SCOPE = 'esi-contracts.read_character_contracts.v1';
export const SKILLS_SCOPE = 'esi-skills.read_skills.v1';

// Needs attention: the sync is not up to date or a scope is missing (both are fixed from Pilotos).
// This is what the amber dot on «Pilotos» in the navigation counts
export const hasIssue = (p: Pilot, st: PilotState) => st.kind !== 'ok' || p.missingScopes.length > 0;

// A pilot's sync state: the same on the Pilotos page and in the summary's notice line
export function pilotState(p: Pilot, m: Messages, staleAfterMs: number, syncRunning = false): PilotState {
  if (p.lastError) {
    const kinds: Record<string, string> = {
      journal: m.kindJournal,
      transactions: m.kindTransactions,
      assets: m.kindAssets,
      killmails: m.kindKillmails,
      contracts: m.kindContracts,
      skills: m.kindSkills,
      loyalty: m.kindLoyalty,
    };
    const kind = kinds[p.lastError.kind] ?? p.lastError.kind;
    const hint = explainError(p.lastError.message, m);
    // An expired token has the same name everywhere (card, health line and Pilotos)
    const text = hint === m.errToken ? m.stateToken : m.stateError(kind);
    return { kind: 'error', text, title: p.lastError.message, hint };
  }
  // Just (re)linked and no sync since then: its sync is running (also when relinking a pilot that has data)
  const recent = Date.now() - new Date(p.linkedAt ?? p.createdAt).getTime() < FIRST_SYNC_GRACE_MS;
  const syncedSinceLink = !!p.lastSyncAt && new Date(p.lastSyncAt) >= new Date(p.linkedAt ?? p.createdAt);
  if (p.lastSyncAt && !syncedSinceLink && (syncRunning || recent)) return { kind: 'pending', text: m.syncing };
  if (!p.lastSyncAt) {
    if (syncRunning || recent) return { kind: 'pending', text: m.statePending };
    // If it is also missing a scope, the action is to relink (grants the scopes and starts the first sync)
    return { kind: 'stale', text: m.stateNoFirstSync, hint: p.missingScopes.length ? m.noFirstSyncRelinkHint : m.noFirstSyncHint };
  }
  if (Date.now() - new Date(p.lastSyncAt).getTime() > staleAfterMs) return { kind: 'stale', text: m.stateStale };
  return { kind: 'ok', text: m.stateOk };
}
