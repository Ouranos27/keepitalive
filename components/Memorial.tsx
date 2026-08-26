import { formatDuration, formatUsd } from "@/lib/clock";
import { formatStamp } from "@/lib/format";
import type { SiteState } from "@/lib/types";
import { DeadBulb } from "./DeadBulb";
import { DeadClock } from "./Countdown";
import { PaperGrain } from "./ui/paper-grain";
import { Ledger } from "./Ledger";
import { Standings } from "./Standings";

/**
 * The dead state. Designed first, on purpose: it is what outlives the event,
 * what gets linked afterwards, and what makes the final hour valuable while
 * the clock is still running.
 *
 * The clock comes back into register here: no drift, no bleed, no accent, just
 * a flat grey zero on the paper. It should not look like it is about to do
 * anything, because it never will. Nothing on this page is interactive and
 * there is no revival path anywhere in the code.
 */
export function Memorial({ state }: { state: SiteState }) {
  const frozen = state.frozen;
  const diedAt = frozen?.died_at ?? state.expires_at;
  const holder = frozen?.lifeline ?? state.lifeline;
  // The ledger arrives newest first; a memorial reads first payer to last.
  const chronological = [...state.ledger].reverse();

  return (
    <main className="page" data-state="dead">
      <PaperGrain />

      <header className="masthead">
        <span className="masthead__domain">lastlight.lol</span>
        <span className="masthead__status">Dead</span>
      </header>

      <section className="hero">
        <DeadBulb />
        <DeadClock />
        <div className="hero__copy">
          {/*
            "Nobody kept it alive" is wrong when somebody is named directly
            below it as the holder. The clock still ran out either way, so the
            verdict says which of the two things happened.
          */}
          <h1 className="verdict">
            {holder ? "The clock ran out." : "Nobody kept it alive."}
          </h1>
          <p className="verdict__when mono">Died {formatStamp(diedAt)}</p>
        </div>
      </section>

      <section className="holder">
        <p className="holder__eyebrow">The last light</p>
        {holder ? (
          <>
            <p className="holder__name">
              {holder.url ? (
                <a href={holder.url} rel="sponsored nofollow noopener" target="_blank">
                  {holder.name ?? "Anonymous"}
                </a>
              ) : (
                (holder.name ?? "Anonymous")
              )}
            </p>
            <p className="holder__meta">
              Held it to the end at {formatUsd(holder.amount)}. This does not change again.
            </p>
          </>
        ) : (
          <p className="holder__empty">Nobody ever took it.</p>
        )}
      </section>

      <ul className="stats">
        <li>
          <span className="stats__value mono">{formatUsd(frozen?.total_raised ?? 0)}</span>
          <span className="stats__label">Total raised</span>
        </li>
        <li>
          <span className="stats__value mono">{frozen?.total_payers ?? state.total_payers}</span>
          <span className="stats__label">Payers</span>
        </li>
        <li>
          <span className="stats__value mono">{formatDuration(frozen?.peak_seconds ?? 0)}</span>
          <span className="stats__label">Longest it ever reached</span>
        </li>
      </ul>

      <Standings standings={state.standings} heading="The final standings" final />

      <Ledger
        entries={chronological}
        total={frozen?.total_payers ?? state.total_payers}
        heading="Everyone who paid, in order"
        emptyMessage="Nobody ever paid."
      />

      <footer className="colophon">
        <span>The clock cannot be restarted.</span>
        <span>Links are sponsored and nofollowed.</span>
      </footer>
    </main>
  );
}
