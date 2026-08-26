"use client";

import dynamic from "next/dynamic";

const Bulb = dynamic(() => import("./Bulb").then((m) => m.Bulb), { ssr: false });

/**
 * The bulb on the memorial, at zero.
 *
 * The site is named after this thing, so the page that outlives it should show
 * it cold rather than quietly drop it. `life` is 0 and `reduceMotion` is true,
 * which means the scene draws exactly one frame and then stops: no loop, no
 * sway, no guttering. There is nothing left to animate.
 */
export function DeadBulb() {
  return (
    <div className="bulb" style={{ "--life": "0" } as React.CSSProperties}>
      <Bulb life={0} reduceMotion />
    </div>
  );
}
