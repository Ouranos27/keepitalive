"use client";

import { useEffect, useRef } from "react";

/**
 * Works out which parts of the page the bulb still reaches.
 *
 * The page ground is a radial gradient centred on the bulb, and this measures
 * each section against it: inside the light it gets the lit palette, outside it
 * gets the dark one.
 *
 * Sections carry their own ground rather than letting the gradient show
 * through them. That is the part that keeps the whole thing readable. A
 * gradient has a soft edge, and text sitting on that edge would be dark ink on
 * a half-dark ground, which is exactly the unreadable middle the pool exists to
 * avoid. Painting the section means every block of text is on one room's
 * ground or the other's, and the soft edge is only ever visible in the gaps
 * between them, which is where a real edge of lamplight would fall anyway.
 *
 * Measurement runs when the light changes and when the layout does, never on
 * scroll: the pool is anchored to the page, not the viewport, so scrolling
 * cannot change what is lit.
 */
export function useLightPool(pool: number) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = ref.current;
    if (!page) return;

    const apply = () => {
      const pageBox = page.getBoundingClientRect();
      const bulb = page.querySelector<HTMLElement>(".bulb");

      // The light comes from the filament, so the pool is centred on it rather
      // than on the page.
      let centreX = pageBox.width / 2;
      let centreY = pageBox.height * 0.2;
      if (bulb) {
        const bulbBox = bulb.getBoundingClientRect();
        centreX = bulbBox.left + bulbBox.width / 2 - pageBox.left;
        centreY = bulbBox.top + bulbBox.height * 0.62 - pageBox.top;
      }
      page.style.setProperty("--pool-x", `${Math.round(centreX)}px`);
      page.style.setProperty("--pool-y", `${Math.round(centreY)}px`);

      const vmax = Math.max(window.innerWidth, window.innerHeight);
      const radius = pool * vmax;

      for (const zone of page.querySelectorAll<HTMLElement>("[data-zone]")) {
        const box = zone.getBoundingClientRect();
        const x = box.left + box.width / 2 - pageBox.left;
        const y = box.top + box.height / 2 - pageBox.top;
        const distance = Math.hypot(x - centreX, y - centreY);
        zone.dataset.room = distance <= radius ? "lit" : "dark";
      }
    };

    apply();

    // Layout changes move sections in and out of the light on their own.
    const observer = new ResizeObserver(apply);
    observer.observe(page);
    for (const zone of page.querySelectorAll("[data-zone]")) observer.observe(zone);

    return () => observer.disconnect();
  }, [pool]);

  return ref;
}
