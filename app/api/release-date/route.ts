import { NextResponse } from "next/server";
import {
  listManualReleaseDates,
  removeManualReleaseDate,
  setManualReleaseDate,
} from "@/lib/manual-release-dates";
import { getSteamSession } from "@/lib/session";

export const dynamic = "force-dynamic";

async function steamIdOrNull(): Promise<string | null> {
  return (await getSteamSession())?.steamId ?? null;
}

export async function GET(): Promise<NextResponse> {
  const steamId = await steamIdOrNull();
  if (!steamId) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
  return NextResponse.json({ ok: true, entries: await listManualReleaseDates(steamId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const steamId = await steamIdOrNull();
  if (!steamId) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    appid?: unknown;
    releaseDate?: unknown;
    name?: unknown;
    headerImage?: unknown;
  } | null;
  const ok = await setManualReleaseDate(steamId, {
    appid: Number(body?.appid),
    releaseDate: typeof body?.releaseDate === "string" ? body.releaseDate : "",
    name: typeof body?.name === "string" ? body.name : undefined,
    headerImage: typeof body?.headerImage === "string" ? body.headerImage : undefined,
  });
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const steamId = await steamIdOrNull();
  if (!steamId) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { appid?: unknown } | null;
  const ok = await removeManualReleaseDate(steamId, Number(body?.appid));
  return NextResponse.json({ ok });
}
