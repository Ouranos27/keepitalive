/**
 * Paper grain.
 *
 * One SVG turbulence filter, painted once into a fixed layer and multiplied
 * over the page. It replaces a dot grid, which is a template signature rather
 * than a material: this page is meant to read as a printed surface, and paper
 * has grain, not dots.
 *
 * Renders on the server with no JavaScript. It is fixed and pointer-events
 * none, so it is composited once and never repainted while the page scrolls.
 */
export function PaperGrain() {
  return (
    <svg className="grain" aria-hidden="true">
      <filter id="paper-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#paper-grain)" />
    </svg>
  );
}
