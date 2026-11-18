import { NextResponse } from "next/server";
import {
  addEarlyAccessBlacklist,
  listEarlyAccessBlacklist,
  removeEarlyAccessBlacklist,
} from "@/lib/early-access-blacklist";
import { getSteamSession } from "@/lib/session";

export const dynamic = "force-dynamic";

async function steamIdOrNull(): Promise<string | null> {
  const session = await getSteamSession();
  return session?.steamId ?? null;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  const steamId = await steamIdOrNull();
  if (!steamId) return unauthorized();
  return NextResponse.json({ ok: true, entries: await listEarlyAccessBlacklist(steamId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const steamId = await steamIdOrNull();
  if (!steamId) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    appid?: unknown;
    name?: unknown;
    headerImage?: unknown;
  } | null;
  const appid = Number(body?.appid);
  const ok = await addEarlyAccessBlacklist(steamId, {
    appid,
    name: typeof body?.name === "string" ? body.name : undefined,
    headerImage: typeof body?.headerImage === "string" ? body.headerImage : undefined,
  });
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const steamId = await steamIdOrNull();
  if (!steamId) return unauthorized();

  const body = (await request.json().catch(() => null)) as { appids?: unknown } | null;
  const appids = Array.isArray(body?.appids) ? body.appids.map(Number) : [];
  const removed = await removeEarlyAccessBlacklist(steamId, appids);
  return NextResponse.json({ ok: true, removed });
}
