/**
 * Polar, over plain fetch.
 *
 * The webhook is the sole source of truth: nothing the browser says after a
 * redirect moves the clock. Signature verification is Standard Webhooks
 * (HMAC-SHA256 over `id.timestamp.body`), implemented here rather than pulled
 * in as a dependency: it is twenty lines and the brief says any additional
 * moving part is scope failure.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API = () =>
  process.env.POLAR_SERVER === "sandbox" ? "https://sandbox-api.polar.sh" : "https://api.polar.sh";

export function isPolarConfigured(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_PRODUCT_ID);
}

/**
 * Create a hosted checkout for an exact dollar amount. The product in Polar
 * must be pay-what-you-want, because the crown price changes every time
 * somebody takes it.
 */
export async function createCheckout(input: {
  amountUsd: number;
  tier: string;
  name: string | null;
  url: string | null;
  successUrl: string;
}): Promise<string> {
  const response = await fetch(`${API()}/v1/checkouts/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      products: [process.env.POLAR_PRODUCT_ID],
      amount: Math.round(input.amountUsd * 100),
      success_url: input.successUrl,
      // Read back off the webhook. The clock only ever moves from here.
      metadata: {
        tier: input.tier,
        name: input.name ?? "",
        url: input.url ?? "",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Polar checkout failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Polar checkout returned no url");
  return body.url;
}

/** Five minutes, the Standard Webhooks default. Older deliveries are replays. */
const TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  // Polar issues base64 secrets, but a plain-text one must still verify.
  const decoded = Buffer.from(raw, "base64");
  return decoded.length > 0 && decoded.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")
    ? decoded
    : Buffer.from(raw, "utf8");
}

/**
 * True only if the delivery is signed by the configured secret and recent.
 * Anything else is somebody trying to move the clock for free.
 */
export function verifyWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", decodeSecret(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  // The header carries a space-separated list so secrets can be rotated.
  return signature.split(" ").some((part) => {
    const value = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    const candidate = Buffer.from(value, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

export type PolarEvent = {
  type?: string;
  data?: Record<string, unknown>;
};

/**
 * Pull the four things that matter out of a Polar order payload: who paid,
 * how much, which tier they chose, and an id stable across webhook retries.
 */
export function readOrder(event: PolarEvent): {
  id: string;
  amountUsd: number;
  metadata: Record<string, unknown>;
} | null {
  const data = event.data;
  if (!data) return null;

  const id = typeof data.id === "string" ? data.id : null;
  if (!id) return null;

  const cents = [data.net_amount, data.total_amount, data.amount, data.subtotal_amount].find(
    (value): value is number => typeof value === "number" && value > 0,
  );
  if (cents === undefined) return null;

  const checkout = data.checkout as Record<string, unknown> | undefined;
  const metadata =
    (data.metadata as Record<string, unknown> | undefined) ??
    (checkout?.metadata as Record<string, unknown> | undefined) ??
    {};

  return { id, amountUsd: cents / 100, metadata };
}
