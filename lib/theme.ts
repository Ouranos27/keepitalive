/**
 * The room the page is lit by.
 *
 * The bulb is not decoration: it is the light source, and the page is lit by
 * it. What the clock drives is not the page's brightness but the *reach* of
 * the light: a pool centred on the bulb that closes in as the filament fails,
 * until there is nothing lit at all.
 *
 * That shape is what makes the whole thing work. An earlier version faded the
 * page from paper to black, which forced it through a band of mid grey where
 * neither dark nor light text clears AA, and which looked muddy the whole way.
 * A shrinking pool never produces that grey: every part of the page is either
 * inside the light, on paper with dark ink, or outside it, on near-black with
 * light ink. There are exactly two palettes and nothing in between.
 *
 * Which of the two a section uses is decided by whether it falls inside the
 * pool, measured in LiveSite. theme.test.ts holds both palettes to WCAG AA and
 * checks they have not drifted from the copies in globals.css.
 */

export type RGB = [number, number, number];

export type Palette = {
  /** The ground. */
  bg: RGB;
  /** Card and control surfaces, one step off the ground. */
  card: RGB;
  /** The banded rows in the ledger, one step *into* the ground. */
  sunk: RGB;
  /** Primary text. */
  ink: RGB;
  /** Secondary text. */
  ash: RGB;
  /** Tertiary text: meta lines, counts, labels. Still small text, still AA. */
  faint: RGB;
  /** Hairlines. Not text, so it is held to the non-text minimum. */
  rule: RGB;
  /** The accent. Each room needs its own: no single red clears AA on both. */
  blood: RGB;
};

/** The full clock, for scaling the pool. */
const FULL_SECONDS = 24 * 60 * 60;

/**
 * Inside the light. Paper, dark ink, the page this site is normally.
 */
export const LIT: Palette = {
  bg: [243, 243, 241],
  card: [251, 251, 250],
  sunk: [236, 236, 234],
  ink: [18, 18, 17],
  ash: [92, 92, 87],
  faint: [103, 103, 97],
  rule: [220, 220, 216],
  blood: [178, 34, 26],
};

/**
 * Outside it. Warm near-black rather than a neutral charcoal, and the text on
 * it is bone and sand rather than grey: a dark room lit by a filament is warm,
 * and grey-on-grey is the thing this palette exists to avoid.
 */
export const DARK: Palette = {
  bg: [13, 11, 10],
  card: [26, 23, 21],
  sunk: [22, 19, 18],
  ink: [244, 238, 232],
  ash: [198, 187, 176],
  faint: [163, 152, 141],
  rule: [58, 52, 47],
  blood: [255, 138, 112],
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * How far the light reaches, as a multiple of the viewport's larger side.
 *
 * Above 1.4 it covers the whole page. It closes in slowly at first and then
 * quickly, so most of the day is spent fully lit and the last hour is a bulb
 * lighting little more than the clock.
 */
export function poolFor(remaining: number): number {
  const left = clamp(remaining / FULL_SECONDS, 0, 1);
  return Number((1.75 * left ** 0.45).toFixed(4));
}

/** Nothing is lit any more. */
export function isDark(remaining: number): boolean {
  return poolFor(remaining) <= 0;
}

export function rgb([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

// --- contrast --------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const one = luminance(a);
  const two = luminance(b);
  const [hi, lo] = one > two ? [one, two] : [two, one];
  return (hi + 0.05) / (lo + 0.05);
}
