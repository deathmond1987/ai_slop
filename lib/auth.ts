export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

export const STEAM_OPENID_NS = "http://specs.openid.net/auth/2.0";
export const STEAM_OPENID_IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";

export function buildSteamOpenIdLoginUrl(origin: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const returnTo = `${normalizedOrigin}/auth/callback`;
  const params = new URLSearchParams({
    "openid.ns": STEAM_OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": normalizedOrigin,
    "openid.identity": STEAM_OPENID_IDENTIFIER_SELECT,
    "openid.claimed_id": STEAM_OPENID_IDENTIFIER_SELECT,
  });

  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export function collectSignedOpenIdParams(params: URLSearchParams): URLSearchParams {
  const signedRaw = params.get("openid.signed");
  const signedKeys = signedRaw ? signedRaw.split(",") : [];
  const out = new URLSearchParams();
  out.set("openid.mode", "check_authentication");
  out.set("openid.ns", params.get("openid.ns") ?? "");
  out.set("openid.signed", signedRaw ?? "");
  out.set("openid.sig", params.get("openid.sig") ?? "");

  for (const key of signedKeys) {
    const value = params.get(`openid.${key}`);
    if (value !== null) out.set(`openid.${key}`, value);
  }

  return out;
}
