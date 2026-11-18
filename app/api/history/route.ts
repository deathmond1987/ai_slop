import { NextResponse } from "next/server";
import { getHistory } from "@/lib/history";
import { getSteamSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await getHistory(await getSteamSession());
  return NextResponse.json(result, { status: result.reason === "signed_out" ? 401 : 200 });
}
