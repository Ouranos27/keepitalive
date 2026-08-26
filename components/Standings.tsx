import { formatAdded, formatUsd } from "@/lib/clock";
import { costToClimb, type Standing } from "@/lib/standings";

/**
 * The board.
 *
 * A single crown is a game for two people. This is the part everybody else is
 * playing: sites ranked by everything they have ever paid, with the exact cost
 * of taking the position above printed on every row. There is nothing to work
 * out and nothing to guess, which is the point. The reason to pay is legible
 * from the row itself.
 *
 * Identity is the hostname, because there are no accounts here and the link is
 * what is being bought anyway.
 */
export function Standings({
  standings,
  heading = "The standings",
  limit,
}: {
  standings: Standing[];
  heading?: string;
  /** The live page shows a head of the board; the memorial shows all of it. */
  limit?: number;
}) {
  const shown = limit ? standings.slice(0, limit) : standings;

  return (
    <section className="board">
      <div className="board__head">
        <h2 className="board__title">{heading}</h2>
        <span className="board__count mono">
          {standings.length} {standings.length === 1 ? "site" : "sites"}
          {limit && standings.length > shown.length ? `, top ${shown.length}` : ""}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="board__empty">
          No site has taken a position. The first one to pay with a link takes first place.
        </p>
      ) : (
        <ol className="board__list">
          {shown.map((site) => {
            const climb = costToClimb(standings, site.rank);
            return (
              <li
                key={site.host}
                className={`board__row${site.holds_lifeline ? " board__row--light" : ""}`}
              >
                <span className="board__rank mono">{site.rank}</span>

                <span className="board__site">
                  <a
                    className="board__host"
                    href={site.url}
                    rel="sponsored nofollow noopener"
                    target="_blank"
                  >
                    {site.host}
                  </a>
                  <span className="board__meta">
                    {site.name ? `${site.name}, ` : ""}
                    {site.payments} {site.payments === 1 ? "payment" : "payments"},{" "}
                    {formatAdded(site.total_seconds)} bought
                    {site.holds_lifeline ? (
                      <span className="board__light">holds the last light</span>
                    ) : null}
                  </span>
                </span>

                <span className="board__total mono">{formatUsd(site.total_amount)}</span>

                {/* The whole incentive, stated as a number you can act on. */}
                <span className="board__climb mono">
                  {climb === null ? "top of the board" : `${formatUsd(climb)} to pass`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
