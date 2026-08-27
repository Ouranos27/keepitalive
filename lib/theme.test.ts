import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DARK, LIT, contrast, luminance, poolFor, rgb, type Palette } from "./theme";

const FULL = 24 * 60 * 60;

/** WCAG AA: 4.5 for body text, 3 for hairlines and other non-text. */
const AA_TEXT = 4.5;

const ROOMS: Array<[string, Palette]> = [
  ["lit", LIT],
  ["dark", DARK],
];

test("every text token clears AA in both rooms, on the ground and on cards", () => {
  // There are exactly two palettes and nothing between them, which is the
  // whole reason the pool shrinks rather than the page fading: a fade passes
  // through a band of grey where neither dark nor light text clears AA.
  for (const [name, palette] of ROOMS) {
    for (const ground of ["bg", "card", "sunk"] as const) {
      for (const token of ["ink", "ash", "faint", "blood"] as const) {
        const ratio = contrast(palette[token], palette[ground]);
        assert.ok(ratio >= AA_TEXT, `${name}: ${token} on ${ground} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("hairlines are visible without shouting", () => {
  for (const [name, palette] of ROOMS) {
    const ratio = contrast(palette.rule, palette.bg);
    assert.ok(ratio >= 1.2, `${name}: rule is invisible (${ratio.toFixed(2)}:1)`);
    assert.ok(ratio < 6, `${name}: rule is shouting (${ratio.toFixed(2)}:1)`);
  }
});

test("the dark room is warm and not grey", () => {
  // The complaint the pool was built to answer: mid greys look muddy, and grey
  // text on a grey ground is the worst of it. Everything dark here is warm,
  // and the text on it is bone rather than a neutral.
  assert.ok(luminance(DARK.bg) < 0.02, "the dark ground must be genuinely dark, not charcoal");
  for (const token of ["ink", "ash", "faint"] as const) {
    const [r, , b] = DARK[token];
    assert.ok(r > b, `dark ${token} is not warm (r ${r} should exceed b ${b})`);
  }
  // Nothing in the dark room sits in the muddy middle.
  for (const token of ["bg", "card", "sunk"] as const) {
    assert.ok(luminance(DARK[token]) < 0.05, `dark ${token} is drifting toward grey`);
  }
});

test("the light closes in, and never opens back up", () => {
  let previous = Infinity;
  for (let remaining = FULL; remaining >= 0; remaining -= 30) {
    const pool = poolFor(remaining);
    assert.ok(pool <= previous + 1e-9, `the light grew at ${remaining}s remaining`);
    previous = pool;
  }
});

test("the pool covers the page for most of the day and closes at the end", () => {
  assert.ok(poolFor(FULL) > 1.4, "a full clock is lit corner to corner");
  assert.ok(poolFor(12 * 3600) > 1.1, "half way through, still comfortably lit");
  assert.ok(poolFor(3600) < 0.6, "the last hour lights little more than the clock");
  assert.ok(poolFor(600) < 0.35, "the last ten minutes are nearly out");
  assert.equal(poolFor(0), 0, "at zero there is no light at all");
});

test("a clock past zero stays dark rather than going negative", () => {
  for (const remaining of [0, -1, -600]) {
    assert.equal(poolFor(remaining), 0, `${remaining}s should be fully dark`);
  }
});

test("a clock over its ceiling does not overshoot the pool", () => {
  // Payments can push the clock past 24h, which must not produce a light
  // brighter than "everything".
  assert.equal(poolFor(72 * 3600), poolFor(FULL));
});

test("the palettes in globals.css have not drifted from these", () => {
  // The tokens exist twice: here, where they are tested, and in the stylesheet,
  // where they are used. This is the guard against the two disagreeing.
  const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8");

  for (const [name, palette] of ROOMS) {
    const block = css.match(new RegExp(`\\[data-room="${name}"\\]\\s*\\{([^}]*)\\}`));
    assert.ok(block, `globals.css has no [data-room="${name}"] block`);

    const tokens: Array<[string, keyof Palette]> = [
      ["--paper", "bg"],
      ["--card", "card"],
      ["--paper-sunk", "sunk"],
      ["--ink", "ink"],
      ["--ash", "ash"],
      ["--faint", "faint"],
      ["--rule", "rule"],
      ["--blood", "blood"],
    ];
    for (const [property, key] of tokens) {
      const declared: RegExpMatchArray | null = block![1].match(
        new RegExp(`${property}:\\s*([^;]+);`),
      );
      assert.ok(declared, `${name} room is missing ${property}`);
      assert.equal(
        declared![1].trim(),
        rgb(palette[key]),
        `${name} ${property} in globals.css disagrees with theme.ts`,
      );
    }
  }
});
