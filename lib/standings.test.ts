import assert from "node:assert/strict";
import { test } from "node:test";
import { costToClimb, hostOf, standingsFrom } from "./standings";
import { buildCheckoutBody } from "./polar";
import type { LedgerEntry } from "./types";

let clock = 1_800_000_000_000;

function paid(
  amount: number,
  url: string | null,
  name: string | null = null,
  seconds = 10,
): LedgerEntry {
  clock += 1000;
  return {
    id: `e${clock}`,
    name,
    url,
    amount,
    tier: "transfusion",
    crowned: false,
    seconds_added: seconds,
    seconds_granted: seconds,
    remaining_after: 86_400,
    ts: clock,
  };
}

// --- the board ------------------------------------------------------------

test("a site is identified by its hostname, not by a name it typed", () => {
  assert.equal(hostOf("https://www.Example.com/deep/path?x=1"), "example.com");
  assert.equal(hostOf("http://example.com"), "example.com");
  assert.equal(hostOf(null), null);
  assert.equal(hostOf("not a url"), null);
});

test("everything a site ever paid adds up into one position", () => {
  const board = standingsFrom(
    [
      paid(10, "https://alpha.example/", "alpha"),
      paid(30, "https://beta.example/", "beta"),
      // Same site, second payment, under a different path and a newer name.
      paid(25, "https://www.alpha.example/pricing", "alpha ltd"),
    ],
    null,
  );

  assert.equal(board.length, 2);
  assert.equal(board[0].host, "alpha.example");
  assert.equal(board[0].total_amount, 35, "two payments from one site combine");
  assert.equal(board[0].payments, 2);
  assert.equal(board[0].name, "alpha ltd", "the newest name is the one shown");
  assert.equal(board[0].rank, 1);
  assert.equal(board[1].host, "beta.example");
  assert.equal(board[1].rank, 2);
});

test("a tie goes to whoever got there first", () => {
  const early = paid(20, "https://early.example/");
  const late = paid(20, "https://late.example/");
  const board = standingsFrom([late, early], null);
  assert.equal(board[0].host, "early.example");
  assert.equal(board[1].host, "late.example");
});

test("payments without a link stay in the ledger but off the board", () => {
  const board = standingsFrom([paid(500, null, "anonymous whale"), paid(5, "https://small.example/")], null);
  assert.equal(board.length, 1, "there is no site to rank");
  assert.equal(board[0].host, "small.example");
});

test("the board knows which site is holding the lifeline", () => {
  const board = standingsFrom(
    [paid(10, "https://a.example/"), paid(90, "https://b.example/")],
    "https://www.b.example/somewhere",
  );
  assert.equal(board[0].host, "b.example");
  assert.equal(board[0].holds_lifeline, true);
  assert.equal(board[1].holds_lifeline, false);
});

test("the cost to climb one place is a real, payable number", () => {
  const board = standingsFrom(
    [paid(100, "https://top.example/"), paid(40, "https://mid.example/"), paid(10, "https://low.example/")],
    null,
  );
  assert.equal(costToClimb(board, 1), null, "nobody is above the top");
  assert.equal(costToClimb(board, 2), 60.01, "one cent past the site above");
  assert.equal(costToClimb(board, 3), 30.01);
});

test("dollars are rounded before they are shown", () => {
  const board = standingsFrom(
    [paid(0.1, "https://x.example/"), paid(0.2, "https://x.example/")],
    null,
  );
  assert.equal(board[0].total_amount, 0.3, "not 0.30000000000000004");
});

// --- the Polar checkout body ----------------------------------------------

test("the bid price is sent as an ad-hoc fixed price, not as `amount`", () => {
  const body = buildCheckoutBody(
    {
      amountUsd: 47,
      tier: "crown",
      name: "somebody",
      url: "https://example.com/",
      successUrl: "https://lastlight.lol/?paid=1",
    },
    "prod_123",
  );

  // `amount` only applies to pay-what-you-want prices and is ignored for fixed
  // ones, which would quietly charge the catalog price for every bid.
  assert.ok(!("amount" in body), "the ignored field must not be what we rely on");
  assert.deepEqual(body.products, ["prod_123"]);
  assert.deepEqual(body.prices, {
    prod_123: [{ amount_type: "fixed", price_amount: 4700, price_currency: "usd" }],
  });
});

test("cents are integers, including for amounts that are not", () => {
  const body = buildCheckoutBody(
    { amountUsd: 12.35, tier: "transfusion", name: null, url: null, successUrl: "https://x/" },
    "p",
  );
  const price = body.prices.p[0].price_amount;
  assert.equal(price, 1235);
  assert.ok(Number.isInteger(price));
});

test("checkout carries the tier and link, and identifies nobody", () => {
  const body = buildCheckoutBody(
    {
      amountUsd: 3,
      tier: "transfusion",
      name: "x".repeat(900),
      url: "https://example.com/",
      successUrl: "https://lastlight.lol/?paid=1",
    },
    "p",
  );

  assert.equal(body.metadata.tier, "transfusion");
  assert.equal(body.metadata.url, "https://example.com/");
  assert.equal(body.metadata.name.length, 500, "Polar caps metadata values at 500");

  // No accounts, anywhere in the flow.
  for (const field of ["customer_id", "external_customer_id", "customer_email"]) {
    assert.ok(!(field in body), `${field} would tie this payment to an account`);
  }
});

test("an absent name or link is left out of the metadata, not sent as empty", () => {
  // Polar's metadata values are strings of 1 to 500 characters, so an empty
  // one is a validation error rather than an empty value: sending "" would
  // fail the checkout for every anonymous payer, which is most of them.
  const body = buildCheckoutBody(
    { amountUsd: 3, tier: "transfusion", name: null, url: null, successUrl: "https://x/" },
    "p",
  );
  assert.deepEqual(body.metadata, { tier: "transfusion" });

  for (const value of Object.values(body.metadata)) {
    assert.ok(value.length >= 1 && value.length <= 500, `"${value}" is outside Polar's bounds`);
  }
});

test("a whitespace-only name is absent rather than a blank metadata value", () => {
  const body = buildCheckoutBody(
    { amountUsd: 3, tier: "transfusion", name: "   ", url: "\n", successUrl: "https://x/" },
    "p",
  );
  assert.deepEqual(body.metadata, { tier: "transfusion" });
});
