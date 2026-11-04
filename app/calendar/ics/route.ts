import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getSteamIdFromCalendarFeedToken,
  getSteamSessionData,
} from "@/lib/auth-store";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import { buildIcsCalendar } from "@/lib/ical";
import { requireSteamSession } from "@/lib/session";
import { collectUpcoming } from "@/lib/upcoming";
import type { IdentifiedSession } from "@/lib/types";

export const dynamic = "force-dynamic";

async function sessionFromFeedToken(token: string): Promise<IdentifiedSession | null> {
  const steamId = await getSteamIdFromCalendarFeedToken(token);
  if (!steamId) {
    logDebug("ics.feed_token.invalid");
    return null;
  }

  const data = await getSteamSessionData(steamId);
  if (!data?.steamId) {
    logDebug("ics.feed_token.session_missing");
    return null;
  }

  return {
    steamId: data.steamId,
    displayName: data.displayName,
    avatar: data.avatar,
    apiKey: data.apiKey,
    rawgApiKey: data.rawgApiKey,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const feedToken = req.nextUrl.searchParams.get("token");
  let session: IdentifiedSession | null = null;

  if (feedToken) {
    logDebug("ics.request.with_token", { tokenPresent: true });
    session = await sessionFromFeedToken(feedToken);
    if (!session) {
      return new NextResponse("Invalid calendar feed token", { status: 401 });
    }
  } else {
    logDebug("ics.request.with_session");
    session = await requireSteamSession();
    if (!session) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
  }

  try {
    const result = await collectUpcoming(
      session,
      session.rawgApiKey ?? process.env.RAWG_API_KEY
    );
    const body = buildIcsCalendar(result.games);
    logDebug("ics.built", {
      gameCount: result.games.length,
      bodyLength: body.length,
    });

    return new NextResponse(body, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": "inline; filename=steam-calendar.ics",
        "content-type": "text/calendar; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    logDebug("ics.build_failed", {
      error: sanitizeDebugError(error),
    });
    return new NextResponse("Failed to build calendar export", { status: 500 });
  }
}
