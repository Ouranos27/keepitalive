import { crownPriceUsd } from "../clock";
import { coldExpiresAt, config } from "../env";
import { standingsFrom } from "../standings";
import type { PaymentInput, PaymentResult, SiteState } from "../types";
import { LIVE_LEDGER_LIMIT } from "./keys";
import { createMemoryStore } from "./memory";
import { createRedisStore } from "./redis";
import type { Store } from "./types";

let store: Store | null = null;

/**
 * Upstash if it is configured, memory otherwise.
 *
 * Falling back to memory is correct locally and catastrophic in production,
 * where every serverless instance would keep a private clock and a webhook
 * would land on whichever one answered. lib/env.ts refuses to boot a
 * production build in that state, so by the time this runs the choice is safe.
 */
export function getStore(): Store {
  if (store) return store;
  store = config.redis
    ? createRedisStore(config.redis.url, config.redis.token)
    : createMemoryStore();
  return store;
}

/**
 * Read the site and fold the ledger into a board.
 *
 * The store hands back every entry because the standings are derived from all
 * of them. What reaches the page is the ranked board plus a recent slice of the
 * ledger, or the whole ledger when `full` is set, which is the memorial.
 */
export async function readState(options?: { full?: boolean }): Promise<SiteState> {
  const now = Date.now();
  const raw = await getStore().read(now, coldExpiresAt(now));
  const lifeline = raw.frozen?.lifeline ?? raw.lifeline;

  return {
    ...raw,
    lifeline,
    crown_price: crownPriceUsd(lifeline?.amount ?? null),
    standings: standingsFrom(raw.ledger, lifeline?.url ?? null),
    ledger: options?.full ? raw.ledger : raw.ledger.slice(0, LIVE_LEDGER_LIMIT),
  };
}

/** Apply a payment. The webhook is the only caller that matters. */
export function recordPayment(payment: PaymentInput): Promise<PaymentResult> {
  const now = Date.now();
  return getStore().apply(now, coldExpiresAt(now), payment);
}

export { LIVE_LEDGER_LIMIT, coldExpiresAt };
export type { Store };
