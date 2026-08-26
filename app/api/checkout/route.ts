import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  MIN_TRANSFUSION_USD,
  crownPriceUsd,
  normalizeAmountUsd,
  normalizeName,
  normalizeUrl,
} from "@/lib/clock";
import { createCheckout, isPolarConfigured } from "@/lib/polar";
import { readState, recordPayment } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Starts a payment. It does not move the clock. Only the webhook does that.
 *
 * The crown price is re-read from the server here rather than trusted from the
 * form, so a stale tab cannot take the lifeline for last minute's price.
 */
export async function POST(request: Request) {
  const state = await readState();
  if (!state.alive) {
    return NextResponse.json({ error: "The site is dead. Nothing can be bought." }, { status: 410 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const tier = payload.tier === "crown" ? "crown" : "transfusion";
  const name = normalizeName(payload.name);
  const url = normalizeUrl(payload.url);

  let amount: number;
  if (tier === "crown") {
    amount = crownPriceUsd(state.lifeline?.amount ?? null);
  } else {
    const requested = normalizeAmountUsd(payload.amount);
    if (requested === null || requested < MIN_TRANSFUSION_USD) {
      return NextResponse.json(
        { error: `A transfusion is $${MIN_TRANSFUSION_USD} or more.` },
        { status: 400 },
      );
    }
    amount = requested;
  }

  if (!isPolarConfigured()) {
    // No processor wired up. Locally that means the mechanic stays playable;
    // in production it means the site is misconfigured and takes no money.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATED_PAYMENTS !== "1") {
      return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
    }
    const result = await recordPayment({
      id: `sim_${randomUUID()}`,
      amount,
      tier,
      name,
      url,
      ts: Date.now(),
    });
    return NextResponse.json({ simulated: true, result });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  try {
    const checkoutUrl = await createCheckout({
      amountUsd: amount,
      tier,
      name,
      url,
      successUrl: `${origin}/?paid=1`,
    });
    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("checkout failed", error);
    return NextResponse.json({ error: "Could not reach the payment processor." }, { status: 502 });
  }
}
