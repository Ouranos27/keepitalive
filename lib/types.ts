import type { Tier } from "./clock";

/** A permanent line in the public ledger. Survives death. */
export type LedgerEntry = {
  /** Payment id. Doubles as the idempotency key for webhook retries. */
  id: string;
  name: string | null;
  url: string | null;
  /** USD. */
  amount: number;
  tier: Tier;
  /** Did this payment take The Lifeline? */
  crowned: boolean;
  /** Seconds the clock actually moved. */
  seconds_added: number;
  /** What the curve granted before the 72h ceiling clipped it. */
  seconds_granted: number;
  /** Clock reading immediately after this payment. Peak is derived from these. */
  remaining_after: number;
  /** Unix ms. */
  ts: number;
};

/** The one slot. Whoever holds it at zero holds it forever. */
export type Lifeline = {
  name: string | null;
  url: string | null;
  amount: number;
  ts: number;
} | null;

/** Written once, at death. Every request after that serves this. */
export type FrozenSnapshot = {
  /** Unix ms of the exact second the clock ran out. */
  died_at: number;
  lifeline: Lifeline;
  total_raised: number;
  total_payers: number;
  /** Longest the clock ever reached, in seconds. */
  peak_seconds: number;
};

/** Everything a page render needs, alive or dead. */
export type SiteState = {
  alive: boolean;
  /** Server time the state was read at, unix ms. The client reconciles to this. */
  now: number;
  /** Unix ms. When dead, the instant it froze. */
  expires_at: number;
  /** Seconds left. Zero when dead. */
  remaining: number;
  lifeline: Lifeline;
  /** Price on the button, right now. */
  crown_price: number;
  ledger: LedgerEntry[];
  total_payers: number;
  frozen: FrozenSnapshot | null;
};

export type PaymentInput = {
  id: string;
  amount: number;
  tier: Tier;
  name: string | null;
  url: string | null;
  ts: number;
};

export type PaymentResult =
  | { status: "applied"; seconds_added: number; seconds_granted: number; crowned: boolean }
  /** The webhook arrived after the freeze. Refund it; do not extend. */
  | { status: "dead" }
  /** Already processed. Webhook retries land here. */
  | { status: "duplicate" };
