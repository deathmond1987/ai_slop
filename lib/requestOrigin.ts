import type { NextRequest } from "next/server";

export function getExternalOriginFromHeaders(headers: Headers): string {
  const configured = process.env.AUTH_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const fwdHost = headers.get("x-forwarded-host");
  const host = (fwdHost ?? headers.get("host") ?? "").split(",")[0]!.trim();
  if (!host) return "";

  const fwdProto = headers.get("x-forwarded-proto");
  const proto = fwdProto ? fwdProto.split(",")[0]!.trim() : "http";

  return `${proto}://${host}`;
}

export function getExternalOrigin(req: NextRequest): string {
  const fromHeaders = getExternalOriginFromHeaders(req.headers);
  if (fromHeaders) return fromHeaders;

  const url = req.nextUrl;
  return `${url.protocol.replace(":", "")}://${url.host}`;
}

function parseSecureOverride(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return null;
}

function isHttpsOrigin(origin: string | undefined): boolean | null {
  if (!origin) return null;
  try {
    return new URL(origin).protocol === "https:";
  } catch {
    return /^https:\/\//i.test(origin);
  }
}

export function shouldUseSecureSessionCookie(headers: Headers): boolean {
  const override = parseSecureOverride(process.env.COOKIE_SECURE);
  if (override !== null) return override;

  const configured = process.env.AUTH_BASE_URL?.trim();
  const configuredSecure = isHttpsOrigin(configured);
  if (configuredSecure !== null) return configuredSecure;

  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto.toLowerCase() === "https";

  const originSecure = isHttpsOrigin(getExternalOriginFromHeaders(headers));
  if (originSecure !== null) return originSecure;

  return false;
}
