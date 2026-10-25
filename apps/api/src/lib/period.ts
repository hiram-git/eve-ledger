export const DAY_MS = 86_400_000;

// Start of a period of `days` days: 00:00 EVE (UTC) `days - 1` days ago, so the first day is complete (1 = today)
export const periodFrom = (days: number, now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
