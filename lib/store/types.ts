import type { PaymentInput, PaymentResult, RawState } from "../types";

export type Store = {
  kind: "redis" | "memory";
  /**
   * Read the world at `now`. Creates the clock at `coldExpires` if it has never
   * existed, and freezes the site if the clock has run out.
   *
   * The ledger comes back complete, because the standings are folded out of it
   * and a partial ledger would produce a wrong board.
   */
  read(now: number, coldExpires: number): Promise<RawState>;
  /** Apply one payment atomically. */
  apply(now: number, coldExpires: number, payment: PaymentInput): Promise<PaymentResult>;
};
