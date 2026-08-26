/**
 * Timestamps are rendered in UTC, always. The ledger is a public record, the
 * memorial is permanent, and a server render that disagrees with the client's
 * timezone would both mismatch on hydration and quietly rewrite history for
 * whoever loads it from another continent.
 */
const STAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** "26 Aug 2026, 21:04:11 UTC" */
export function formatStamp(unixMs: number): string {
  return `${STAMP.format(new Date(unixMs))} UTC`;
}

/** "21:04:11 UTC". The ledger has enough columns already. */
export function formatTime(unixMs: number): string {
  const d = new Date(unixMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}
