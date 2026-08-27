/**
 * Four product keys, plus one for payment hygiene.
 *
 * `clock:seen` is the deliberate fifth: Polar retries webhooks, and without an
 * idempotency set a retry would grant the same payment's time twice. It holds
 * payment ids and nothing else. It is not product state.
 */
export const KEYS = {
  expires: "clock:expires_at",
  frozen: "clock:frozen",
  lifeline: "lifeline",
  ledger: "ledger",
  seen: "clock:seen",
} as const;

/** The order every Lua script expects. */
export const KEY_ORDER = [
  KEYS.expires,
  KEYS.frozen,
  KEYS.lifeline,
  KEYS.ledger,
  KEYS.seen,
] as const;

/** How many ledger lines the live page carries. The memorial takes all of them. */
export const LIVE_LEDGER_LIMIT = 12;
