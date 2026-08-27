/**
 * The rules. Pure functions, no I/O, no clock reads.
 *
 * Every number the site charges or grants comes from this file, and the same
 * arithmetic is reimplemented once, in Lua, inside lib/store/script.ts, so
 * that a payment applies atomically. If you change a constant here, change it
 * there. lib/clock.test.ts checks the two against each other.
 */

/** Seconds on the clock at launch. */
export const INITIAL_SECONDS = 24 * 60 * 60;

/** Hard ceiling. Time bought past this buys standing only. */
export const MAX_CLOCK_SECONDS = 72 * 60 * 60;

/** Most time one transaction can add, however large. */
export const MAX_SECONDS_PER_TX = 2 * 60 * 60;

/** Cheapest way in. Below this the processor fee eats the payment. */
export const MIN_TRANSFUSION_USD = 3;

/** What the crown costs before anyone holds it. */
export const OPENING_CROWN_USD = 5;

/** You must beat the holder by at least this much. */
export const CROWN_INCREMENT_USD = 1;

/** Name field limit. There are no accounts; this is the whole identity. */
export const MAX_NAME_LENGTH = 24;

export type Tier = "crown" | "transfusion";

/**
 * Time gets cheaper as death approaches.
 *
 *   seconds_added = amount_usd x 6 x (86400 / seconds_remaining)
 *
 * $20 buys ~2 minutes at 23h remaining and the full 2h cap under ~10 minutes.
 * The curve is the game: waiting makes time cheap, and waiting makes the crown
 * expensive, so no moment is an obvious one.
 */
export function secondsForPayment(amountUsd: number, secondsRemaining: number): number {
  if (!(amountUsd > 0) || !(secondsRemaining > 0)) return 0;
  const raw = amountUsd * 6 * (INITIAL_SECONDS / secondsRemaining);
  return Math.min(Math.floor(raw), MAX_SECONDS_PER_TX);
}

/**
 * What a payment actually moves the clock by, after the 72h ceiling.
 * Granted is what the curve gave; applied is what the clock could take.
 */
export function applyPayment(
  amountUsd: number,
  secondsRemaining: number,
): { granted: number; applied: number; remainingAfter: number } {
  const granted = secondsForPayment(amountUsd, secondsRemaining);
  const headroom = Math.max(0, MAX_CLOCK_SECONDS - secondsRemaining);
  const applied = Math.min(granted, headroom);
  return { granted, applied, remainingAfter: secondsRemaining + applied };
}

/** The single number shown on the button. Never a bid box. */
export function crownPriceUsd(currentHolderAmountUsd: number | null): number {
  if (currentHolderAmountUsd === null) return OPENING_CROWN_USD;
  return currentHolderAmountUsd + CROWN_INCREMENT_USD;
}

/** A payment takes the crown only by beating the holder outright. */
export function takesCrown(amountUsd: number, currentHolderAmountUsd: number | null): boolean {
  return amountUsd >= crownPriceUsd(currentHolderAmountUsd);
}

export type DegradationState = "calm" | "urgent" | "critical" | "terminal" | "dead";

/**
 * How wrecked the page looks. The state is legible in a screenshot, which is
 * the point: the site generates its own escalating images as it dies.
 */
export function degradationState(secondsRemaining: number): DegradationState {
  if (secondsRemaining <= 0) return "dead";
  if (secondsRemaining < 60) return "terminal";
  if (secondsRemaining < 10 * 60) return "critical";
  if (secondsRemaining < 60 * 60) return "urgent";
  return "calm";
}

/** HH:MM:SS, zero-padded, always. Hours are not capped at 24. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "48 minutes", "2 hours", "1m 36s", for prose rather than for the clock. */
export function formatAdded(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function formatUsd(amountUsd: number): string {
  return Number.isInteger(amountUsd) ? `$${amountUsd}` : `$${amountUsd.toFixed(2)}`;
}

/** Trim to the name limit; empty or whitespace-only becomes anonymous. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

/**
 * Only http(s) survives. The link is why people pay, so it is rendered, but
 * it is rendered rel="sponsored nofollow noopener" and never as javascript:.
 */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Payment amounts are dollars with at most cents, and always positive. */
export function normalizeAmountUsd(raw: unknown): number | null {
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}
