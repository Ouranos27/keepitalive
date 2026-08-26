/**
 * Boot-time configuration check.
 *
 * Next calls this once when the server starts. It is the only moment where a
 * misconfiguration can be caught before it costs anything: after this, the
 * first sign of a missing Redis or a half-configured processor is a payment
 * that took money and moved nothing.
 */
import { assertConfig, describeConfig } from "@/lib/env";

export function register() {
  // Only the Node runtime has the full environment; the edge copy would report
  // a different and misleading picture.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  console.log(`[config] ${describeConfig(process.env)}`);
  assertConfig(process.env);
}
