import assert from "node:assert/strict";
import { test } from "node:test";
import { assertConfig, describeConfig, inspectConfig, readConfig, type Env } from "./env";
import { createHmac } from "node:crypto";
import { apiBase, verifyWebhook } from "./polar";

const NOW = 1_800_000_000_000;

/**
 * Sign a body the way Polar does, so the verifier is tested against real
 * signatures rather than against itself.
 */
function sign(body: string, secret: string, at: number) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const decoded = Buffer.from(raw, "base64");
  const key =
    decoded.length > 0 && decoded.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")
      ? decoded
      : Buffer.from(raw, "utf8");

  const id = "msg_test";
  const timestamp = String(Math.floor(at / 1000));
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { id, timestamp, signature: `v1,${signature}` };
}

/** A production environment with everything wired correctly. */
const LIVE: Env = {
  NODE_ENV: "production",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
  POLAR_ACCESS_TOKEN: "polar_at_x",
  POLAR_PRODUCT_ID: "prod_x",
  POLAR_WEBHOOK_SECRET: "whsec_x",
  POLAR_SERVER: "production",
  NEXT_PUBLIC_SITE_URL: "https://lastlight.lol",
  NEXT_PUBLIC_OPENPANEL_CLIENT_ID: "op_x",
};

const fatalKeys = (env: Env) =>
  inspectConfig(env)
    .filter((p) => p.level === "fatal")
    .map((p) => p.key);

const warnKeys = (env: Env) =>
  inspectConfig(env)
    .filter((p) => p.level === "warn")
    .map((p) => p.key);

// --- the shapes that lose money -------------------------------------------

test("a correct production environment boots clean", () => {
  assert.deepEqual(inspectConfig(LIVE), []);
  assert.doesNotThrow(() => assertConfig(LIVE));
});

test("production without Redis refuses to boot", () => {
  const env = { ...LIVE, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined };
  // Every instance would keep a private clock and the webhook would land on
  // whichever one answered.
  assert.deepEqual(fatalKeys(env), ["UPSTASH_REDIS_REST_URL"]);
  assert.throws(() => assertConfig(env), /Refusing to start/);
});

test("a Vercel KV store is accepted under its own variable names", () => {
  // Connecting Upstash from the Vercel dashboard may inject either naming.
  // Refusing the KV_ pair would take down a correctly provisioned project.
  const env = {
    ...LIVE,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    KV_REST_API_URL: "https://example.upstash.io",
    KV_REST_API_TOKEN: "kv-token",
  };
  assert.deepEqual(readConfig(env).redis, {
    url: "https://example.upstash.io",
    token: "kv-token",
  });
  assert.deepEqual(inspectConfig(env), []);
});

test("the UPSTASH pair wins when both are present", () => {
  const env = {
    ...LIVE,
    KV_REST_API_URL: "https://wrong.upstash.io",
    KV_REST_API_TOKEN: "wrong",
  };
  assert.equal(readConfig(env).redis?.url, "https://example.upstash.io");
});

test("a redis:// connection string in place of the REST URL is fatal", () => {
  // Vercel injects both. The REST client cannot speak the protocol URL, and
  // the failure would otherwise surface at the first read rather than at boot.
  const env = { ...LIVE, UPSTASH_REDIS_REST_URL: "redis://default:pw@example.upstash.io:6379" };
  assert.deepEqual(fatalKeys(env), ["UPSTASH_REDIS_REST_URL"]);
  assert.match(inspectConfig(env)[0].message, /REST URL/);
});

test("a half-present KV pair names the KV variables, not the UPSTASH ones", () => {
  const env = {
    ...LIVE,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    KV_REST_API_URL: "https://example.upstash.io",
  };
  const problem = inspectConfig(env).find((p) => p.level === "fatal");
  assert.equal(problem?.key, "KV_REST_API_URL");
  assert.match(problem!.message, /KV_REST_API_TOKEN/);
});

test("half a Redis is no Redis", () => {
  const env = { ...LIVE, UPSTASH_REDIS_REST_TOKEN: undefined };
  assert.equal(readConfig(env).redis, null);
  assert.deepEqual(fatalKeys(env), ["UPSTASH_REDIS_REST_URL"]);
});

test("a half-configured processor refuses to boot, in any environment", () => {
  for (const missing of ["POLAR_ACCESS_TOKEN", "POLAR_PRODUCT_ID", "POLAR_WEBHOOK_SECRET"]) {
    const env = { ...LIVE, [missing]: undefined };
    assert.deepEqual(
      fatalKeys(env),
      [missing],
      `${missing} missing must be fatal: a checkout that cannot be verified takes money and moves nothing`,
    );
    assert.equal(readConfig(env).polar, null, "partial config must never be treated as configured");

    // Same in development, because the failure is the shape, not the stage.
    const dev = { ...env, NODE_ENV: "development" };
    assert.deepEqual(fatalKeys(dev), [missing]);
  }
});

