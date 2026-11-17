import { NextResponse } from "next/server";
import { getEarlyAccessSessionResult, lookupEarlyAccessAppIds } from "@/lib/early-access";
import { getSteamSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function searchBoolean(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function searchPages(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const options = {
    refresh:
      searchBoolean(params.get("refresh")) || (params.get("k")?.includes("|refresh=1") ?? false),
    full: searchBoolean(params.get("full")),
    pages: searchPages(params.get("pages")),
  };

  const session = await getSteamSession();
  const appids = params.get("appids");
  const experimentalEarlyAccess = session?.experimentalEarlyAccess === true;

  if (appids) {
    const result = await lookupEarlyAccessAppIds(appids, {
      ...options,
      steamId: session?.steamId,
      storeCc: session?.storeCc,
      experimentalEarlyAccess,
    });
    return NextResponse.json(result);
  }

  const result = await getEarlyAccessSessionResult(session, options);
  return NextResponse.json(result);
}