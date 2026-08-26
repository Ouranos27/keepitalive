/**
 * DotPattern, from the Magic UI registry.
 *
 *   npx shadcn@latest add "https://magicui.design/r/dot-pattern.json"
 *
 * Vendored and adapted, like hyper-text, because this project styles with plain
 * CSS. Two things changed:
 *
 *   1. The glow variant is gone, and with it the client boundary. The registry
 *      component measures its container and renders one <circle> per dot so it
 *      can animate them individually. Static dots need none of that: an SVG
 *      <pattern> tiles for free and this renders on the server with no
 *      JavaScript at all, which is the right price for a background texture.
 *   2. Colour and opacity come from CSS variables so the page can drive them
 *      as the clock degrades.
 *
 * Magic UI is MIT licensed.
 */
import { cn } from "@/lib/utils";

export function DotPattern({
  width = 22,
  height = 22,
  cr = 1,
  className,
}: {
  /** Horizontal spacing between dots. */
  width?: number;
  /** Vertical spacing between dots. */
  height?: number;
  /** Dot radius. */
  cr?: number;
  className?: string;
}) {
  const id = `dots-${width}x${height}`;

  return (
    <svg aria-hidden="true" className={cn("dots", className)}>
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
          <circle cx={cr} cy={cr} r={cr} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
