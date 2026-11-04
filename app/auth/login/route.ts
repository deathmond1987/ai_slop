import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logDebug } from "@/lib/debug";
import { getExternalOrigin } from "@/lib/requestOrigin";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

export async function GET(req: NextRequest) {
  const origin = getExternalOrigin(req);
  const returnTo = `${origin}/auth/callback`;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  const returnToUrl = new URL(returnTo);
  logDebug("auth.login.redirect", {
    hasReturnTo: Boolean(returnTo),
    returnToHost: returnToUrl.host,
    returnToProtocol: returnToUrl.protocol.replace(":", ""),
  });
  return NextResponse.redirect(`${STEAM_OPENID_ENDPOINT}?${params.toString()}`);
}
