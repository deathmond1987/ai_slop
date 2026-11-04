import type { Lang } from "./types";
import ru from "@/i18n/ru.json";
import en from "@/i18n/en.json";

export const DICTS: Record<Lang, Record<string, string>> = {
  ru: ru as Record<string, string>,
  en: en as Record<string, string>,
};

export const DEFAULT_DICT: Record<string, string> = DICTS.en;
