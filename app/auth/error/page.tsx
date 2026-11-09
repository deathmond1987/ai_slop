import { logDebug } from "@/lib/debug";
import { getT } from "@/lib/i18n";
import Link from "next/link";

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getT();
  const sp = await searchParams;
  const reason = Array.isArray(sp.reason) ? sp.reason[0] : sp.reason ?? "unknown";
  logDebug("auth.error.render", { reason });
  const reasonLabels: Record<string, string> = {
    bad_mode: t("auth.reason.bad_mode"),
    openid_timeout: t("auth.reason.openid_timeout"),
    invalid_sig: t("auth.reason.invalid_sig"),
    no_steam_id: t("auth.reason.no_steam_id"),
  };
  const reasonLabel = reasonLabels[reason] ?? t("auth.reason.unknown");
  return (
    <section className="app-shell mt-10 text-center flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Auth error</h1>
      <p className="opacity-80">{reasonLabel}</p>
      <p className="opacity-50 text-xs">reason: {reason}</p>
      <div className="flex items-center justify-center gap-4">
        <a href="/auth/login" className="underline">
          {t("auth.retry")}
        </a>
        <Link href="/" className="underline">
          {t("nav.calendar")}
        </Link>
      </div>
    </section>
  );
}
