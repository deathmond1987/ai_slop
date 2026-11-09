import { NextResponse } from "next/server";
import { getSteamSession } from "@/lib/session";
import { getWishlistTotalForSession } from "@/lib/wishlist-total-cache";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getSteamSession();
  const total = await getWishlistTotalForSession(session, { refresh: true });
  return NextResponse.json(total);
}
