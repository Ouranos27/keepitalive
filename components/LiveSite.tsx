"use client";

import { useState } from "react";
import { MIN_TRANSFUSION_USD, type Tier, degradationState, formatUsd } from "@/lib/clock";
import { useServerClock } from "@/lib/useServerClock";
import type { SiteState } from "@/lib/types";
import { Checkout } from "./Checkout";
import { Countdown } from "./Countdown";
import { Ledger } from "./Ledger";

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

  return (
    <main className="page" data-state={phase}>
      <header className="masthead">
        <span className="masthead__domain">keepitalive.lol</span>
        <span className="masthead__status">{CONDITION[phase] ?? "Alive"}</span>
      </header>

      <section className="hero">
        <Countdown remaining={remaining} phase={phase} />

        <div className="hero__copy">
          <p className="hero__line">
            This page dies at zero. <strong>Paying is the only thing that moves the clock.</strong>
          </p>
          <p className="hero__holder">
            {holder ? (
              <>
                The lifeline is held by{" "}
                {holder.url ? (
                  <a href={holder.url} rel="sponsored nofollow noopener" target="_blank">
                    {holder.name ?? "Anonymous"}
                  </a>
                ) : (
                  <strong>{holder.name ?? "Anonymous"}</strong>
                )}{" "}
                at {formatUsd(holder.amount)}.
              </>
            ) : (
              "Nobody has taken the lifeline."
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
              <span className="button__label">Take the lifeline</span>
              <span className="button__note">
                {formatUsd(state.crown_price)} now. Yours permanently if you hold it at zero.
              </span>
            </button>
            <button className="button" type="button" onClick={() => setTier("transfusion")}>
              <span className="button__label">Add time</span>
              <span className="button__note">
                {formatUsd(MIN_TRANSFUSION_USD)} minimum. Buys a line in the ledger.
              </span>
            </button>
          </div>
        )}
      </section>

      <Ledger entries={state.ledger} total={state.total_payers} truncated />

      <footer className="colophon">
        <span>Time gets cheaper as the clock runs down. The lifeline only gets more expensive.</span>
        <span>Nothing revives this page after zero.</span>
      </footer>
    </main>
  );
}
