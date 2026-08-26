"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The last light.
 *
 * A hanging bulb whose filament burns down with the clock. It loses colour
 * temperature the whole way, from white through amber to a dull red, dimming as
 * it goes and guttering more the closer it gets. At zero the filament is cold
 * and the glass keeps the shape of it.
 *
 * The caller shapes the curve (see LiveSite): most of the brightness sits in
 * the first half of the day so the visible collapse lands where the tension is.
 *
 * Four decisions carry the whole look:
 *
 *   1. The envelope is a lathed A19 profile, not a sphere. A sphere on a stick
 *      reads as a diagram; the neck, shoulder and tip are what make it a bulb.
 *
 *   2. The glass is a fresnel shell rather than a translucent solid. Opacity
 *      over a light ground removes contrast instead of adding it, so a white
 *      sphere on white paper can only ever look like a grey ball. Real glass is
 *      close to invisible face-on and gathers at the silhouette: a faint warm
 *      tint across the body, a cool edge at the rim, one specular highlight.
 *
 *   3. The light inside it is a noise-driven glow, after the technique in
 *      prisoner849's "The Lonely Candle": rather than lighting a mesh and
 *      hoping, the flame is a shader with procedural noise and a gradient from
 *      a hot core out to transparent. Here it makes the filament breathe, and
 *      the guttering falls out of the noise instead of a random number.
 *
 *   4. Blending is normal, never additive. On a light page you cannot make
 *      something look lit by adding brightness, because the paper is already at
 *      the top of the range. The glow reads as light by tinting the paper warm.
 *
 * Everything visible is driven by one number, `life`, from 1 down to 0.
 */

/** Filament colour at full life, mid burn, and the last moments. */
const HOT = new THREE.Color("#fff4e0");
const WARM = new THREE.Color("#ff9f45");
const DYING = new THREE.Color("#c0261a");
const COLD = new THREE.Color("#3c3835");
/** What the glass tints toward once there is no warmth left in it. */
const PALE = new THREE.Color("#cfc9c0");

/**
 * The silhouette of an A19, as radius against height from the socket join down
 * to the tip. Sampled through a spline so the shoulder is a curve rather than
 * a run of flat facets.
 */
const PROFILE: Array<[number, number]> = [
  [0.2, 0.0],
  [0.24, -0.12],
  [0.32, -0.26],
  [0.48, -0.42],
  [0.65, -0.58],
  [0.78, -0.76],
  [0.86, -0.98],
  [0.88, -1.24],
  [0.85, -1.5],
  [0.76, -1.74],
  [0.62, -1.93],
  [0.42, -2.07],
  [0.2, -2.16],
  [0.0, -2.2],
];

function bulbProfile(): THREE.Vector2[] {
  const spline = new THREE.CatmullRomCurve3(
    PROFILE.map(([r, y]) => new THREE.Vector3(r, y, 0)),
  );
  return spline.getPoints(90).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
}

