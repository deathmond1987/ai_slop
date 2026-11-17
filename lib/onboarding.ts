import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getOrCreateSessionSecret } from "./auth-store";
import { normalizeSteamStoreCc } from "./store-cc";
import { shouldUseSecureSessionCookie } from "./requestOrigin";

export const PENDING_ONBOARDING_COOKIE = "steam_calendar_pending_onboarding";

const PENDING_ONBOARDING_MAX_AGE = 60 * 15;
const PENDING_ONBOARDING_SALT = "steam-calendar-pending-onboarding:v1";
const PENDING_ONBOARDING_AAD = Buffer.from(PENDING_ONBOARDING_COOKIE, "utf8");
const MAX_PENDING_SECRET_LENGTH = 256;

export interface PendingOnboardingSettings {
  steamApiKey?: string;
  rawgApiKey?: string;
  storeCc?: string;
}

function optionalFormValue(formData: FormData, key: string): string | undefined {
  if (!formData.has(key)) return undefined;
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PENDING_SECRET_LENGTH) return undefined;
  return trimmed;
}

function hasPendingSettings(data: PendingOnboardingSettings): boolean {
  return Boolean(data.steamApiKey || data.rawgApiKey || data.storeCc);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pendingEncryptionKey(rawSeed: string): Buffer {
  return scryptSync(rawSeed, Buffer.from(PENDING_ONBOARDING_SALT, "utf8"), 32);
}

function isBase64UrlPart(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export function pendingSettingsFromFormData(formData: FormData): PendingOnboardingSettings {
  return {
    steamApiKey: optionalFormValue(formData, "steamApiKey"),
    rawgApiKey: optionalFormValue(formData, "rawgApiKey"),
    storeCc: normalizeSteamStoreCc(optionalFormValue(formData, "storeCc")),
  };
}

export async function encryptPendingOnboardingSettings(
  settings: PendingOnboardingSettings
): Promise<string> {
  const key = pendingEncryptionKey(await getOrCreateSessionSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(PENDING_ONBOARDING_AAD);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(settings), "utf8"),
    cipher.final(),
  ]);

  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export async function decryptPendingOnboardingSettings(
  raw: string
): Promise<PendingOnboardingSettings | null> {
  try {
    const parts = raw.split(".");
    if (parts.length !== 3 || !parts.every(isBase64UrlPart)) return null;

    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const key = pendingEncryptionKey(await getOrCreateSessionSecret());
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(PENDING_ONBOARDING_AAD);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
    if (!isRecord(parsed)) return null;

    const settings: PendingOnboardingSettings = {
      steamApiKey: typeof parsed.steamApiKey === "string" ? parsed.steamApiKey : undefined,
      rawgApiKey: typeof parsed.rawgApiKey === "string" ? parsed.rawgApiKey : undefined,
      storeCc: typeof parsed.storeCc === "string" ? normalizeSteamStoreCc(parsed.storeCc) : undefined,
    };

    return hasPendingSettings(settings) ? settings : null;
  } catch {
    return null;
  }
}

export async function readPendingOnboardingSettings(): Promise<PendingOnboardingSettings | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_ONBOARDING_COOKIE)?.value;
  if (!raw) return null;
  return decryptPendingOnboardingSettings(raw);
}

export async function clearPendingOnboardingSettings(): Promise<void> {
  const cookieStore = await cookies();
  const cookieSecure = shouldUseSecureSessionCookie(await headers());
  cookieStore.set(PENDING_ONBOARDING_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: 0,
  });
}

export function hasPendingOnboardingSettings(data: PendingOnboardingSettings): boolean {
  return hasPendingSettings(data);
}

export async function savePendingOnboardingSettings(
  settings: PendingOnboardingSettings
): Promise<void> {
  if (!hasPendingSettings(settings)) {
    await clearPendingOnboardingSettings();
    return;
  }

  const cookieStore = await cookies();
  const cookieSecure = shouldUseSecureSessionCookie(await headers());
  cookieStore.set(PENDING_ONBOARDING_COOKIE, await encryptPendingOnboardingSettings(settings), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: PENDING_ONBOARDING_MAX_AGE,
  });
}

export async function savePendingOnboardingSettingsFromFormData(
  formData: FormData
): Promise<void> {
  await savePendingOnboardingSettings(pendingSettingsFromFormData(formData));
}
