const STORE_CC_RE = /^[a-z]{2}$/;

export function normalizeSteamStoreCc(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return STORE_CC_RE.test(normalized) ? normalized : undefined;
}

export function formatSteamStoreCc(value?: string | null): string {
  const normalized = normalizeSteamStoreCc(value);
  return normalized ? normalized.toUpperCase() : "";
}
