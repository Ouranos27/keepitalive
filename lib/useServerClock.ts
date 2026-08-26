"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteState } from "./types";

/** How often the client asks the server what time it really is. */
const POLL_MS = 10_000;

/**
 * A clock the client is allowed to draw but not to own.
 *
 * The server's `expires_at` and `now` give the true remaining time. Between
 * polls the client interpolates with performance.now(), which is monotonic.
 * a device with a wrong wall clock, or one that was asleep, still reconciles
 * to the server on the next poll instead of inventing time.
 */
export function useServerClock(initial: SiteState) {
  const [state, setState] = useState(initial);
  const [remaining, setRemaining] = useState(() => Math.max(0, initial.remaining));

  /** The last thing the server said, pinned to a monotonic reading. */
  const sync = useRef({ remaining: Math.max(0, initial.remaining), at: 0 });
  const dead = useRef(!initial.alive);

  useEffect(() => {
    sync.current = { remaining: Math.max(0, initial.remaining), at: performance.now() };
  }, [initial]);

  useEffect(() => {
    if (!state.alive) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as SiteState;
        if (cancelled) return;
        sync.current = { remaining: Math.max(0, next.remaining), at: performance.now() };
        setState(next);
        setRemaining(Math.max(0, next.remaining));
        // The site froze while we were watching. Re-render as the memorial.
        if (!next.alive && !dead.current) {
          dead.current = true;
          window.location.reload();
        }
      } catch {
        // Offline, rate-limited, mid-deploy: keep ticking from the last sync.
      }
    };

    // Four times a second so the displayed second is never visibly late; the
    // state only changes when the integer second does.
    const tick = window.setInterval(() => {
      const elapsed = (performance.now() - sync.current.at) / 1000;
      const next = Math.max(0, sync.current.remaining - elapsed);
      setRemaining((current) => (Math.floor(current) === Math.floor(next) ? current : next));
      if (next <= 0 && !dead.current) void pull();
    }, 250);

    const poll = window.setInterval(() => void pull(), POLL_MS);
    // A backgrounded tab drifts and its timers are throttled. Resync on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state.alive]);

  return { state, remaining, refresh: () => window.location.reload() };
}
