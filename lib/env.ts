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

function trimmed(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function readConfig(env: Env): Config {
  const redisUrl = trimmed(env.UPSTASH_REDIS_REST_URL);
  const redisToken = trimmed(env.UPSTASH_REDIS_REST_TOKEN);

  const accessToken = trimmed(env.POLAR_ACCESS_TOKEN);
  const productId = trimmed(env.POLAR_PRODUCT_ID);
  const webhookSecret = trimmed(env.POLAR_WEBHOOK_SECRET);

  const launchAt = Number(env.CLOCK_LAUNCH_AT);

  return {
    redis: redisUrl && redisToken ? { url: redisUrl, token: redisToken } : null,
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
    problems.push({
      level: config.production && !demo ? "fatal" : "warn",
      key: "UPSTASH_REDIS_REST_URL",
      message:
        config.production && !demo
          ? "No Redis configured. Every serverless instance would keep its own clock and ledger, so payments would land on whichever instance answered the webhook. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
          : "No Redis configured, running on the in-memory store. State resets when the process does.",
    });
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
    try {
      const url = new URL(config.siteUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
    } catch {
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
    state(config.analyticsClientId !== null, "analytics"),
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
