import { NextResponse } from "next/server";
import { getSteamSession } from "@/lib/session";
import { getWishlistTotalForSession } from "@/lib/wishlist-total-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const searchParams = new URL(request.url).searchParams;
  const refreshRequested =
    searchParams.get("refresh") === "1" ||
    (searchParams.get("k")?.includes("|refresh=1") ?? false);

  const session = await getSteamSession();
  if (refreshRequested) {
    const forced = await getWishlistTotalForSession(session, {
      refresh: true,
      force: true,
    });
    return NextResponse.json(forced);
  }

  const cached = await getWishlistTotalForSession(session, { refresh: false });

  if (cached.ready || cached.reason !== "not_cached") {
    return NextResponse.json(cached);
  }

  const refreshed = await getWishlistTotalForSession(session, { refresh: true });
  return NextResponse.json(refreshed);
}