test("no processor at all is a warning, not a failure", () => {
  const env = {
    ...LIVE,
    POLAR_ACCESS_TOKEN: undefined,
    POLAR_PRODUCT_ID: undefined,
    POLAR_WEBHOOK_SECRET: undefined,
  };
  assert.deepEqual(fatalKeys(env), []);
  assert.ok(warnKeys(env).includes("POLAR_ACCESS_TOKEN"));
  assert.doesNotThrow(() => assertConfig(env));
});

test("the demo flag waives the Redis requirement, and only that one", () => {
  const demo = {
    ...LIVE,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    ALLOW_SIMULATED_PAYMENTS: "1",
  };
  // A production build driven for screenshots has no Redis and should still run.
  assert.deepEqual(fatalKeys(demo), []);
  assert.ok(warnKeys(demo).includes("UPSTASH_REDIS_REST_URL"));
  assert.ok(warnKeys(demo).includes("ALLOW_SIMULATED_PAYMENTS"));

  // It does not waive the half-configured processor, which is a different bug.
  const halfPolar = { ...demo, POLAR_WEBHOOK_SECRET: undefined };
  assert.deepEqual(fatalKeys(halfPolar), ["POLAR_WEBHOOK_SECRET"]);
});

test("simulated payments are always flagged, loudly", () => {
  const env = { ...LIVE, ALLOW_SIMULATED_PAYMENTS: "1" };
  assert.ok(readConfig(env).allowSimulatedPayments);
  assert.ok(warnKeys(env).includes("ALLOW_SIMULATED_PAYMENTS"));
  // It stays a warning rather than a failure: it is the only way to drive a
  // production build for screenshots.
  assert.deepEqual(fatalKeys(env), []);
});

test("anything other than exactly 1 leaves simulated payments off", () => {
  for (const value of ["0", "true", "yes", "", undefined]) {
    assert.equal(
      readConfig({ ...LIVE, ALLOW_SIMULATED_PAYMENTS: value }).allowSimulatedPayments,
      false,
      `"${value}" must not enable free payments`,
    );
  }
});

// --- the clock ------------------------------------------------------------

test("a seconds timestamp in CLOCK_LAUNCH_AT is caught", () => {
  // 1787000000 is seconds. Read as milliseconds it is January 1970, and the
  // site would be born dead.
  const env = { ...LIVE, CLOCK_LAUNCH_AT: "1787000000" };
  assert.ok(warnKeys(env).includes("CLOCK_LAUNCH_AT"));
  assert.match(inspectConfig(env)[0].message, /seconds, not milliseconds/);
});

test("a valid millisecond launch instant passes and is used", () => {
  const env = { ...LIVE, CLOCK_LAUNCH_AT: "1787000000000" };
  assert.deepEqual(inspectConfig(env), []);
  assert.equal(readConfig(env).launchAt, 1787000000000);
});

test("junk in CLOCK_LAUNCH_AT warns and is ignored rather than crashing the clock", () => {
  for (const value of ["yesterday", "-5", "0"]) {
    const env = { ...LIVE, CLOCK_LAUNCH_AT: value };
    assert.equal(readConfig(env).launchAt, null, `"${value}" must not become a launch time`);
    assert.ok(warnKeys(env).includes("CLOCK_LAUNCH_AT"));
  }
});

test("an unset launch instant is silent, because that is the local default", () => {
  const env = { ...LIVE, CLOCK_LAUNCH_AT: undefined };
  assert.equal(readConfig(env).launchAt, null);
  assert.ok(!warnKeys(env).includes("CLOCK_LAUNCH_AT"));
});

// --- the rest -------------------------------------------------------------

test("the sandbox flag picks a different host, and typos are caught", () => {
  assert.equal(readConfig({ ...LIVE, POLAR_SERVER: "sandbox" }).polar?.server, "sandbox");
  assert.equal(apiBase("sandbox"), "https://sandbox-api.polar.sh");
  assert.equal(apiBase("production"), "https://api.polar.sh");

  const typo = { ...LIVE, POLAR_SERVER: "sandbx" };
  assert.equal(readConfig(typo).polar?.server, "production", "an unknown value must not be sandbox");
  assert.ok(warnKeys(typo).includes("POLAR_SERVER"));
});

test("the site url falls back rather than breaking metadata", () => {
  assert.equal(readConfig({ ...LIVE, NEXT_PUBLIC_SITE_URL: undefined }).siteUrl, "https://lastlight.lol");
  assert.ok(warnKeys({ ...LIVE, NEXT_PUBLIC_SITE_URL: "lastlight.lol" }).includes("NEXT_PUBLIC_SITE_URL"));
  assert.ok(warnKeys({ ...LIVE, NEXT_PUBLIC_SITE_URL: "ftp://lastlight.lol" }).includes("NEXT_PUBLIC_SITE_URL"));
});

