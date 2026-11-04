import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { logDebug } from "@/lib/debug";
import { saveUserLang } from "@/lib/auth-store";
import { LANG_COOKIE } from "@/lib/i18n";
import { requireSteamSession } from "@/lib/session";
import type { Lang } from "@/lib/types";
import { getExternalOrigin } from "@/lib/requestOrigin";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const lang: Lang = String(form.get("lang") ?? "ru") === "en" ? "en" : "ru";
  const cookieStore = await cookies();
  cookieStore.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const session = await requireSteamSession();
  logDebug("auth.lang.saved", { lang, cookieSaved: true, sessionPresent: Boolean(session) });
  if (session) {
    await saveUserLang(session.steamId, lang);
  }
  const referer = req.headers.get("referer");
  return referer ? NextResponse.redirect(referer) : NextResponse.redirect(`${getExternalOrigin(req)}/`);
}
