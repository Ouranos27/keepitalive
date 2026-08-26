import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIGHTS_OUT_SECONDS,
  contrast,
  duskProgress,
  luminance,
  paletteFor,
  paletteVars,
} from "./theme";

const FULL = 24 * 60 * 60;

/** WCAG AA: 4.5 for body text, 3 for hairlines and other non-text. */
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Every second of a full clock, sampled finely enough to catch a bad band. */
function sweep(): number[] {
  const points: number[] = [];
  for (let remaining = FULL; remaining >= 0; remaining -= 60) points.push(remaining);
  // The seconds either side of the switch, where a naive ramp goes unreadable.
  for (const edge of [LIGHTS_OUT_SECONDS + 2, LIGHTS_OUT_SECONDS + 1, LIGHTS_OUT_SECONDS, LIGHTS_OUT_SECONDS - 1, 30, 5, 1, 0]) {
    points.push(edge);
  }
  return points;
}

test("every text token clears AA at every point of the clock", () => {
  // This is the whole reason the palette is computed rather than authored: a
  // light page interpolated into a dark one passes through a band where both
  // near-black and near-white text fail, and nothing in CSS would tell us.
  for (const remaining of sweep()) {
    const palette = paletteFor(remaining);
    for (const token of ["ink", "ash", "faint"] as const) {
      const ratio = contrast(palette[token], palette.bg);
      assert.ok(
        ratio >= AA_TEXT,
        `${token} on bg is ${ratio.toFixed(2)}:1 at ${remaining}s remaining, below ${AA_TEXT}`,
      );
    }
  }
});

test("text clears AA against card surfaces too, not just the page", () => {
  for (const remaining of sweep()) {
    const palette = paletteFor(remaining);
    for (const token of ["ink", "ash", "faint"] as const) {
      const ratio = contrast(palette[token], palette.card);
      assert.ok(
        ratio >= AA_TEXT,
        `${token} on card is ${ratio.toFixed(2)}:1 at ${remaining}s remaining`,
      );
    }
  }
});

test("hairlines stay visible without being text", () => {
  for (const remaining of sweep()) {
    const palette = paletteFor(remaining);
    const ratio = contrast(palette.rule, palette.bg);
    assert.ok(ratio >= 1.2, `rule is invisible at ${remaining}s (${ratio.toFixed(2)}:1)`);
    assert.ok(ratio < AA_NON_TEXT * 2, `rule is shouting at ${remaining}s (${ratio.toFixed(2)}:1)`);
  }
});

test("the lights go out in one step, because a gradual crossing cannot stay readable", () => {
  const before = paletteFor(LIGHTS_OUT_SECONDS + 1);
  const after = paletteFor(LIGHTS_OUT_SECONDS);

  assert.equal(before.dark, false);
  assert.equal(after.dark, true);

  // The jump has to clear the unreadable band outright rather than ease into it.
  const dropped = luminance(before.bg) - luminance(after.bg);
  assert.ok(dropped > 0.25, `the room only dropped ${dropped.toFixed(3)} of luminance`);

  // Both sides of the step are comfortably readable, which is the point.
  assert.ok(contrast(before.ink, before.bg) >= 6, "the last lit frame must be easy to read");
  assert.ok(contrast(after.ink, after.bg) >= 6, "the first dark frame must be easy to read");
});

test("the page only ever gets darker", () => {
  let previous = Infinity;
  for (let remaining = FULL; remaining >= 0; remaining -= 30) {
    const here = luminance(paletteFor(remaining).bg);
    assert.ok(here <= previous + 1e-9, `the room got brighter at ${remaining}s remaining`);
    previous = here;
  }
});

test("most of the day is spent close to full brightness", () => {
  // A page that is grey all afternoon has spent its dimming too early.
  assert.ok(duskProgress(FULL) < 0.01, "a full clock is not dimmed");
  assert.ok(duskProgress(12 * 3600) < 0.3, "half way through should still read as daylight");
  assert.ok(duskProgress(3600) > 0.85, "the last hour should be visibly failing");
  assert.equal(duskProgress(LIGHTS_OUT_SECONDS), 1);
});

test("dusk never reaches the dark palette by interpolation alone", () => {
  // If the ramp could arrive at dark on its own, the step would be pointless
  // and the unreadable band would be back.
  const lastLit = paletteFor(LIGHTS_OUT_SECONDS + 1);
  assert.ok(luminance(lastLit.bg) > 0.3, "dusk must stop while it is still a light page");
  assert.equal(lastLit.dark, false);
});

test("a dead clock is dark, and stays dark", () => {
  for (const remaining of [LIGHTS_OUT_SECONDS, 60, 1, 0, -5]) {
    assert.equal(paletteFor(remaining).dark, true, `${remaining}s should be dark`);
  }
});

test("the palette exports as CSS variables the page can consume", () => {
  const vars = paletteVars(paletteFor(FULL));
  assert.deepEqual(Object.keys(vars).sort(), [
    "--ash",
    "--blood",
    "--card",
    "--faint",
    "--grain",
    "--ink",
    "--paper",
    "--rule",
  ]);
  assert.match(vars["--paper"], /^rgb\(\d+ \d+ \d+\)$/);
});

test("the accent is badge text, so it clears AA in every room", () => {
  // No single red clears AA on paper and on a near-black ground, which is why
  // the accent moves with the palette instead of being a constant.
  for (const remaining of sweep()) {
    const palette = paletteFor(remaining);
    for (const ground of ["bg", "card"] as const) {
      const ratio = contrast(palette.blood, palette[ground]);
      assert.ok(
        ratio >= AA_TEXT,
        `accent on ${ground} is ${ratio.toFixed(2)}:1 at ${remaining}s remaining`,
      );
    }
  }
});
