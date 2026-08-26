import { MIN_TRANSFUSION_USD, formatAdded, formatUsd } from "@/lib/clock";
import { formatTime } from "@/lib/format";
import type { LedgerEntry } from "@/lib/types";

/**
 * The permanent public record. Every payment appends one line, and the ledger
 * survives death, which is the whole of what the cheap tier buys.
 *
 * Banded rather than ruled. A hairline under every row is the default and it
 * turns a list of people into a spreadsheet, which is the wrong feeling for a
 * list of everyone who paid to keep something breathing.
 */
export function Ledger({
  entries,
  total,
  heading = "The ledger",
  truncated = false,
  emptyMessage,
}: {
  entries: LedgerEntry[];
  total: number;
  heading?: string;
  truncated?: boolean;
  /** The dead page cannot sell a line, so it says something else. */
  emptyMessage?: string;
}) {
  return (
    <section className="ledger">
      <div className="ledger__head">
        <h2 className="ledger__title">{heading}</h2>
        <span className="ledger__count mono">
          {total} {total === 1 ? "payer" : "payers"}
          {truncated && entries.length < total ? `, showing ${entries.length}` : ""}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="ledger__empty">
          {emptyMessage ?? `Nobody yet. The first line in the ledger costs ${formatUsd(MIN_TRANSFUSION_USD)}.`}
        </p>
      ) : (
        <ol className="ledger__list">
          {entries.map((entry) => (
            <li key={entry.id} className={`ledger__row${entry.crowned ? " ledger__row--crown" : ""}`}>
              <span className="ledger__who">
                {entry.url && entry.name ? (
                  <a href={entry.url} rel="sponsored nofollow noopener" target="_blank">
                    {entry.name}
                  </a>
                ) : (
                  (entry.name ?? "Anonymous")
                )}
                {entry.crowned ? <span className="ledger__held">Lifeline</span> : null}
              </span>
              <span className="ledger__amount mono">{formatUsd(entry.amount)}</span>
              <span className="ledger__added mono">
                {entry.seconds_added > 0 ? `+${formatAdded(entry.seconds_added)}` : "no time to buy"}
                {", "}
                {formatTime(entry.ts)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
