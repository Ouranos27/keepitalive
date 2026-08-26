/**
 * The in-memory store. Used when Upstash is not configured: local development,
 * CI, and the tests that cover the transaction rules.
 *
 * It mirrors lib/store/script.ts step for step. Where the Lua gets atomicity
 * from Redis running one script at a time, this gets it from a promise chain
 * that serialises every read and write.
 *
 * State lives on globalThis so the dev server's hot reloads do not resurrect a
 * clock that already died.
 */
import { INITIAL_SECONDS, applyPayment, crownPriceUsd } from "../clock";
import type { FrozenSnapshot, LedgerEntry, Lifeline, PaymentInput, PaymentResult, SiteState } from "../types";
import type { Store } from "./types";

type World = {
  expires_at: number | null;
  frozen: FrozenSnapshot | null;
  lifeline: Lifeline;
  /** Newest first, like the LPUSH list it stands in for. */
  ledger: LedgerEntry[];
  seen: Set<string>;
};

const GLOBAL_KEY = Symbol.for("keepitalive.memory-store");

function world(): World {
  const globalScope = globalThis as unknown as Record<symbol, World | undefined>;
  let existing = globalScope[GLOBAL_KEY];
  if (!existing) {
    existing = { expires_at: null, frozen: null, lifeline: null, ledger: [], seen: new Set() };
    globalScope[GLOBAL_KEY] = existing;
  }
  return existing;
}

/** Everything queues behind everything else. Two payments never interleave. */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => T): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

function ensureClock(state: World, coldExpires: number): number {
  if (state.expires_at === null) state.expires_at = coldExpires;
  return state.expires_at;
}

function freeze(state: World, expiresAt: number): FrozenSnapshot {
  if (state.frozen) return state.frozen;
  const totalRaised = state.ledger.reduce((sum, entry) => sum + entry.amount, 0);
  const peak = state.ledger.reduce((max, entry) => Math.max(max, entry.remaining_after), INITIAL_SECONDS);
  state.frozen = {
    died_at: expiresAt,
    lifeline: state.lifeline,
    total_raised: Math.round(totalRaised * 100) / 100,
    total_payers: state.ledger.length,
    peak_seconds: peak,
  };
  return state.frozen;
}

export function createMemoryStore(): Store {
  return {
    kind: "memory",

    read(now, coldExpires, limit) {
      return serialize(() => {
        const state = world();
        const expiresAt = ensureClock(state, coldExpires);
        const ledger = limit < 0 ? [...state.ledger] : state.ledger.slice(0, limit);

        if (now >= expiresAt) {
          const frozen = freeze(state, expiresAt);
          return {
            alive: false,
            now,
            expires_at: frozen.died_at,
            remaining: 0,
            lifeline: frozen.lifeline,
            crown_price: crownPriceUsd(frozen.lifeline?.amount ?? null),
            ledger,
            total_payers: state.ledger.length,
            frozen,
          } satisfies SiteState;
        }

        return {
          alive: true,
          now,
          expires_at: expiresAt,
          remaining: Math.max(0, (expiresAt - now) / 1000),
          lifeline: state.lifeline,
          crown_price: crownPriceUsd(state.lifeline?.amount ?? null),
          ledger,
          total_payers: state.ledger.length,
          frozen: null,
        } satisfies SiteState;
      });
    },

    apply(now, coldExpires, payment: PaymentInput) {
      return serialize((): PaymentResult => {
        const state = world();
        if (state.seen.has(payment.id)) return { status: "duplicate" };

        const expiresAt = ensureClock(state, coldExpires);
        if (now >= expiresAt) {
          freeze(state, expiresAt);
          return { status: "dead" };
        }

        const remaining = (expiresAt - now) / 1000;
        const { granted, applied } = applyPayment(payment.amount, remaining);
        const newExpires = expiresAt + applied * 1000;

        const price = crownPriceUsd(state.lifeline?.amount ?? null);
        const crowned = payment.tier === "crown" && payment.amount >= price;

        state.expires_at = newExpires;
        if (crowned) {
          state.lifeline = {
            name: payment.name,
            url: payment.url,
            amount: payment.amount,
            ts: payment.ts,
          };
        }
        state.ledger.unshift({
          id: payment.id,
          name: payment.name,
          url: payment.url,
          amount: payment.amount,
          tier: payment.tier,
          crowned,
          seconds_added: applied,
          seconds_granted: granted,
          remaining_after: Math.floor((newExpires - now) / 1000),
          ts: payment.ts,
        });
        state.seen.add(payment.id);

        return { status: "applied", seconds_added: applied, seconds_granted: granted, crowned };
      });
    },
  };
}

/** Tests only. Resets the world between cases. */
export function __resetMemoryStore(): void {
  const globalScope = globalThis as unknown as Record<symbol, World | undefined>;
  globalScope[GLOBAL_KEY] = undefined;
}
