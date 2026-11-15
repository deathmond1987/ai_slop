import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { logDebug } from "@/lib/debug";
import { getExternalOrigin, shouldUseSecureSessionCookie } from "@/lib/requestOrigin";
import { THEME_COOKIE, parseThemePreference } from "@/lib/theme-mode";

function safeBackUrl(req: NextRequest, referer: string | null): string | null {
  if (!referer) return null;

  try {
    const target = new URL(referer);
    const expected = new URL(getExternalOrigin(req));
    if (target.origin !== expected.origin) return null;
    if (target.pathname === "/theme") return null;

    target.hash = "";
    return `${expected.origin}${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const preference = parseThemePreference(String(form.get("theme") ?? ""));
  const cookieStore = await cookies();
  const secure = shouldUseSecureSessionCookie(req.headers);

  if (preference === "system") {
    cookieStore.delete(THEME_COOKIE);
  } else {
    cookieStore.set(THEME_COOKIE, preference, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure,
      httpOnly: false,
    });
  }

  logDebug("theme.saved", {
    preference,
    cookiePresent: preference !== "system",
  });

  const target =
    safeBackUrl(req, req.headers.get("referer")) ?? `${getExternalOrigin(req)}/`;
  return NextResponse.redirect(target, 303);
}
