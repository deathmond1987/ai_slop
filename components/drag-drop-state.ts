const DROP_HANDLED_KEY = "__steamCalendarDropHandled";

/** Marks that a drag was consumed by a drop zone (drop fires before dragend). */
export function markDropHandled(): void {
  (window as unknown as Record<string, unknown>)[DROP_HANDLED_KEY] = true;
}

export function consumeDropHandled(): boolean {
  const store = window as unknown as Record<string, unknown>;
  const handled = store[DROP_HANDLED_KEY] === true;
  store[DROP_HANDLED_KEY] = false;
  return handled;
}