/** Compact value noise. Enough for a flame, and cheaper than Perlin. */
const NOISE = `
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

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
      width: container.clientWidth || 200,
      height: container.clientHeight || 240,
    });

    const { width, height } = size();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(0, 0, 9.4);

    // The whole bulb hangs off this, so a sway rotates the cord, the socket and
    // the glass together, the way a real one on a flex would.
    const pivot = new THREE.Group();
    // The object runs from the cord at local 0 to the glass tip at -4.47, so
    // the pivot sits at half that to centre it in frame.
    pivot.position.y = 2.24;
    scene.add(pivot);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1.8, 6),
      new THREE.MeshBasicMaterial({ color: 0x36322e }),
    );
    cord.position.y = -0.9;
    pivot.add(cord);

    // An E26 socket, roughly: a collar, the thread, and the shoulder that meets
    // the glass. A single dark cylinder reads as a box on a string.
    const brass = new THREE.MeshStandardMaterial({
      color: 0x9c907c,
      roughness: 0.42,
      metalness: 0.72,
    });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.16, 20), brass);
    collar.position.y = -1.88;
    pivot.add(collar);

    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.215, 0.4, 22), brass);
    thread.position.y = -2.12;
    pivot.add(thread);

    // --- the envelope ------------------------------------------------------

    const glassMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uCore: { value: new THREE.Color("#ffd9a8") },
        uRim: { value: new THREE.Color("#6f6a63") },
        uLit: { value: 1 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uCore;
        uniform vec3 uRim;
        uniform float uLit;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec3 n = normalize(vNormal);
          float facing = abs(dot(n, normalize(vView)));
          float rim = pow(1.0 - facing, 2.3);

          // One highlight, up and to the left, where a window would be.
          vec3 key = normalize(vec3(-0.55, 0.72, 0.42));
          float spec = pow(max(dot(n, key), 0.0), 24.0);

          vec3 colour = mix(uCore, uRim, rim);
          // Barely there across the body, gathering at the edge. The highlight
          // lifts the glass toward white rather than adding brightness to it.
          colour = mix(colour, vec3(1.0), spec * 0.85);
          float alpha = 0.018 + rim * 0.34 + spec * 0.32;

          gl_FragColor = vec4(colour, alpha * (0.55 + uLit * 0.45));
        }
      `,
    });
    const glass = new THREE.Mesh(new THREE.LatheGeometry(bulbProfile(), 64), glassMaterial);
    glass.position.y = -2.27;
    glass.renderOrder = 3;
    pivot.add(glass);

    // --- the light inside it -----------------------------------------------

    const glowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColour: { value: new THREE.Color("#ffb066") },
        uTime: { value: 0 },
        uLit: { value: 1 },
        uWobble: { value: 1 },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        ${NOISE}
        uniform vec3 uColour;
        uniform float uTime;
        uniform float uLit;
        uniform float uWobble;
        varying vec3 vPos;
        void main() {
          float d = length(vPos);
          // Hot in the middle, gone by the edge.
          float core = 1.0 - smoothstep(0.0, 1.0, d);

          // The noise is what makes it breathe. Sampling in object space with
          // time on the third axis gives a slow roll rather than a flat pulse.
          float n = noise(vPos * 2.6 + vec3(0.0, uTime * 0.9, uTime * 0.35));
          float wobble = mix(1.0, 0.55 + n * 0.75, uWobble);

          float alpha = pow(core, 1.25) * 0.95 * uLit * wobble;
          gl_FragColor = vec4(uColour, alpha);
        }
      `,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.52, 32, 24), glowMaterial);
    glow.position.y = -3.5;
    glow.renderOrder = 2;
    pivot.add(glow);

    // --- the filament ------------------------------------------------------

    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const t = i / 120;
      const angle = t * Math.PI * 9;
      coil.push(new THREE.Vector3(Math.cos(angle) * 0.185, -0.3 + t * 0.58, Math.sin(angle) * 0.1));
    }
    const filamentMaterial = new THREE.MeshBasicMaterial({ color: HOT.clone() });
    const filament = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 200, 0.026, 6, false),
      filamentMaterial,
    );
    filament.position.y = -3.5;
    filament.renderOrder = 1;
    pivot.add(filament);

    // The two stem wires the coil is strung between.
    const stemMaterial = new THREE.MeshBasicMaterial({ color: 0x8a8177 });
    for (const x of [-0.185, 0.185]) {
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5),
        stemMaterial,
      );
      wire.position.set(x, -3.5, 0);
      wire.renderOrder = 1;
      pivot.add(wire);
    }

    const lamp = new THREE.PointLight(0xffc987, 3.4, 9, 2);
    lamp.position.set(0, -3.5, 0);
    pivot.add(lamp);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    const colour = new THREE.Color();
    const clock = new THREE.Clock();
    let frame = 0;

    const render = () => {
      frame = requestAnimationFrame(render);
      const { life: value, reduceMotion: still } = target.current;
      const t = clock.getElapsedTime();

      // White to amber over the first half of the burn, amber to red over the
      // second, then out.
      if (value > 0.5) colour.copy(WARM).lerp(HOT, (value - 0.5) * 2);
      else if (value > 0) colour.copy(DYING).lerp(WARM, value * 2);
      else colour.copy(COLD);

      const brightness = value <= 0 ? 0 : 0.35 + value * 0.65;

      filamentMaterial.color.copy(colour).multiplyScalar(Math.max(brightness, 0.06));
      lamp.color.copy(colour);
      lamp.intensity = brightness * 4.2;

      glowMaterial.uniforms.uTime.value = t;
      glowMaterial.uniforms.uLit.value = brightness;
      // A healthy filament is steady. A dying one is mostly noise.
      glowMaterial.uniforms.uWobble.value = still ? 0 : 0.2 + (1 - value) * 0.8;
      (glowMaterial.uniforms.uColour.value as THREE.Color).copy(colour);

      // The glass takes its warmth from whatever the filament is doing.
      glassMaterial.uniforms.uLit.value = brightness;
      (glassMaterial.uniforms.uCore.value as THREE.Color)
        .copy(colour)
        .lerp(PALE, 1 - Math.min(brightness, 1) * 0.75);

      // A bulb on a cord is never perfectly still.
      if (!still) pivot.rotation.z = Math.sin(t * 0.42) * 0.02;

      renderer.render(scene, camera);

      // Nothing moves once the filament is cold and nothing is guttering, so
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
