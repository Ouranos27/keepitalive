import { INITIAL_SECONDS, crownPriceUsd } from "../clock";
import { standingsFrom } from "../standings";
import type { PaymentInput, PaymentResult, SiteState } from "../types";
import { LIVE_LEDGER_LIMIT } from "./keys";
import { createMemoryStore } from "./memory";
import { createRedisStore } from "./redis";
import type { Store } from "./types";

let store: Store | null = null;

/**
 * Upstash if it is configured, memory otherwise. There is no third option and
 * no fallback at runtime: a production deploy without Redis would hand every
 * serverless instance its own private clock.
 */
export function getStore(): Store {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  store = url && token ? createRedisStore(url, token) : createMemoryStore();
  return store;
}

/**
 * When the clock should expire if it has never been set.
 *
 * CLOCK_LAUNCH_AT pins the start to a deploy-time instant so that a cold start
 * an hour after launch does not hand the site a fresh 24 hours. Without it the
 * clock starts at the first read, which is what you want locally and nowhere
 * else.
 */
export function coldExpiresAt(now: number): number {
  const launchAt = Number(process.env.CLOCK_LAUNCH_AT);
  const start = Number.isFinite(launchAt) && launchAt > 0 ? launchAt : now;
  return start + INITIAL_SECONDS * 1000;
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

export { LIVE_LEDGER_LIMIT };
export type { Store };
