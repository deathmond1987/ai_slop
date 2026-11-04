import { createHash } from "node:crypto";

export function shortHash(value?: string): string {
  if (!value) return "none";
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function keyHash(key: string, cached?: string): string {
  return cached ?? shortHash(key);
}
