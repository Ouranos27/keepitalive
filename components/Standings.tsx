import { formatAdded, formatUsd } from "@/lib/clock";
import { costToClimb, type Standing } from "@/lib/standings";
import { SiteLink } from "./ui/site-link";

/**
 * The board.
 *
 * A single Last Light is a game for two people. This is the part everybody else
 * is playing: sites ranked by everything they have ever paid, each on its own
 * card, with the exact cost of taking the position above printed on it. There
 * is nothing to work out and nothing to guess, which is the point. The reason
 * to pay is legible from the card itself.
 *
 * Identity is the hostname, because there are no accounts here and the link is
 * what is being bought anyway.
 */
export function Standings({
  standings,
  heading = "The standings",
  limit,
  final = false,
  room = "lit",
}: {
  standings: Standing[];
  heading?: string;
  /** The live page shows a head of the board; the memorial shows all of it. */
  limit?: number;
  /** Which room this section starts in; the light pool takes over after mount. */
  room?: "lit" | "dark";
  /** On the dead page nobody can be passed, so the cost to climb is dropped. */
  final?: boolean;
}) {
  const shown = limit ? standings.slice(0, limit) : standings;

  return (
    <section className="board" data-zone data-room={room}>
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
                /*
                 * The top three are colour-graded by heat: the closer to the
                 * light, the warmer. Everyone below them is one neutral field.
                 */
                className={`site ${site.rank <= 3 ? `site--t${site.rank}` : "site--field"}`}
              >
                {/* Zero-padded so the column holds its width down the board. */}
                <span className="site__rank mono">{String(site.rank).padStart(2, "0")}</span>

                <span className="site__title">
                  <SiteLink className="site__host" href={site.url}>
                    {site.host}
                  </SiteLink>
                  {site.holds_lifeline ? (
                    <span className="site__badge">Holds the last light</span>
                  ) : null}
                </span>

                <span className="site__meta">{site.name ?? "Anonymous"}</span>

                {/* What the money did, between the site and the money itself. */}
                <span className="site__stat mono">
                  {site.payments} {site.payments === 1 ? "payment" : "payments"}
                </span>
                <span className="site__stat site__stat--quiet mono">
                  {formatAdded(site.total_seconds)} bought
                </span>

                <span className="site__total mono">{formatUsd(site.total_amount)}</span>

                {final ? (
                  <span className="site__climb site__climb--top mono">
                    {site.rank === 1 ? "Held the board" : "Final"}
                  </span>
                ) : (
                  /* The whole incentive, stated as a number you can act on. */
                  <span className={`site__climb mono${climb === null ? " site__climb--top" : ""}`}>
                    {climb === null ? "Top of the board" : `${formatUsd(climb)} to pass`}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
