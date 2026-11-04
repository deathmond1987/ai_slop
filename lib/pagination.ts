export const GRID_DAY_CAP = 1;

export function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === "") continue;
        usp.append(key, String(item));
      }
      continue;
    }
    usp.set(key, String(value));
  }
  return usp.toString();
}
