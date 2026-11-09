import type { Lang } from "./types.ts";

const ZERO_DECIMAL_CURRENCIES = new Set(["jpy", "krw", "vnd", "clp", "cop"]);

const MONEY_PATTERNS: Record<Lang, { group: string; decimal: string; codeAfter: boolean }> = {
  en: { group: ",", decimal: ".", codeAfter: false },
  ru: { group: "\u00a0", decimal: ",", codeAfter: true },
};

function groupIntegerDigits(digits: string, group: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

export function formatMoney(
  totalCents: number,
  currency: string | null | undefined,
  lang: Lang
): string {
  const pattern = MONEY_PATTERNS[lang] ?? MONEY_PATTERNS.en;
  const currencyCode = currency?.trim() ? currency.trim().toUpperCase() : null;
  const fractionDigits =
    currencyCode && ZERO_DECIMAL_CURRENCIES.has(currencyCode.toLowerCase()) ? 0 : 2;
  const fixed = Math.abs(totalCents / 100).toFixed(fractionDigits);
  const [integerPart, fractionPart] = fixed.split(".");
  const body = `${groupIntegerDigits(integerPart, pattern.group)}${
    fractionPart ? `${pattern.decimal}${fractionPart}` : ""
  }`;
  const amount = totalCents < 0 ? `-${body}` : body;

  if (!currencyCode) return amount;

  return pattern.codeAfter ? `${amount}\u00a0${currencyCode}` : `${currencyCode} ${amount}`;
}
