import { NextResponse } from "next/server";
import { normalizeName, normalizeUrl } from "@/lib/clock";
import { config } from "@/lib/env";
import { readOrder, verifyWebhook, type PolarEvent } from "@/lib/polar";
import { recordPayment } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Order events. Both may fire for one order; the ledger dedupes on order id. */
const PAID_EVENTS = new Set(["order.created", "order.paid", "order.updated"]);

/**
 * The only thing in this codebase that moves the clock.
 *
 * Unsigned deliveries are rejected. Retries are absorbed by the idempotency
 * set inside the transaction. Money that arrives after the freeze is answered
 * 200 (Polar should stop retrying) and refunded by hand, never converted
 * into time, because there is no time left to sell.
 */
export async function POST(request: Request) {
  const polar = config.polar;
  if (!polar) {
    // Unreachable on a production boot, which refuses to start half configured.
    console.error("webhook received but Polar is not configured");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const body = await request.text();
  const verified = verifyWebhook(
    body,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    polar.webhookSecret,
  );
  if (!verified) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  let event: PolarEvent;
  try {
    event = JSON.parse(body) as PolarEvent;
  } catch {
    return NextResponse.json({ error: "malformed" }, { status: 400 });
  }

  if (!event.type || !PAID_EVENTS.has(event.type)) {
    return NextResponse.json({ ignored: event.type ?? null });
  }

  const order = readOrder(event);
  if (!order) {
    console.error("webhook had no usable order", event.type);
    return NextResponse.json({ ignored: "no order" });
  }

  const tier = order.metadata.tier === "crown" ? "crown" : "transfusion";
  const result = await recordPayment({
    id: order.id,
    amount: order.amountUsd,
    tier,
    name: normalizeName(order.metadata.name),
    url: normalizeUrl(order.metadata.url),
    ts: Date.now(),
  });

  if (result.status === "dead") {
    console.error(`REFUND REQUIRED: order ${order.id} for $${order.amountUsd} arrived after death`);
  }

  return NextResponse.json(result);
}
