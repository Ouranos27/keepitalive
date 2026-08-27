import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CROWN_INCREMENT_USD,
  INITIAL_SECONDS,
  MAX_CLOCK_SECONDS,
  MAX_SECONDS_PER_TX,
  OPENING_CROWN_USD,
  applyPayment,
  crownPriceUsd,
  degradationState,
  formatDuration,
  normalizeAmountUsd,
  normalizeName,
  normalizeUrl,
  secondsForPayment,
  takesCrown,
} from "./clock";
import { APPLY_SCRIPT, READ_SCRIPT } from "./store/script";
import { createMemoryStore, __resetMemoryStore } from "./store/memory";

const HOUR = 3600;

test("the scarcity curve matches the table in the PRD", () => {
  const twenty = (remaining: number) => secondsForPayment(20, remaining);
  assert.equal(Math.round(twenty(23 * HOUR) / 60), 2, "$20 at 23h is negligible");
  assert.equal(Math.round(twenty(12 * HOUR) / 60), 4);
  assert.equal(Math.round(twenty(6 * HOUR) / 60), 8);
  assert.equal(Math.round(twenty(1 * HOUR) / 60), 48, "$20 at 1h is meaningful");
  assert.equal(Math.round(twenty(30 * 60) / 60), 96, "$20 at 30m is strong");
  assert.equal(twenty(10 * 60), MAX_SECONDS_PER_TX, "$20 under 10m is maximum");
});

test("no transaction buys more than two hours", () => {
  assert.equal(secondsForPayment(500, 60), MAX_SECONDS_PER_TX);
  assert.equal(secondsForPayment(50_000, 1), MAX_SECONDS_PER_TX);
  // A single rich payer cannot end the drama on day one.
  assert.equal(secondsForPayment(1000, 20 * HOUR), MAX_SECONDS_PER_TX);
});

test("the 72h ceiling clips time but the payment still stands", () => {
  const nearCeiling = MAX_CLOCK_SECONDS - 600;
  const { granted, applied, remainingAfter } = applyPayment(500, nearCeiling);
  assert.equal(applied, 600, "only the headroom is applied");
  assert.ok(granted > applied, "the curve granted more than the clock could take");
  assert.equal(remainingAfter, MAX_CLOCK_SECONDS);

  const atCeiling = applyPayment(200, MAX_CLOCK_SECONDS);
  assert.equal(atCeiling.applied, 0, "at the ceiling the money buys standing only");
  assert.equal(atCeiling.remainingAfter, MAX_CLOCK_SECONDS);
});

test("a dead or zero clock is never extended by the curve", () => {
  assert.equal(secondsForPayment(100, 0), 0);
  assert.equal(secondsForPayment(100, -5), 0);
  assert.equal(secondsForPayment(0, HOUR), 0);
});

test("the crown escalates by at least a dollar and never decays", () => {
  assert.equal(crownPriceUsd(null), OPENING_CROWN_USD);
  assert.equal(crownPriceUsd(46), 46 + CROWN_INCREMENT_USD);
  assert.ok(takesCrown(5, null), "the opening price takes an unheld crown");
  assert.ok(!takesCrown(4.99, null));
  assert.ok(takesCrown(47, 46));
  assert.ok(!takesCrown(46.5, 46), "beating by less than the increment is not enough");
});

test("degradation states change on the boundaries the design calls for", () => {
  assert.equal(degradationState(7 * HOUR), "calm");
  assert.equal(degradationState(HOUR), "calm", "one hour exactly is still calm");
  assert.equal(degradationState(HOUR - 1), "urgent");
  assert.equal(degradationState(10 * 60), "urgent");
  assert.equal(degradationState(10 * 60 - 1), "critical");
  assert.equal(degradationState(60), "critical");
  assert.equal(degradationState(59), "terminal");
  assert.equal(degradationState(0), "dead");
});

test("the clock is padded and does not wrap past 24 hours", () => {
  assert.equal(formatDuration(INITIAL_SECONDS), "24:00:00");
  assert.equal(formatDuration(MAX_CLOCK_SECONDS), "72:00:00");
  assert.equal(formatDuration(61), "00:01:01");
  assert.equal(formatDuration(-10), "00:00:00");
});

test("names and links are sanitised before they reach the page", () => {
  assert.equal(normalizeName("  ok  "), "ok");
  assert.equal(normalizeName(""), null);
  assert.equal(normalizeName("x".repeat(50))?.length, 24);
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("localhost"), null, "a hostname without a dot is a typo, not a link");
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
  assert.equal(normalizeUrl("http://example.com/x"), "http://example.com/x");
  assert.equal(normalizeAmountUsd("12.345"), 12.35);
  assert.equal(normalizeAmountUsd(-4), null);
  assert.equal(normalizeAmountUsd("free"), null);
});

