import "server-only";
import { cookies } from "next/headers";
import type { Lang } from "./types";
import { DICTS } from "./dicts";
import { DEFAULT_LANG, LANG_COOKIE } from "./i18n-core";
import { getUserPreferences } from "./auth-store";

export {
  DEFAULT_LANG,
  LANG_COOKIE,
  tFor,
  monthName,
  weekdayNames,
  formatPlaytime,
  formatDate,
  formatDateWithYear,
  formatTemplate,
} from "./i18n-core";

export async function getLang(steamId?: string): Promise<Lang> {
  const raw = (await cookies()).get(LANG_COOKIE)?.value;
  if (raw === "en" || raw === "ru") return raw;

  if (steamId) {
    const prefs = await getUserPreferences(steamId);
    if (prefs?.lang) return prefs.lang;
  }

  return DEFAULT_LANG;
}

export async function getT(steamId?: string): Promise<(key: string) => string> {
  const lang = await getLang(steamId);
  const dict = DICTS[lang];
  return (key: string) => dict[key] ?? DICTS.en[key] ?? key;
}
