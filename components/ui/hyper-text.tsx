"use client";

/**
 * HyperText, from the Magic UI registry.
 *
 *   npx shadcn@latest add "https://magicui.design/r/hyper-text.json"
 *
 * Vendored and adapted rather than installed verbatim, because this project
 * styles with plain CSS and the registry ships Tailwind classes. The scramble
 * algorithm is the registry's; three things were changed for a clock:
 *
 *   1. `text` re-syncs while idle. The original seeds its display state once,
 *      which is right for a static headline and wrong for a string that
 *      changes every second.
 *   2. `hold` keeps chosen characters out of the scramble, so the colons stay
 *      put while the digits come apart.
 *   3. `renderCharacter` lets the caller own each cell, so the digits can sit
 *      in fixed-width slots and the clock never re-flows mid-scramble.
 *
 * Magic UI is MIT licensed.
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const randomInt = (max: number) => Math.floor(Math.random() * max);

export type HyperTextProps = {
  /** The string to display. Scrambles once, then tracks this value. */
  text: string;
  /** Characters the scramble draws from. */
  characterSet?: readonly string[];
  /** Characters that are never scrambled. */
  hold?: readonly string[];
  /** Length of the scramble, in milliseconds. */
  duration?: number;
  /** Wraps each character. Defaults to a bare span. */
  renderCharacter?: (character: string, index: number) => ReactNode;
  className?: string;
};

const DIGITS = Object.freeze("0123456789".split(""));

export function HyperText({
  text,
  characterSet = DIGITS,
  hold = [],
  duration = 700,
  renderCharacter,
  className,
}: HyperTextProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<string[]>(() => text.split(""));
  const [scrambling, setScrambling] = useState(!reduceMotion);
  const iteration = useRef(0);

  // Idle: the clock is the source of truth and the display follows it exactly.
  useEffect(() => {
    if (!scrambling) setDisplay(text.split(""));
  }, [text, scrambling]);

  useEffect(() => {
    if (!scrambling) return;
    if (reduceMotion) {
      setScrambling(false);
      return;
    }

    let frame: number | null = null;
    const characters = text.split("");
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      iteration.current = progress * characters.length;

      // Left to right, each position settles onto its real value in turn.
      setDisplay(
        characters.map((character, index) =>
          hold.includes(character) || index <= iteration.current
            ? character
            : characterSet[randomInt(characterSet.length)],
        ),
      );

      if (progress < 1) frame = requestAnimationFrame(step);
      else setScrambling(false);
    };

    frame = requestAnimationFrame(step);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // The scramble is a one-shot on mount. Remount it (a changing `key`) to
    // fire it again; it must not restart every time `text` ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrambling, reduceMotion]);

  return (
    <div className={cn(className)}>
      {display.map((character, index) => (
        <Fragment key={index}>
          {renderCharacter ? renderCharacter(character, index) : <span>{character}</span>}
        </Fragment>
      ))}
    </div>
  );
}
