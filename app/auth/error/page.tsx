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
  return (
    <section className="app-shell mt-10 text-center flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Auth error</h1>
      <p className="opacity-70">reason: {reason}</p>
      <Link href="/" className="underline">
        {t("nav.calendar")}
      </Link>
    </section>
  );
}
