"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The last light.
 *
 * A hanging bulb whose filament burns down with the clock. It loses colour
 * temperature the whole way, from white through amber to a dull red, dimming as
 * it goes and stuttering more often the closer it gets. At zero the filament is
 * cold and the glass keeps the shape of it.
 *
 * The caller shapes the curve (see LiveSite): most of the brightness sits in
 * the first half of the day so the visible collapse lands where the tension is.
 *
 * Raw three.js rather than a renderer wrapper: the scene is four objects and
 * this way the page carries no reconciler it does not use. The whole thing is
 * lazy-loaded (see LiveSite) so it never sits in front of the clock painting.
 *
 * Everything visible is driven by one number, `life`, from 1 down to 0.
 */

/** Filament colour at full life, mid burn, and the last moments. */
const HOT = new THREE.Color("#fff4e0");
const WARM = new THREE.Color("#ff9f45");
const DYING = new THREE.Color("#c0261a");
const COLD = new THREE.Color("#3c3835");

export function Bulb({ life, reduceMotion }: { life: number; reduceMotion: boolean }) {
  const mount = useRef<HTMLDivElement>(null);
  // The render loop reads these without re-running the effect that built the
  // scene. Rebuilding a WebGL context every second would be absurd.
  const target = useRef({ life, reduceMotion });
  target.current = { life, reduceMotion };

  useEffect(() => {
    const container = mount.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      // No WebGL. The page is fully usable without it, so leave the slot empty.
      return;
    }

    const size = () => ({
      width: container.clientWidth || 220,
      height: container.clientHeight || 260,
    });

    const { width, height } = size();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    // The whole bulb hangs off this, so a sway rotates the cord and the glass
    // together, the way a real one on a flex would.
    const pivot = new THREE.Group();
    pivot.position.y = 3.4;
    scene.add(pivot);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 3.2, 6),
      new THREE.MeshBasicMaterial({ color: 0x2a2724 }),
    );
    cord.position.y = -1.6;
    pivot.add(cord);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.36, 0.62, 24),
      new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 0.55, metalness: 0.7 }),
    );
    cap.position.y = -3.42;
    pivot.add(cap);

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      roughness: 0.08,
      metalness: 0,
      transmission: 0,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.92, 40, 32), glassMaterial);
    glass.position.y = -4.35;
    glass.scale.set(1, 1.12, 1);
    pivot.add(glass);

    // The filament: a coil drawn as a tube, which is the only part that has to
    // read clearly at 200 pixels tall.
    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const t = i / 120;
      const angle = t * Math.PI * 10;
      coil.push(new THREE.Vector3(Math.cos(angle) * 0.2, -0.34 + t * 0.66, Math.sin(angle) * 0.09));
    }
    const filamentMaterial = new THREE.MeshBasicMaterial({ color: HOT.clone() });
    const filament = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 140, 0.032, 6, false),
      filamentMaterial,
    );
    filament.position.y = -4.4;
    pivot.add(filament);

    const glow = new THREE.PointLight(0xffc987, 3.4, 9, 2);
    glow.position.set(0, -4.35, 0);
    pivot.add(glow);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));

    const colour = new THREE.Color();
    const clock = new THREE.Clock();
    let frame = 0;
    let flickerUntil = 0;
    let flickerDepth = 0;

    const render = () => {
      frame = requestAnimationFrame(render);
      const { life: value, reduceMotion: still } = target.current;
      const t = clock.getElapsedTime();

      // White to amber over the first half of the burn, amber to red over the
      // second, then out.
      if (value > 0.5) colour.copy(WARM).lerp(HOT, (value - 0.5) * 2);
      else if (value > 0) colour.copy(DYING).lerp(WARM, value * 2);
      else colour.copy(COLD);

      let brightness = value <= 0 ? 0 : 0.35 + value * 0.65;

      if (!still && value > 0) {
        // A dying filament stutters, and stutters more the closer it gets.
        const chance = (1 - value) * 0.05;
        if (t > flickerUntil && Math.random() < chance) {
          flickerUntil = t + 0.05 + Math.random() * 0.14;
          flickerDepth = 0.25 + Math.random() * 0.6;
        }
        if (t < flickerUntil) brightness *= 1 - flickerDepth;

        // A bulb on a cord is never perfectly still.
        pivot.rotation.z = Math.sin(t * 0.42) * 0.022;
      }

      filamentMaterial.color.copy(colour).multiplyScalar(Math.max(brightness, 0.06));
      glow.color.copy(colour);
      glow.intensity = brightness * 4.2;
      glassMaterial.opacity = 0.07 + value * 0.06;

      renderer.render(scene, camera);

      // Nothing moves once the filament is cold and nothing is flickering, so
      // stop drawing rather than burn a phone battery on a static image.
      if (still || value <= 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    render();

    const resize = () => {
      const next = size();
      camera.aspect = next.width / next.height;
      camera.updateProjectionMatrix();
      renderer.setSize(next.width, next.height, false);
      if (!frame) render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // A backgrounded tab should not be rendering a light bulb.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        render();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="bulb__scene" ref={mount} aria-hidden="true" />;
}

export default Bulb;
