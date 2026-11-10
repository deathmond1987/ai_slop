import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildSteamOpenIdLoginUrl } from "@/lib/auth";
import { logDebug } from "@/lib/debug";
import { getExternalOrigin } from "@/lib/requestOrigin";

export async function GET(req: NextRequest) {
  const origin = getExternalOrigin(req);
  const redirectUrl = buildSteamOpenIdLoginUrl(origin);
  const url = new URL(redirectUrl);
  const returnTo = url.searchParams.get("openid.return_to") ?? "";
  const returnToUrl = new URL(returnTo);

  logDebug("auth.login.redirect", {
    hasReturnTo: Boolean(returnTo),
    returnToHost: returnToUrl.host,
    returnToProtocol: returnToUrl.protocol.replace(":", ""),
  });

  return NextResponse.redirect(redirectUrl, {
    headers: { "Cache-Control": "no-store" },
  });
}