test("the Lua constants have not drifted from the TypeScript ones", () => {
  // Two copies of the arithmetic exist on purpose; this is the guard.
  for (const script of [READ_SCRIPT, APPLY_SCRIPT]) {
    assert.match(script, new RegExp(`local INITIAL = ${INITIAL_SECONDS}\\b`));
    assert.match(script, new RegExp(`local MAX_CLOCK = ${MAX_CLOCK_SECONDS}\\b`));
    assert.match(script, new RegExp(`local MAX_TX = ${MAX_SECONDS_PER_TX}\\b`));
    assert.match(script, new RegExp(`local OPENING_CROWN = ${OPENING_CROWN_USD}\\b`));
    assert.match(script, new RegExp(`local CROWN_INC = ${CROWN_INCREMENT_USD}\\b`));
  }
  assert.doesNotMatch(APPLY_SCRIPT, /tostring\(/, "tostring would mangle millisecond timestamps");
});

// --- the store ------------------------------------------------------------

const T0 = 1_800_000_000_000;
const cold = (now: number) => now + INITIAL_SECONDS * 1000;

function payment(id: string, amount: number, tier: "crown" | "transfusion", ts: number) {
  return { id, amount, tier, name: id, url: null, ts };
}

test("a transfusion moves the clock and appends a ledger line", async () => {
  __resetMemoryStore();
  const store = createMemoryStore();
  const result = await store.apply(T0, cold(T0), payment("a", 20, "transfusion", T0));
  assert.equal(result.status, "applied");
  assert.equal(result.status === "applied" && result.seconds_added, secondsForPayment(20, INITIAL_SECONDS));
  assert.equal(result.status === "applied" && result.crowned, false, "a transfusion never takes the crown");

  const state = await store.read(T0, cold(T0));
  assert.equal(state.total_payers, 1);
  assert.equal(state.ledger[0].name, "a");
  assert.equal(crownPriceUsd(state.lifeline?.amount ?? null), OPENING_CROWN_USD);
  assert.equal(state.lifeline, null);
});

test("the crown is displaced only by paying more", async () => {
  __resetMemoryStore();
  const store = createMemoryStore();
  await store.apply(T0, cold(T0), payment("first", 5, "crown", T0));
  let state = await store.read(T0, cold(T0));
  assert.equal(state.lifeline?.name, "first");
  assert.equal(crownPriceUsd(state.lifeline?.amount ?? null), 6);

  // Underpaying loses the crown race but still buys time and a permanent line.
  const lost = await store.apply(T0, cold(T0), payment("second", 5.5, "crown", T0));
  assert.equal(lost.status === "applied" && lost.crowned, false);
  state = await store.read(T0, cold(T0));
  assert.equal(state.lifeline?.name, "first", "the holder survives an underbid");
  assert.equal(state.ledger[0].name, "second", "the underbid is still in the ledger");

  await store.apply(T0, cold(T0), payment("third", 6, "crown", T0));
  state = await store.read(T0, cold(T0));
  assert.equal(state.lifeline?.name, "third");
  assert.equal(crownPriceUsd(state.lifeline?.amount ?? null), 7);
});

test("simultaneous payments do not both price off the same pre-payment state", async () => {
  __resetMemoryStore();
  const store = createMemoryStore();
  // Four minutes left, two $20 payments landing together.
  const now = T0;
  const expires = now + 4 * 60 * 1000;
  await store.apply(now, expires, payment("seed", 0.0001, "transfusion", now));
  const [a, b] = await Promise.all([
    store.apply(now, expires, payment("a", 20, "transfusion", now)),
    store.apply(now, expires, payment("b", 20, "transfusion", now)),
  ]);
  assert.equal(a.status, "applied");
  assert.equal(b.status, "applied");
  const first = a.status === "applied" ? a.seconds_added : 0;
  const second = b.status === "applied" ? b.seconds_added : 0;
  assert.ok(second < first, "the second payment prices off a clock the first already moved");

  const state = await store.read(now, expires);
  const expected = expires + (first + second) * 1000;
  assert.equal(state.expires_at, expected, "no payment was lost to a race");
});

test("a retried webhook is ignored, not paid twice", async () => {
  __resetMemoryStore();
  const store = createMemoryStore();
  const one = payment("polar_evt_1", 20, "transfusion", T0);
  const first = await store.apply(T0, cold(T0), one);
  const retry = await store.apply(T0, cold(T0), one);
  assert.equal(first.status, "applied");
  assert.equal(retry.status, "duplicate");
  const state = await store.read(T0, cold(T0));
  assert.equal(state.total_payers, 1, "one payment, one line");
});

test("death is irreversible and the snapshot is written exactly once", async () => {
  __resetMemoryStore();
  const store = createMemoryStore();
  const expires = T0 + 1000;
  await store.apply(T0, expires, payment("last", 25, "crown", T0));
  const beforeDeath = await store.read(T0, expires);
  assert.ok(beforeDeath.alive);

  const afterDeath = beforeDeath.expires_at + 1;
  const dead = await store.read(afterDeath, expires);
  assert.equal(dead.alive, false);
  assert.equal(dead.remaining, 0);
  assert.equal(dead.frozen?.total_payers, 1);
  assert.equal(dead.frozen?.total_raised, 25);
  assert.equal(dead.frozen?.lifeline?.name, "last", "whoever holds it at zero holds it forever");
  assert.ok(dead.frozen && dead.frozen.peak_seconds >= INITIAL_SECONDS);

  // Money arriving after the freeze is refunded, not converted into time.
  const late = await store.apply(afterDeath + 5000, expires, payment("late", 999, "crown", afterDeath));
  assert.equal(late.status, "dead");

  const stillDead = await store.read(afterDeath + 10_000, expires);
  assert.equal(stillDead.alive, false);
  assert.equal(stillDead.frozen?.died_at, dead.frozen?.died_at, "the snapshot is never rewritten");
  assert.equal(stillDead.frozen?.lifeline?.name, "last");
  assert.equal(stillDead.total_payers, 1, "the late payment bought nothing");
});

test("the peak the clock ever reached survives into the memorial", async () => {
  __resetMemoryStore();
  const store = createMemoryStore();
  const expires = cold(T0);
  await store.apply(T0, expires, payment("big", 2000, "crown", T0));
  const dead = await store.read(expires + 7_200_001, expires);
  assert.equal(dead.frozen?.peak_seconds, INITIAL_SECONDS + MAX_SECONDS_PER_TX);
});
