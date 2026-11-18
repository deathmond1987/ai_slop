import { NextResponse } from "next/server";
import { getAccountStats } from "@/lib/account-stats";
import { getSteamSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const stats = await getAccountStats(await getSteamSession());
  return NextResponse.json(stats, { status: stats.ready ? 200 : 401 });
}
