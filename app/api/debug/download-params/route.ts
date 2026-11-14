import { NextResponse } from "next/server";
import { appDetailsRetryQueueStats } from "@/lib/app-details-retry";
import { configureSteamAppDetailsRetry } from "@/lib/steam";
import { steamAppDetailsDebugParamsEnabled, steamAppDetailsDownloadParams } from "@/lib/steam-core";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (!steamAppDetailsDebugParamsEnabled()) {
    return NextResponse.json({ ok: false, reason: "debug_disabled" }, { status: 404 });
  }

  configureSteamAppDetailsRetry();

  return NextResponse.json({
    ok: true,
    downloadParams: steamAppDetailsDownloadParams(),
    retryQueue: appDetailsRetryQueueStats(),
  });
}
