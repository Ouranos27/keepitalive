"use client";

import { formatAdded, formatDuration, type DegradationState } from "@/lib/clock";
import { HyperText } from "./ui/hyper-text";

/**
 * The clock, and the only thing on this page carrying any dread.
 *
 * Two devices, both aimed at the number and nothing else:
 *
 *   1. Misregistration. As the clock runs down, two offset copies of the
 *      digits separate out behind the ink, the way a cheap press drifts out of
 *      alignment. It is drawn with text-shadow rather than extra elements, so
 *      the whole effect is one CSS variable getting larger. Under a minute the
 *      offset copies go arterial red and the ink starts to bleed.
 *
 *   2. A scramble, from Magic UI's HyperText, keyed to the condition. It fires
 *      once when the clock crosses into each worse state, so the number comes
 *      apart for a moment and reassembles. Keying it to the threshold rather
 *      than running it continuously matters: the last minute is exactly when
 *      somebody needs to read this, and an unreadable countdown is a worse
 *      idea than a still one.
 */
export function Countdown({
  remaining,
  phase,
}: {
  remaining: number;
  phase: DegradationState;
}) {
  const text = formatDuration(remaining);

  return (
    <div className="time-wrap">
      {/*
        Announcing a countdown every second is unusable, so the digits are
        hidden from assistive tech and one coarse, quiet label carries it.
      */}
      <span className="sr-only" role="timer">
        {remaining > 0 ? `${formatAdded(remaining)} left` : "No time left"}
      </span>

      <div aria-hidden="true">
        <HyperText
          // Remounting on the condition is what re-fires the scramble.
          key={phase}
          text={text}
          hold={[":"]}
          duration={phase === "terminal" ? 420 : 760}
          className="time"
          renderCharacter={(character) =>
            character === ":" ? (
              <span className="time__colon">:</span>
            ) : (
              <span className="time__cell">{character}</span>
            )
          }
        />
      </div>
    </div>
  );
}

/** The frozen clock on the memorial. No scramble, no motion, no client. */
export function DeadClock() {
  return (
    <div className="time-wrap">
      <div className="time" aria-label="Zero. The clock has stopped.">
        {formatDuration(0)
          .split("")
          .map((character, index) => (
            <span key={index} className={character === ":" ? "time__colon" : "time__cell"}>
              {character}
            </span>
          ))}
      </div>
    </div>
  );
}
