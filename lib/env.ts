/**
 * Configuration, read once and checked.
 *
 * Every environment variable this app reads is resolved here, so there is one
 * list of them rather than a scattering of `process.env` reads, and so the
 * combinations that quietly lose money can be caught at boot instead of at the
 * first payment.
 *
 * The reading is a pure function of an env object, which is what makes the
 * checks testable without a deploy.
 */
import { INITIAL_SECONDS } from "./clock";

export type Env = Record<string, string | undefined>;

export type Config = {
  /** Null means the in-memory store, which is correct locally and nowhere else. */
  redis: { url: string; token: string } | null;
  /** Null means no payment processor, so the checkout refuses to take money. */
  polar: {
    accessToken: string;
    productId: string;
    webhookSecret: string;
    server: "sandbox" | "production";
  } | null;
  siteUrl: string;
  analyticsClientId: string | null;
  /**
   * Where the OpenPanel SDK posts its events. Null means openpanel.dev's own
   * cloud, which is the SDK's default; a URL here points it at a self-hosted
   * instance instead.
   */
  analyticsApiUrl: string | null;
  /**
   * Where the SDK itself is loaded from. Separate from the endpoint, and on a
   * separate host: a self-hosted OpenPanel serves op1.js from its dashboard
   * origin, not from its API origin. Null leaves the script on openpanel.dev
   * even when the events are self-hosted, which works but is a third party on
   * the page.
   */
  analyticsScriptUrl: string | null;
  /** Unix ms the clock started, or null to start it at first read. */
  launchAt: number | null;
  allowSimulatedPayments: boolean;
  production: boolean;
};

export type Problem = {
  /** fatal refuses to boot. warn is logged and carries on. */
  level: "fatal" | "warn";
  key: string;
  message: string;
};

const DEFAULT_SITE_URL = "https://lastlight.lol";

/** Anything before this as a millisecond timestamp is a seconds value by mistake. */
const MS_FLOOR = 1_000_000_000_000;

/**
 * The exact spellings the SDK is wired to.
 *
 * Analytics is the one part of this configuration that fails *silently* when
 * it is wrong: a typo leaves the value undefined, the SDK falls back to its
 * hosted defaults, the build is green, and the self-hosted instance simply
 * stays empty. Nothing else would ever mention it, so the names are held here
 * and near misses are named at boot.
 */
const ANALYTICS = {
  clientId: "NEXT_PUBLIC_OPENPANEL_CLIENT_ID",
  apiUrl: "NEXT_PUBLIC_OPENPANEL_API_URL",
  scriptUrl: "NEXT_PUBLIC_OPENPANEL_SCRIPT_URL",
} as const;

/** What each analytics variable is *nearly* called. */
const ANALYTICS_NEAR_MISSES: Array<[RegExp, string]> = [
  [/^NEX.*OPENPANEL.*CLIENT.*ID/i, ANALYTICS.clientId],
  [/^NEX.*OPENPANEL.*API.*URL/i, ANALYTICS.apiUrl],
  [/^NEX.*OPENPANEL.*SCRIPT.*URL/i, ANALYTICS.scriptUrl],
];

