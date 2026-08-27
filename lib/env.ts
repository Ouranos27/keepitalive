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

/** The one spelling the SDK is wired to. Typos here fail silently, so it is named once. */
const ANALYTICS_API_URL = "NEXT_PUBLIC_OPENPANEL_API_URL";

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

  // A malformed endpoint is dropped rather than handed to the SDK: the SDK
  // would post events at it and lose every one. Falling back to the cloud
  // keeps the site measurable, and inspectConfig says so out loud.
  const analyticsApiUrl = trimmed(env[ANALYTICS_API_URL]);

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
    analyticsClientId: trimmed(env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID),
    analyticsApiUrl: analyticsApiUrl && absoluteHttp(analyticsApiUrl) ? analyticsApiUrl : null,
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
      key: "NEXT_PUBLIC_OPENPANEL_CLIENT_ID",
      message: "No analytics client id. The site runs; nothing is measured.",
    });
  }

  const rawAnalyticsApiUrl = trimmed(env[ANALYTICS_API_URL]);
  if (rawAnalyticsApiUrl !== null && config.analyticsApiUrl === null) {
    problems.push({
      level: "warn",
      key: ANALYTICS_API_URL,
      message: `${ANALYTICS_API_URL} is not an absolute http(s) URL (${rawAnalyticsApiUrl}). Ignoring it, so events go to the OpenPanel cloud rather than nowhere.`,
    });
  }

  if (config.analyticsApiUrl !== null && !config.analyticsClientId) {
    problems.push({
      level: "warn",
      key: "NEXT_PUBLIC_OPENPANEL_CLIENT_ID",
      message:
        "A self-hosted analytics endpoint is set without NEXT_PUBLIC_OPENPANEL_CLIENT_ID. Without a client id the SDK is never mounted, so the endpoint is never called.",
    });
  }

  // Vercel keeps whatever name you typed, so a slip here is invisible: the
  // build is green, the SDK falls back to the cloud, and the self-hosted
  // instance stays empty. Name any near miss rather than let it pass.
  for (const key of Object.keys(env)) {
    if (key === ANALYTICS_API_URL) continue;
    if (!/^NEX.*OPENPANEL.*API.*URL/i.test(key)) continue;
    if (trimmed(env[key]) === null) continue;
    problems.push({
      level: "warn",
      key,
      message: `${key} is set, but the variable the OpenPanel SDK reads here is ${ANALYTICS_API_URL}. Events are going to the OpenPanel cloud, not the self-hosted instance. Rename it.`,
    });
  }

  return problems;
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
    `analytics: ${
      config.analyticsClientId === null
        ? "off"
        : config.analyticsApiUrl === null
          ? "openpanel cloud"
          : `self-hosted (${config.analyticsApiUrl})`
    }`,
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
