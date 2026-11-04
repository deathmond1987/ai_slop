import type { Lang } from "./types";
import { DICTS, DEFAULT_DICT } from "./dicts";

export const DEFAULT_LANG: Lang = "ru";
export const LANG_COOKIE = "ui_lang";

export function tFor(lang: Lang) {
  const dict = DICTS[lang];
  return (key: string) => dict[key] ?? DEFAULT_DICT[key] ?? key;
}

const MONTHS: Record<Lang, string[]> = {
  ru: [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

const WEEKDAYS: Record<Lang, string[]> = {
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

const MONTHS_GENITIVE: Record<Lang, string[]> = {
  ru: [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

function parseIsoParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function monthGenitive(lang: Lang, monthIndex: number) {
  return MONTHS_GENITIVE[lang][monthIndex];
}

export function monthName(lang: Lang, monthIndex: number) {
  return MONTHS[lang][monthIndex];
}

export function weekdayNames(lang: Lang) {
  return WEEKDAYS[lang];
}

function formatGroupedNumber(n: number, lang: Lang): string {
  const digits = String(n);
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    groups.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return groups.join(lang === "ru" ? " " : ",");
}

export function formatPlaytime(minutes: number, lang: Lang): string {
  if (!minutes || minutes < 0) return "—";
  if (minutes < 60) return lang === "ru" ? `${minutes} мин` : `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 1000) return lang === "ru" ? `${h} ч` : `${h}h`;
  return lang === "ru" ? `${formatGroupedNumber(h, "ru")} ч` : `${formatGroupedNumber(h, "en")}h`;
}

export function formatDate(iso: string, lang: Lang): string {
  const parts = parseIsoParts(iso);
  if (!parts) return iso;
  return `${parts.day} ${monthGenitive(lang, parts.month - 1)}`;
}

export function formatDateWithYear(iso: string, lang: Lang): string {
  const parts = parseIsoParts(iso);
  if (!parts) return iso;
  return `${parts.day} ${monthGenitive(lang, parts.month - 1)} ${parts.year}`;
}

export function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}