function absoluteHttp(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function trimmed(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * The credential pairs a Redis store can arrive under, in priority order.
 *
 * Connecting Upstash from the Vercel Marketplace does not inject one fixed set
 * of names: the native Upstash integration uses the UPSTASH_ names that
 * `Redis.fromEnv()` reads, while stores that came through Vercel KV carry the
 * KV_ names. Accepting both means the deploy works whichever one the dashboard
 * hands over, and nobody has to hand-copy credentials to satisfy this app.
 */
const REDIS_PAIRS = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
] as const;

function readRedis(env: Env): { url: string; token: string; source: string } | null {
  for (const [urlKey, tokenKey] of REDIS_PAIRS) {
    const url = trimmed(env[urlKey]);
    const token = trimmed(env[tokenKey]);
    if (url && token) return { url, token, source: urlKey };
  }
  return null;
}

export function readConfig(env: Env): Config {
  const redis = readRedis(env);

  const accessToken = trimmed(env.POLAR_ACCESS_TOKEN);
  const productId = trimmed(env.POLAR_PRODUCT_ID);
  const webhookSecret = trimmed(env.POLAR_WEBHOOK_SECRET);

  const launchAt = Number(env.CLOCK_LAUNCH_AT);

  // A malformed URL is dropped rather than handed to the SDK, which would post
  // every event at an unusable address, or load a script tag that never
  // defines window.op. Falling back to the hosted defaults keeps the site
  // measurable, and inspectConfig says so out loud.
  const analyticsApiUrl = trimmed(env[ANALYTICS.apiUrl]);
  const analyticsScriptUrl = trimmed(env[ANALYTICS.scriptUrl]);

  return {
    redis: redis ? { url: redis.url, token: redis.token } : null,
    // All three or nothing. Two out of three is the dangerous shape: it takes
    // money it cannot credit.
    polar:
      accessToken && productId && webhookSecret
        ? {
            accessToken,
            productId,
            webhookSecret,
            server: env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
          }
        : null,
    siteUrl: trimmed(env.NEXT_PUBLIC_SITE_URL) ?? DEFAULT_SITE_URL,
    analyticsClientId: trimmed(env[ANALYTICS.clientId]),
    analyticsApiUrl: analyticsApiUrl && absoluteHttp(analyticsApiUrl) ? analyticsApiUrl : null,
    analyticsScriptUrl:
      analyticsScriptUrl && absoluteHttp(analyticsScriptUrl) ? analyticsScriptUrl : null,
    launchAt: Number.isFinite(launchAt) && launchAt > 0 ? launchAt : null,
    allowSimulatedPayments: env.ALLOW_SIMULATED_PAYMENTS === "1",
    production: env.NODE_ENV === "production",
  };
}

/**
 * What is wrong with this configuration.
 *
 * Fatal covers the two shapes that take money and lose it: no shared store, so
 * every instance keeps a private clock and a webhook lands wherever the load
 * balancer sends it; and a half-configured processor, which can open a checkout
 * it cannot then verify.
 */
export function inspectConfig(env: Env): Problem[] {
  const config = readConfig(env);
  const problems: Problem[] = [];

  if (!config.redis) {
    // ALLOW_SIMULATED_PAYMENTS marks an instance as a demo, so a production
    // build driven for screenshots is not held to the production rules.
    const demo = config.allowSimulatedPayments;

    // Name the pair that is half there, rather than the first one on the list.
    const halfPresent = REDIS_PAIRS.find(
      ([urlKey, tokenKey]) => trimmed(env[urlKey]) !== null || trimmed(env[tokenKey]) !== null,
    );
    const [urlKey, tokenKey] = halfPresent ?? REDIS_PAIRS[0];

    problems.push({
      level: config.production && !demo ? "fatal" : "warn",
      key: urlKey,
      message:
        config.production && !demo
          ? `No Redis configured. Every serverless instance would keep its own clock and ledger, so payments would land on whichever instance answered the webhook. Set ${urlKey} and ${tokenKey}, or connect a Redis store in the Vercel dashboard, which injects them for you.`
          : "No Redis configured, running on the in-memory store. State resets when the process does.",
    });
  } else {
    // A Vercel Redis store also injects a redis:// connection string. It is not
    // the REST endpoint this client speaks, and pasting it here fails at the
    // first read rather than at boot, which is the worst time to find out.
    if (!/^https?:\/\//i.test(config.redis.url)) {
      problems.push({
        level: "fatal",
        key: "UPSTASH_REDIS_REST_URL",
        message: `The Redis URL is "${config.redis.url.slice(0, 12)}...", which is not an https REST endpoint. This app talks to Upstash over REST, so it needs the REST URL (https://<name>.upstash.io), not the redis:// connection string.`,
      });
    }
  }

  const polarKeys = ["POLAR_ACCESS_TOKEN", "POLAR_PRODUCT_ID", "POLAR_WEBHOOK_SECRET"] as const;
  const present = polarKeys.filter((key) => trimmed(env[key]) !== null);

  if (present.length > 0 && present.length < polarKeys.length) {
    const missing = polarKeys.filter((key) => !present.includes(key));
    problems.push({
      level: "fatal",
      key: missing[0],
      message: `Polar is half configured: ${missing.join(", ")} missing. A checkout that cannot be verified by a webhook takes money and never moves the clock.`,
    });
  } else if (present.length === 0 && config.production && !config.allowSimulatedPayments) {
    problems.push({
      level: "warn",
      key: "POLAR_ACCESS_TOKEN",
      message: "No payment processor configured. The site will run and refuse every payment.",
    });
  }

  if (config.allowSimulatedPayments) {
    problems.push({
      level: "warn",
      key: "ALLOW_SIMULATED_PAYMENTS",
      message:
        "Simulated payments are ON. Anyone can move the clock and take the Last Light for free. This exists for screenshots; never leave it set on a live site.",
    });
  }

  if (env.CLOCK_LAUNCH_AT !== undefined && trimmed(env.CLOCK_LAUNCH_AT) !== null) {
    const raw = Number(env.CLOCK_LAUNCH_AT);
    if (!Number.isFinite(raw) || raw <= 0) {
      problems.push({
        level: "warn",
        key: "CLOCK_LAUNCH_AT",
        message: `CLOCK_LAUNCH_AT is not a positive number (${env.CLOCK_LAUNCH_AT}). Ignoring it; the clock will start at the first read.`,
      });
    } else if (raw < MS_FLOOR) {
      // 1.7e9 is a seconds timestamp. Used as milliseconds it lands in 1970 and
      // the site is born dead.
      problems.push({
        level: "warn",
        key: "CLOCK_LAUNCH_AT",
        message: `CLOCK_LAUNCH_AT looks like seconds, not milliseconds (${raw}). As milliseconds this is 1970 and the site starts dead. Multiply by 1000.`,
      });
    }
  }

  if (trimmed(env.NEXT_PUBLIC_SITE_URL) !== null) {
    if (!absoluteHttp(config.siteUrl)) {
      problems.push({
        level: "warn",
        key: "NEXT_PUBLIC_SITE_URL",
        message: `NEXT_PUBLIC_SITE_URL is not an absolute http(s) URL (${env.NEXT_PUBLIC_SITE_URL}). Metadata and checkout redirects will be wrong.`,
      });
    }
  }

  if (env.POLAR_SERVER !== undefined && !["sandbox", "production"].includes(env.POLAR_SERVER)) {
    problems.push({
      level: "warn",
      key: "POLAR_SERVER",
      message: `POLAR_SERVER is "${env.POLAR_SERVER}", which is neither "sandbox" nor "production". Treating it as production.`,
    });
  }

  if (config.production && !config.analyticsClientId) {
    problems.push({
      level: "warn",
      key: ANALYTICS.clientId,
      message: "No analytics client id. The site runs; nothing is measured.",
    });
  }

  // Both URLs are dropped when malformed rather than passed on, so what is
  // reported here is what was thrown away and what happens instead.
  const dropped: Array<[string, string | null, string]> = [
    [ANALYTICS.apiUrl, config.analyticsApiUrl, "events go to the OpenPanel cloud rather than nowhere"],
    [
      ANALYTICS.scriptUrl,
      config.analyticsScriptUrl,
      "the SDK is loaded from openpanel.dev rather than from a tag that fetches nothing",
    ],
  ];
  for (const [key, resolved, consequence] of dropped) {
    const raw = trimmed(env[key]);
    if (raw !== null && resolved === null) {
      problems.push({
        level: "warn",
        key,
        message: `${key} is not an absolute http(s) URL (${raw}). Ignoring it, so ${consequence}.`,
      });
    }
  }

  // A self-hosted OpenPanel serves the SDK from its dashboard origin, so the
  // value wanted here is .../op1.js. An origin on its own is the easy mistake
  // and the silent one: the tag loads the dashboard's HTML, the browser
  // refuses to run it, and window.op is never defined.
  if (config.analyticsScriptUrl && !/\.js($|\?)/i.test(config.analyticsScriptUrl)) {
    problems.push({
      level: "warn",
      key: ANALYTICS.scriptUrl,
      message: `${ANALYTICS.scriptUrl} is ${config.analyticsScriptUrl}, which does not look like a script. A self-hosted instance serves the SDK at <dashboard-origin>/op1.js; an origin on its own loads HTML into a script tag and analytics silently never starts.`,
    });
  }

  if (!config.analyticsClientId && (config.analyticsApiUrl || config.analyticsScriptUrl)) {
    problems.push({
      level: "warn",
      key: ANALYTICS.clientId,
      message: `Self-hosted analytics is configured without ${ANALYTICS.clientId}. Without a client id the SDK is never mounted, so neither the endpoint nor the script is ever called.`,
    });
  }

  // Vercel keeps whatever name was typed, so a slip is invisible from every
  // other angle. Name any near miss rather than let it pass.
  const canonical = new Set<string>(Object.values(ANALYTICS));
  for (const key of Object.keys(env)) {
    if (canonical.has(key) || trimmed(env[key]) === null) continue;
    const meant = ANALYTICS_NEAR_MISSES.find(([pattern]) => pattern.test(key))?.[1];
    if (!meant) continue;
    problems.push({
      level: "warn",
      key,
      message: `${key} is set, but the variable read here is ${meant}. It is being ignored, so analytics is running on its hosted defaults. Rename it.`,
    });
  }

  return problems;
}

function describeAnalytics(config: Config): string {
  if (config.analyticsClientId === null) return "off";
  const events = config.analyticsApiUrl ?? "openpanel cloud";
  const script = config.analyticsScriptUrl ?? "openpanel.dev";
  return `events ${events}, sdk ${script}`;
}

/** One line per variable, with nothing secret in it. */
export function describeConfig(env: Env): string {
  const config = readConfig(env);
  const state = (on: boolean, label: string) => `${on ? "set" : "unset"} ${label}`;
  return [
    `store: ${config.redis ? "upstash" : "memory"}`,
    `payments: ${config.polar ? `polar (${config.polar.server})` : "none"}`,
    `simulated payments: ${config.allowSimulatedPayments ? "ON" : "off"}`,
    `clock start: ${config.launchAt ? new Date(config.launchAt).toISOString() : "first read"}`,
    `analytics: ${describeAnalytics(config)}`,
    `site url: ${config.siteUrl}`,
  ].join(", ");
}

/**
 * Refuse to boot on a fatal problem. A site that is down says what is wrong;
 * a site that is up on the wrong configuration takes money and drops it.
 */
export function assertConfig(env: Env): void {
  const problems = inspectConfig(env);
  for (const problem of problems.filter((p) => p.level === "warn")) {
    console.warn(`[config] ${problem.key}: ${problem.message}`);
  }
  const fatal = problems.filter((p) => p.level === "fatal");
  if (fatal.length > 0) {
    throw new Error(
      `Refusing to start. ${fatal.length === 1 ? "Problem" : "Problems"}:\n` +
        fatal.map((p) => `  - ${p.key}: ${p.message}`).join("\n"),
    );
  }
}

/** The live configuration. Read once per process. */
export const config: Config = readConfig(process.env as Env);

/** Where the clock should expire if it has never been set. */
export function coldExpiresAt(now: number): number {
  return (config.launchAt ?? now) + INITIAL_SECONDS * 1000;
}
