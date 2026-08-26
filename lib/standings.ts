/**
 * The standings.
 *
 * There are no accounts here, so a payer cannot be identified by a login. What
 * can be identified is the thing they are actually buying: the link. Payments
 * are therefore ranked by site, keyed on the hostname, and everything a site
 * has ever paid adds up into one position.
 *
 * That makes the board worth climbing. A payment does not just buy seconds, it
 * buys a rank, and the only way to hold a rank is to keep paying while everyone
 * below you does the same.
 */
import type { LedgerEntry } from "./types";

export type Standing = {
  /** 1 is the top of the board. */
  rank: number;
  /** The hostname, which is the identity. www is stripped. */
  host: string;
  /** The most recent link this site paid with. */
  url: string;
  /** The most recent name this site paid under. */
  name: string | null;
  /** Everything this site has ever paid, in dollars. */
  total_amount: number;
  /** Everything this site has ever bought, in seconds. */
  total_seconds: number;
  /** How many separate payments. */
  payments: number;
  /** Unix ms of the first payment, which breaks ties. */
  first_ts: number;
  /** Does this site currently hold the lifeline? */
  holds_lifeline: boolean;
};

/** "https://www.example.com/x" becomes "example.com". */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Fold the ledger into a ranked board.
 *
 * Anonymous payments and payments without a link are left out: there is no
 * site to rank, and a row that cannot be clicked is not worth a position. They
 * still appear in the ledger, which is the complete record.
 */
export function standingsFrom(entries: LedgerEntry[], lifelineUrl: string | null): Standing[] {
  const byHost = new Map<string, Omit<Standing, "rank" | "holds_lifeline">>();

  for (const entry of entries) {
    const host = hostOf(entry.url);
    if (!host || !entry.url) continue;

    const existing = byHost.get(host);
    if (!existing) {
      byHost.set(host, {
        host,
        url: entry.url,
        name: entry.name,
        total_amount: entry.amount,
        total_seconds: entry.seconds_added,
        payments: 1,
        first_ts: entry.ts,
      });
      continue;
    }

    existing.total_amount += entry.amount;
    existing.total_seconds += entry.seconds_added;
    existing.payments += 1;
    if (entry.ts < existing.first_ts) existing.first_ts = entry.ts;
    // The newest payment decides how the site is presented.
    if (entry.ts >= existing.first_ts) {
      existing.url = entry.url;
      existing.name = entry.name ?? existing.name;
    }
  }

  const lifelineHost = hostOf(lifelineUrl);

  return [...byHost.values()]
    .map((site) => ({
      ...site,
      // Floating point addition of dollars needs rounding before it is shown.
      total_amount: Math.round(site.total_amount * 100) / 100,
    }))
    .sort((a, b) =>
      // Most paid wins. Whoever got there first wins a tie, because arriving
      // early and being matched later should not cost you the position.
      b.total_amount !== a.total_amount
        ? b.total_amount - a.total_amount
        : a.first_ts - b.first_ts,
    )
    .map((site, index) => ({
      ...site,
      rank: index + 1,
      holds_lifeline: lifelineHost !== null && site.host === lifelineHost,
    }));
}

/**
 * What it would cost this site to take the position above it, in dollars.
 * Returns null for the site already at the top.
 */
export function costToClimb(standings: Standing[], rank: number): number | null {
  if (rank <= 1) return null;
  const above = standings[rank - 2];
  const here = standings[rank - 1];
  if (!above || !here) return null;
  return Math.round((above.total_amount - here.total_amount + 0.01) * 100) / 100;
}
