/**
 * Next.js may bundle the same lib module into several server chunks (page SSR,
 * route handlers, server actions). Plain module-level state is then duplicated
 * per chunk, which silently breaks in-flight dedupe, rate limiting and
 * concurrency caps. Keep such state on globalThis so every chunk shares it.
 */
export function processSingleton<T>(name: string, init: () => T): T {
  const key = Symbol.for(`steam-calendar:${name}`);
  const store = globalThis as unknown as Record<symbol, T | undefined>;
  const existing = store[key];
  if (existing !== undefined) return existing;
  const value = init();
  store[key] = value;
  return value;
}