test("whitespace-only values count as unset", () => {
  const env = { ...LIVE, UPSTASH_REDIS_REST_TOKEN: "   ", NEXT_PUBLIC_OPENPANEL_CLIENT_ID: "  " };
  assert.equal(readConfig(env).redis, null);
  assert.equal(readConfig(env).analyticsClientId, null);
});

test("values are trimmed, because a pasted secret usually has a newline on it", () => {
  const env = { ...LIVE, POLAR_PRODUCT_ID: " prod_x\n" };
  assert.equal(readConfig(env).polar?.productId, "prod_x");
});

test("missing analytics is a warning in production only", () => {
  const withoutAnalytics = { ...LIVE, NEXT_PUBLIC_OPENPANEL_CLIENT_ID: undefined };
  assert.ok(warnKeys(withoutAnalytics).includes("NEXT_PUBLIC_OPENPANEL_CLIENT_ID"));
  assert.ok(
    !warnKeys({ ...withoutAnalytics, NODE_ENV: "development" }).includes(
      "NEXT_PUBLIC_OPENPANEL_CLIENT_ID",
    ),
  );
});

test("a bare development environment is usable and says so", () => {
  const problems = inspectConfig({ NODE_ENV: "development" });
  assert.deepEqual(problems.filter((p) => p.level === "fatal"), [], "local dev must always boot");
  assert.ok(problems.some((p) => p.key === "UPSTASH_REDIS_REST_URL" && p.level === "warn"));
});

test("the summary line names the state without printing a secret", () => {
  const line = describeConfig(LIVE);
  assert.match(line, /store: upstash/);
  assert.match(line, /payments: polar \(production\)/);
  for (const secret of ["polar_at_x", "whsec_x", "token", "prod_x"]) {
    assert.ok(!line.includes(secret), `${secret} must not appear in a log line`);
  }
});

// --- webhook signatures ----------------------------------------------------
//
// The webhook is the only thing that can move the clock, so forging one is the
// whole attack surface. These cover the Standard Webhooks verification.

test("a correctly signed delivery verifies", () => {
  const secret = "whsec_" + Buffer.from("topsecretkey").toString("base64");
  const body = JSON.stringify({ type: "order.created", data: { id: "ord_1" } });
  const headers = sign(body, secret, NOW);
  assert.equal(verifyWebhook(body, headers, secret, NOW), true);
});

test("a tampered body fails, even with a real signature attached", () => {
  const secret = "whsec_" + Buffer.from("topsecretkey").toString("base64");
  const body = JSON.stringify({ type: "order.created", data: { id: "ord_1", total_amount: 300 } });
  const headers = sign(body, secret, NOW);

  const inflated = body.replace('"total_amount":300', '"total_amount":300000');
  assert.equal(verifyWebhook(inflated, headers, secret, NOW), false);
});

test("a signature from a different secret fails", () => {
  const body = JSON.stringify({ type: "order.created" });
  const headers = sign(body, "whsec_" + Buffer.from("attacker").toString("base64"), NOW);
  assert.equal(
    verifyWebhook(body, headers, "whsec_" + Buffer.from("topsecretkey").toString("base64"), NOW),
    false,
  );
});

test("a replayed delivery outside the tolerance fails", () => {
  const secret = "whsec_" + Buffer.from("topsecretkey").toString("base64");
  const body = JSON.stringify({ type: "order.created" });
  const old = NOW - 10 * 60 * 1000;
  const headers = sign(body, secret, old);

  assert.equal(verifyWebhook(body, headers, secret, old), true, "valid when fresh");
  assert.equal(verifyWebhook(body, headers, secret, NOW), false, "ten minutes later it is a replay");
});

test("missing or malformed headers fail closed", () => {
  const secret = "whsec_" + Buffer.from("topsecretkey").toString("base64");
  const body = "{}";
  const good = sign(body, secret, NOW);

  for (const broken of [
    { ...good, id: null },
    { ...good, timestamp: null },
    { ...good, signature: null },
    { ...good, timestamp: "not-a-number" },
    { ...good, signature: "v1,not-base64-at-all" },
    { ...good, signature: "" },
  ]) {
    assert.equal(verifyWebhook(body, broken, secret, NOW), false);
  }
});

test("a rotated secret list still verifies the one that matches", () => {
  const secret = "whsec_" + Buffer.from("topsecretkey").toString("base64");
  const body = "{}";
  const real = sign(body, secret, NOW);
  // Standard Webhooks sends a space-separated list during rotation.
  const withOld = { ...real, signature: `v1,c3RhbGU= ${real.signature}` };
  assert.equal(verifyWebhook(body, withOld, secret, NOW), true);
});

test("a plain-text secret works as well as a base64 one", () => {
  const body = "{}";
  const plain = "not-base64-at-all!!";
  assert.equal(verifyWebhook(body, sign(body, plain, NOW), plain, NOW), true);
});
