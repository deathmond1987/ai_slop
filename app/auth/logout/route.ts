import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logDebug } from "@/lib/debug";
import { destroySteamSession } from "@/lib/session";
import { getExternalOrigin } from "@/lib/requestOrigin";

export async function POST(req: NextRequest) {
  logDebug("auth.logout.destroy.start");
  await destroySteamSession();
  return NextResponse.redirect(`${getExternalOrigin(req)}/`);
}
