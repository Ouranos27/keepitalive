import { Redis } from "@upstash/redis";
import { crownPriceUsd } from "../clock";
import type { FrozenSnapshot, LedgerEntry, Lifeline, PaymentInput, PaymentResult, SiteState } from "../types";
import { KEY_ORDER } from "./keys";
import { APPLY_SCRIPT, READ_SCRIPT } from "./script";
import type { Store } from "./types";

/** Redis hands back strings; Upstash sometimes pre-parses them. Accept both. */
function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined || raw === "" || raw === false) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseEntries(raw: unknown): LedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => parse<LedgerEntry>(item)).filter((e): e is LedgerEntry => e !== null);
}

export function createRedisStore(url: string, token: string): Store {
  const redis = new Redis({ url, token });

  return {
    kind: "redis",

    async read(now, coldExpires, limit) {
      const raw = (await redis.eval(READ_SCRIPT, [...KEY_ORDER], [
        String(now),
        String(coldExpires),
        String(limit),
      ])) as [string, string, string, unknown[], number];

      const [status, payload, lifelineRaw, entriesRaw, length] = raw;
      const lifeline = parse<Lifeline>(lifelineRaw);
      // Newest first on the wire, because the ledger is an LPUSH list.
      const ledger = parseEntries(entriesRaw);

      if (status === "dead") {
        const frozen = parse<FrozenSnapshot>(payload);
        return {
          alive: false,
          now,
          expires_at: frozen?.died_at ?? now,
          remaining: 0,
          lifeline: frozen?.lifeline ?? lifeline,
          crown_price: crownPriceUsd(frozen?.lifeline?.amount ?? lifeline?.amount ?? null),
          ledger,
          total_payers: Number(length) || 0,
          frozen,
        } satisfies SiteState;
      }

      const expiresAt = Number(payload);
      return {
        alive: true,
        now,
        expires_at: expiresAt,
        remaining: Math.max(0, (expiresAt - now) / 1000),
        lifeline,
        crown_price: crownPriceUsd(lifeline?.amount ?? null),
        ledger,
        total_payers: Number(length) || 0,
        frozen: null,
      } satisfies SiteState;
    },

    async apply(now, coldExpires, payment: PaymentInput): Promise<PaymentResult> {
      const raw = (await redis.eval(APPLY_SCRIPT, [...KEY_ORDER], [
        String(now),
        String(coldExpires),
        payment.id,
        String(payment.amount),
        payment.tier,
        payment.name ?? "",
        payment.url ?? "",
        String(payment.ts),
      ])) as string[];

      const [status, applied, granted, crowned] = raw;
      if (status === "applied") {
        return {
          status: "applied",
          seconds_added: Number(applied),
          seconds_granted: Number(granted),
          crowned: crowned === "1",
        };
      }
      return { status: status === "duplicate" ? "duplicate" : "dead" };
    },
  };
}
