import { redirect } from "next/navigation";
import { logDebug } from "@/lib/debug";
import { getT } from "@/lib/i18n";
import { getSteamSession } from "@/lib/session";

export default async function Home() {
  const [t, session] = await Promise.all([getT(), getSteamSession()]);
  logDebug("home.page.render", { hasSession: Boolean(session?.steamId) });
  if (session?.steamId) redirect("/calendar");

  return (
    <section className="app-shell mt-10 flex flex-col gap-6 text-center">
      <h1 className="text-3xl font-semibold">{t("auth.title")}</h1>
      <p className="opacity-70">{t("auth.desc")}</p>
      <div>
        <a
          href="/auth/login"
          className="inline-flex items-center gap-2 rounded bg-[#1b2838] px-5 py-3 text-white hover:bg-[#2a475e]"
        >
          {t("auth.button")}
        </a>
      </div>
    </section>
  );
}
