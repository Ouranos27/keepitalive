/**
 * The room the page is lit by.
 *
 * The bulb is not decoration: it is the light source, and the page is lit by
 * it. As the filament burns down the room dims, and when the bulb finally goes
 * the site is in the dark for good.
 *
 * The palette is computed here rather than authored in CSS because it has an
 * invariant that has to hold at every point of the transition, not just at the
 * two ends: every piece of text must stay readable. Interpolating a light page
 * into a dark one passes through a band where near-black text and near-white
 * text both fail against the background, so the dimming stops short of that
 * band and the page crosses it in one step. That step is the lights going out,
 * which is the moment worth having anyway.
 *
 * theme.test.ts sweeps the whole clock and fails if any token drops below
 * WCAG AA at any second of it.
 */

export type RGB = [number, number, number];

export type Palette = {
  /** The page ground. */
  bg: RGB;
  /** Card and control surfaces, one step off the ground. */
  card: RGB;
  /** Primary text. */
  ink: RGB;
  /** Secondary text. */
  ash: RGB;
  /** Tertiary text: meta lines, counts, labels. Still small text, still AA. */
  faint: RGB;
  /** Hairlines. Not text, so it is held to the non-text minimum. */
  rule: RGB;
  /**
   * The accent. It moves with the room: no single red clears AA on paper and
   * on a near-black ground, so it darkens through dusk and brightens once the
   * lights are out.
   */
  blood: RGB;
  /** How much tooth the paper has. Grain is invisible on a dark ground. */
  grain: number;
  /** True once the bulb has gone and the page is dark. */
  dark: boolean;
};

/** The clock reading at which the lights go out, in seconds. */
export const LIGHTS_OUT_SECONDS = 10 * 60;

/** The full clock, for scaling the dimming. */
const FULL_SECONDS = 24 * 60 * 60;

/*
 * Lit: paper. Dusk: the same room with the bulb failing, dimmed as far as it
 * can go while near-black text still clears AA. Dark: after the bulb.
 */
const LIT: Palette = {
  bg: [243, 243, 241],
  card: [251, 251, 250],
  ink: [18, 18, 17],
  ash: [92, 92, 87],
  faint: [108, 108, 102],
  rule: [220, 220, 216],
  blood: [178, 34, 26],
  grain: 0.055,
  dark: false,
};

const DUSK: Palette = {
  bg: [168, 166, 161],
  card: [180, 178, 173],
  ink: [16, 16, 15],
  ash: [46, 46, 43],
  faint: [58, 58, 54],
  rule: [140, 138, 134],
  blood: [110, 19, 13],
  grain: 0.075,
  dark: false,
};

const DARK: Palette = {
  bg: [14, 12, 12],
  card: [24, 22, 21],
  ink: [237, 231, 227],
  ash: [178, 170, 164],
  faint: [148, 140, 134],
  rule: [48, 44, 42],
  blood: [244, 121, 95],
  grain: 0,
  dark: true,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * How far into the evening the page is, from 0 at a full clock to 1 at the
 * moment the lights go out.
 *
 * Squared, so most of the day stays close to full brightness and the dimming
 * is something you notice in the last hours rather than a page that is grey
 * all afternoon.
 */
export function duskProgress(remaining: number): number {
  if (remaining <= LIGHTS_OUT_SECONDS) return 1;
  const span = FULL_SECONDS - LIGHTS_OUT_SECONDS;
  const travelled = clamp01((FULL_SECONDS - remaining) / span);
  return travelled * travelled;
}

export function paletteFor(remaining: number): Palette {
  if (remaining <= LIGHTS_OUT_SECONDS) return DARK;

  const t = duskProgress(remaining);
  return {
    bg: mix(LIT.bg, DUSK.bg, t),
    card: mix(LIT.card, DUSK.card, t),
    ink: mix(LIT.ink, DUSK.ink, t),
    ash: mix(LIT.ash, DUSK.ash, t),
    faint: mix(LIT.faint, DUSK.faint, t),
    rule: mix(LIT.rule, DUSK.rule, t),
    blood: mix(LIT.blood, DUSK.blood, t),
    grain: LIT.grain + (DUSK.grain - LIT.grain) * t,
    dark: false,
  };
}

export function rgb([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

/** The palette as CSS custom properties, for an inline style attribute. */
export function paletteVars(palette: Palette): Record<string, string> {
  return {
    "--paper": rgb(palette.bg),
    "--card": rgb(palette.card),
    "--ink": rgb(palette.ink),
    "--ash": rgb(palette.ash),
    "--faint": rgb(palette.faint),
    "--rule": rgb(palette.rule),
    "--blood": rgb(palette.blood),
    "--grain": palette.grain.toFixed(3),
  };
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
