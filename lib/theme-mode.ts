import "server-only";
import { cookies } from "next/headers";

export type ThemePreference = "light" | "lightExperimental" | "dark" | "system";

export const THEME_COOKIE = "ui_theme";

export function parseThemePreference(
  value: string | null | undefined,
): ThemePreference {
  if (value === "dark") return "dark";
  if (value === "light") return "light";
  if (value === "lightExperimental") return "lightExperimental";
  return "system";
}

export async function getThemePreference(): Promise<ThemePreference> {
  return parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
}

export function themeClass(preference: ThemePreference): string {
  if (preference === "lightExperimental") return "light light-experimental";
  return preference === "system" ? "theme-system" : preference;
}
