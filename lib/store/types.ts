import type { PaymentInput, PaymentResult, SiteState } from "../types";

export type Store = {
  kind: "redis" | "memory";
  /**
   * Read the world at `now`. Creates the clock at `coldExpires` if it has never
   * existed, and freezes the site if the clock has run out.
   * `limit` caps the ledger lines returned; -1 returns all of them.
   */
  read(now: number, coldExpires: number, limit: number): Promise<SiteState>;
  /** Apply one payment atomically. */
  apply(now: number, coldExpires: number, payment: PaymentInput): Promise<PaymentResult>;
};
