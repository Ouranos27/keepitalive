"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  INITIAL_SECONDS,
  MIN_TRANSFUSION_USD,
  type Tier,
  degradationState,
  formatUsd,
} from "@/lib/clock";
import { poolFor } from "@/lib/theme";
import { useLightPool } from "@/lib/useLightPool";
import { useServerClock } from "@/lib/useServerClock";
import type { SiteState } from "@/lib/types";
import { Checkout } from "./Checkout";
import { Countdown } from "./Countdown";
import { Ledger } from "./Ledger";
import { Standings } from "./Standings";
import { SiteLink } from "./ui/site-link";
import { PaperGrain } from "./ui/paper-grain";

/*
 * three.js is a large dependency for one decorative object, so the bulb is
 * loaded after the page paints and never blocks the clock. A viewer without
 * WebGL, or on a slow connection, gets a page that works.
 */
const Bulb = dynamic(() => import("./Bulb").then((m) => m.Bulb), { ssr: false });

/** The masthead states the condition, and the condition gets worse. */
const CONDITION: Record<string, string> = {
  calm: "Alive",
  urgent: "Failing",
  critical: "Critical",
  terminal: "Dying",
};

export function LiveSite({ initial }: { initial: SiteState }) {
  const { state, remaining } = useServerClock(initial);
  const [tier, setTier] = useState<Tier | null>(null);

  const phase = degradationState(remaining);
  const holder = state.lifeline;
  const reduceMotion = useReducedMotion() ?? false;
  /*
   * The filament burns across the whole day rather than only the last hour, so
   * the bulb is always saying something. A square root keeps most of the
   * brightness in the first half and puts the visible collapse where the
   * tension is: full at 24h, still clearly lit at 6h, guttering under an hour.
   */
  const life = Math.sqrt(Math.max(0, Math.min(1, remaining / INITIAL_SECONDS)));

  /*
   * The bulb is the light source, so what the clock drives is how far its
   * light reaches. Sections inside the pool are lit, the rest are in the dark;
   * see lib/theme.ts for why it is a shrinking pool rather than a fade.
   */
  const pool = poolFor(remaining);
  const page = useLightPool(pool);

  return (
    <main
      className="page"
      data-state={phase}
      data-room="lit"
      ref={page}
      style={{ "--pool": pool } as React.CSSProperties}
    >
      {/*
        The room dips when the filament does. The bulb writes --flicker
        straight to the document, so this darkens without re-rendering
        anything.
      */}
      <span className="roomlight" />
      <PaperGrain />

      <header className="masthead" data-zone data-room="lit">
        <span className="masthead__domain">lastlight.lol</span>
        <span className="masthead__status">{CONDITION[phase] ?? "Alive"}</span>
      </header>

      <section className="hero" data-zone data-room="lit">
        <div className="bulb" style={{ "--life": life.toFixed(3) } as React.CSSProperties}>
          <Bulb life={life} reduceMotion={reduceMotion} />
        </div>

        <Countdown remaining={remaining} phase={phase} />

        <div className="hero__copy">
          <p className="hero__line">
            Every payment buys seconds and a permanent link.{" "}
            <strong>Whoever holds the last light at zero keeps this page forever.</strong>
          </p>
          <p className="hero__holder">
            {holder ? (
              <>
                The last light is held by{" "}
                {holder.url ? (
                  <SiteLink href={holder.url} icon={false}>
                    {holder.name ?? "Anonymous"}
                  </SiteLink>
                ) : (
                  <strong>{holder.name ?? "Anonymous"}</strong>
                )}{" "}
                at {formatUsd(holder.amount)}.
              </>
            ) : (
              "Nobody is holding the last light."
            )}
          </p>
        </div>

        {tier ? (
          <Checkout tier={tier} crownPrice={state.crown_price} onCancel={() => setTier(null)} />
        ) : (
          <div className="actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => setTier("crown")}
            >
              <span className="button__label">Take the last light</span>
              <span className="button__note">
                {formatUsd(state.crown_price)}, and the page is yours if the clock reaches zero.
              </span>
            </button>
            <button className="button" type="button" onClick={() => setTier("transfusion")}>
              <span className="button__label">Add time</span>
              <span className="button__note">
                From {formatUsd(MIN_TRANSFUSION_USD)}. Buys seconds and a rank on the board.
              </span>
            </button>
          </div>
        )}
      </section>

      <Standings standings={state.standings} limit={10} />

      <Ledger entries={state.ledger} total={state.total_payers} truncated />

      <footer className="colophon" data-zone data-room="lit">
        <span>Time gets cheaper as the clock runs down. Standing only gets more expensive.</span>
        <span>Nothing revives this page after zero.</span>
      </footer>
    </main>
  );
}
