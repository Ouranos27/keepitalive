"use client";

import { useState } from "react";
import { MAX_NAME_LENGTH, MIN_TRANSFUSION_USD, type Tier, formatUsd } from "@/lib/clock";

/**
 * One form, two tiers.
 *
 * The crown amount is never a bid box. The price is a single number decided by
 * the server and printed on the button, because deciding how much to bid is
 * the main reason people close the tab.
 */
export function Checkout({
  tier,
  crownPrice,
  onCancel,
}: {
  tier: Tier;
  crownPrice: number;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(MIN_TRANSFUSION_USD));
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const crown = tier === "crown";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, amount: crown ? crownPrice : Number(amount), name, url }),
      });
      const body = (await response.json()) as { url?: string; simulated?: boolean; error?: string };
      if (!response.ok) {
        setError(body.error ?? "That did not go through.");
        setPending(false);
        return;
      }
      if (body.simulated) {
        // No payment processor configured: the payment already applied.
        window.location.reload();
        return;
      }
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setError("No checkout came back.");
      setPending(false);
    } catch {
      setError("That did not go through.");
      setPending(false);
    }
  }

  return (
    <form className="checkout" onSubmit={submit}>
      <h2 className="checkout__title">
        {crown ? `Take the lifeline for ${formatUsd(crownPrice)}` : "Add time to the clock"}
      </h2>
      <p className="checkout__hint">
        {crown
          ? "One slot. You hold it until somebody pays more than you. If nobody does before zero, you hold it on the dead page permanently."
          : `Buys time and a permanent line in the ledger. It does not take the lifeline. ${formatUsd(MIN_TRANSFUSION_USD)} minimum.`}
      </p>

      {!crown && (
        <div className="field">
          <label className="field__label" htmlFor="amount">
            Amount in dollars
          </label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min={MIN_TRANSFUSION_USD}
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="name">
          Name, optional, {MAX_NAME_LENGTH} characters
        </label>
        <input
          id="name"
          type="text"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          placeholder="Anonymous"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="url">
          Link, optional
        </label>
        <input
          id="url"
          type="text"
          inputMode="url"
          value={url}
          placeholder="example.com"
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      {error ? (
        <p className="checkout__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="checkout__actions">
        <button className="button button--primary" type="submit" disabled={pending}>
          <span className="button__label">
            {pending ? "One moment" : crown ? `Pay ${formatUsd(crownPrice)}` : "Continue to payment"}
          </span>
        </button>
        <button className="button" type="button" onClick={onCancel} disabled={pending}>
          <span className="button__label">Cancel</span>
        </button>
      </div>

      <p className="checkout__hint">
        No accounts, no email. Links are published with sponsored and nofollow.
      </p>
    </form>
  );
}
