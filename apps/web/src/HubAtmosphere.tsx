import { useEffect, useRef, useState } from "react";
import type { MotionProfile } from "./motion";
import { useEnvironmentMotion } from "./useEnvironmentMotion";
import type { HomeTheme } from "./worlds";
import "./hub-atmosphere.css";

const hubMotionProfile: Readonly<MotionProfile> = {
  intensity: 1,
  speed: 0.7,
  particles: 4,
  parallaxPx: 0,
  ambientLight: 0.23,
  depthPx: 18,
  glassBlurPx: 14,
  microMovementSeconds: 22,
  transitionMs: 220,
};

// Stable positions make the scene reproducible and avoid hydration-time randomness.
const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const stars = Array.from({ length: 82 }, (_, index) => ({
  x: 0.19 + noise(index + 11) * 0.62,
  y: 0.015 + noise(index + 183) * 0.17,
  size: 0.75 + noise(index + 91) * 1.65,
  phase: noise(index + 302) * Math.PI * 2,
}));

type FoliageRegion = {
  box: readonly [number, number, number, number];
  outline: readonly (readonly [number, number])[];
  pivot: readonly [number, number];
};

// These silhouettes follow foliage at the frame edges, away from the pillars and floor.
const foliageRegions: Record<"classic" | "scifi", readonly FoliageRegion[]> = {
  classic: [
    {
      box: [0, 0, 0.043, 0.14],
      outline: [
        [0, 0],
        [1, 0],
        [0.87, 0.22],
        [0.52, 0.36],
        [0.7, 0.63],
        [0.3, 1],
        [0, 1],
      ],
      pivot: [0, 0.9],
    },
    {
      box: [0.927, 0, 0.073, 0.148],
      outline: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0.65, 0.9],
        [0.51, 0.54],
        [0.13, 0.24],
      ],
      pivot: [1, 0.86],
    },
    {
      box: [0, 0.185, 0.048, 0.195],
      outline: [
        [0, 0],
        [0.44, 0.12],
        [0.55, 0.33],
        [1, 0.56],
        [0.75, 0.84],
        [0.2, 1],
        [0, 1],
      ],
      pivot: [0.06, 1],
    },
    {
      box: [0.974, 0.184, 0.026, 0.182],
      outline: [
        [0.6, 0],
        [1, 0],
        [1, 1],
        [0.15, 0.86],
        [0, 0.63],
        [0.31, 0.35],
      ],
      pivot: [1, 1],
    },
  ],
  scifi: [
    {
      box: [0, 0, 0.076, 0.132],
      outline: [
        [0, 0],
        [1, 0],
        [0.89, 0.17],
        [0.57, 0.29],
        [0.42, 0.51],
        [0.27, 0.68],
        [0.06, 1],
        [0, 1],
      ],
      pivot: [0, 0.92],
    },
    {
      box: [0.924, 0, 0.076, 0.131],
      outline: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0.71, 0.81],
        [0.64, 0.5],
        [0.22, 0.26],
      ],
      pivot: [1, 0.92],
    },
    {
      box: [0, 0.14, 0.046, 0.204],
      outline: [
        [0, 0],
        [0.39, 0.09],
        [0.83, 0.31],
        [1, 0.5],
        [0.62, 0.76],
        [0.23, 1],
        [0, 1],
      ],
      pivot: [0, 1],
    },
    {
      box: [0.947, 0.145, 0.053, 0.218],
      outline: [
        [0.75, 0],
        [1, 0],
        [1, 1],
        [0.41, 0.95],
        [0.36, 0.66],
        [0, 0.51],
        [0.34, 0.21],
      ],
      pivot: [1, 1],
    },
  ],
};

function prepareFoliage(photo: HTMLImageElement, classic: boolean, width: number, height: number) {
  if (!photo.complete || !photo.naturalWidth) return [];
  return foliageRegions[classic ? "classic" : "scifi"].flatMap((region) => {
    const [x, y, w, h] = region.box;
    const patch = document.createElement("canvas");
    patch.width = Math.ceil(w * width);
    patch.height = Math.ceil(h * height);
    const context = patch.getContext("2d");
    const mask = document.createElement("canvas");
    mask.width = patch.width;
    mask.height = patch.height;
    const maskContext = mask.getContext("2d");
    if (!context || !maskContext) return [];
    context.drawImage(
      photo,
      x * photo.naturalWidth,
      y * photo.naturalHeight,
      w * photo.naturalWidth,
      h * photo.naturalHeight,
      0,
      0,
      patch.width,
      patch.height,
    );
    maskContext.filter = "blur(2px)";
    maskContext.beginPath();
    for (const [index, [px, py]] of region.outline.entries()) {
      if (index === 0) maskContext.moveTo(px * patch.width, py * patch.height);
      else maskContext.lineTo(px * patch.width, py * patch.height);
    }
    maskContext.closePath();
    maskContext.fill();
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
    return [{ patch, x: x * width, y: y * height, pivot: region.pivot }];
  });
}
const classicLights = [
  [0.11, 0.478, 0.074, 0.027],
  [0.213, 0.5, 0.044, 0.023],
  [0.316, 0.476, 0.054, 0.038],
  [0.665, 0.473, 0.044, 0.019],
  [0.833, 0.479, 0.061, 0.035],
  [0.926, 0.579, 0.073, 0.026],
  [0.105, 0.665, 0.075, 0.014],
  [0.33, 0.678, 0.12, 0.018],
  [0.671, 0.579, 0.041, 0.113],
  [0.483, 0.811, 0.12, 0.018],
  [0.851, 0.792, 0.086, 0.012],
  [0.18, 0.873, 0.092, 0.016],
] as const;
const scifiLights = [
  [0.067, 0.188, 0.023, 0.049],
  [0.063, 0.264, 0.028, 0.053],
  [0.112, 0.414, 0.035, 0.039],
  [0.212, 0.521, 0.04, 0.03],
  [0.318, 0.487, 0.036, 0.026],
  [0.596, 0.498, 0.034, 0.023],
  [0.819, 0.487, 0.036, 0.043],
  [0.854, 0.515, 0.024, 0.031],
  [0.922, 0.188, 0.023, 0.049],
  [0.925, 0.264, 0.028, 0.053],
  [0.156, 0.891, 0.065, 0.017],
  [0.741, 0.89, 0.068, 0.019],
] as const;

function glow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: string,
  alpha: number,
) {
  context.save();
  context.translate(x, y);
  context.scale(radiusX, radiusY);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(${color},${alpha})`);
  gradient.addColorStop(0.24, `rgba(${color},${alpha * 0.54})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  context.fillStyle = gradient;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

function drawWater(context: CanvasRenderingContext2D, time: number, width: number, height: number, low: boolean) {
  // Glints are confined to water gaps beneath the skyline. The photo, coast and buildings never warp.
  const bays = [
    { x: 0.349, y: 0.379, width: 0.406, height: 0.052 },
    { x: 0.719, y: 0.283, width: 0.116, height: 0.045 },
  ];
  for (const [bayIndex, bay] of bays.entries()) {
    const count = low ? 40 : 88;
    for (let index = 0; index < count; index++) {
      const seed = index + bayIndex * 130;
      const depth = noise(seed + 605);
      const phase = noise(seed + 780) * Math.PI * 2;
      const pulse = Math.max(0, Math.sin(time * (0.64 + noise(seed + 244) * 0.32) + phase));
      const length = (0.0014 + depth * 0.0052) * width * (0.45 + pulse * 0.75);
      const edge = Math.sin(Math.PI * noise(seed + 442));
      const x = (bay.x + noise(seed + 442) * bay.width + Math.sin(time * 0.21 + phase) * 0.0018) * width;
      const y = (bay.y + depth * bay.height + Math.sin(time * 0.72 + phase) * 0.0007 * depth) * height;
      context.beginPath();
      context.moveTo(x - length / 2, y);
      context.quadraticCurveTo(x, y - (0.16 + depth * 0.42), x + length / 2, y);
      context.strokeStyle = `rgba(255,242,206,${(0.055 + pulse * 0.38) * edge})`;
      context.lineWidth = 0.4 + depth * 0.65;
      context.stroke();
    }
  }
}

function drawStars(context: CanvasRenderingContext2D, time: number, width: number, height: number, low: boolean) {
  for (const [index, star] of stars.entries()) {
    if (low && index % 2 === 0) continue;
    const shimmer = 0.12 + (0.5 + 0.5 * Math.sin(time * (0.58 + noise(index) * 0.88) + star.phase)) ** 2 * 0.88;
    const x = star.x * width;
    const y = star.y * height;
    context.fillStyle = `rgba(194,226,255,${shimmer})`;
    context.beginPath();
    context.arc(x, y, star.size, 0, Math.PI * 2);
    context.fill();
    if (index % 7 === 0) {
      glow(context, x, y, 19, 19, "113,190,255", shimmer * 0.66);
      context.strokeStyle = `rgba(222,244,255,${shimmer * 0.79})`;
      context.lineWidth = 0.8;
      context.beginPath();
      context.moveTo(x - 7.5, y);
      context.lineTo(x + 7.5, y);
      context.moveTo(x, y - 7.5);
      context.lineTo(x, y + 7.5);
      context.stroke();
    }
  }
  // One short, dim meteor at a time; long quiet intervals keep the dashboard readable.
  const cycle = time % 18;
  if (cycle < 1.6 && time > 1) {
    const progress = cycle / 1.6;
    const alternate = Math.floor(time / 18) % 2;
    const x = (0.38 + alternate * 0.17 + progress * 0.17) * width;
    const y = (0.045 + progress * 0.075) * height;
    const length = 55 + Math.sin(progress * Math.PI) * 55;
    const alpha = Math.sin(progress * Math.PI) * 0.78;
    const trail = context.createLinearGradient(x - length, y - length * 0.26, x, y);
    trail.addColorStop(0, "rgba(120,188,255,0)");
    trail.addColorStop(1, `rgba(227,246,255,${alpha})`);
    context.strokeStyle = trail;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(x - length, y - length * 0.26);
    context.lineTo(x, y);
    context.stroke();
    glow(context, x, y, 5, 5, "194,230,255", alpha * 0.75);
  }
}

/** Decorative, local scene only. Shared visual preferences pause every canvas operation. */
export function HubAtmosphere({ theme, paused = false }: { theme: HomeTheme; paused?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const foliage = useRef<HTMLCanvasElement>(null);
  const photograph = useRef<HTMLImageElement>(null);
  const clock = useRef(6);
  const [aspect, setAspect] = useState(16 / 9);
  const [loadedAsset, setLoadedAsset] = useState("");
  const motion = useEnvironmentMotion(surface, hubMotionProfile, paused);
  const classic = theme === "classic";
  const running = motion.resolved.level !== "OFF" && motion.attributes["data-motion-ambient-paused"] === "false";
  const low = motion.resolved.level === "LOW";

  useEffect(() => {
    const element = canvas.current;
    if (!element || !running) return;
    const context = element.getContext("2d", { alpha: true });
    if (!context) return;
    const foliageCanvas = foliage.current;
    const foliageContext = foliageCanvas?.getContext("2d", { alpha: true });
    const width = 1600;
    const height = width / aspect;
    const patches = loadedAsset && photograph.current ? prepareFoliage(photograph.current, classic, width, height) : [];
    let frame = 0;
    let disposed = false;
    let last = 0;
    let cssWidth = 1;
    let cssHeight = 1;
    let resolution = 1;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      // TV/4K remains inexpensive; optics do not need text-resolution rendering.
      resolution = Math.min(
        window.devicePixelRatio || 1,
        1.25,
        1600 / cssWidth,
        Math.sqrt(1600000 / (cssWidth * cssHeight)),
      );
      element.width = Math.max(1, Math.round(cssWidth * resolution));
      element.height = Math.max(1, Math.round(cssHeight * resolution));
      if (foliageCanvas) {
        foliageCanvas.width = element.width;
        foliageCanvas.height = element.height;
      }
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    const draw = (timestamp: number) => {
      if (disposed || !running || document.hidden) return;
      frame = requestAnimationFrame(draw);
      if (last && timestamp - last < 1000 / (low ? 18 : 30)) return;
      const delta = last ? Math.min(timestamp - last, 100) / 1000 : 0;
      clock.current += delta;
      last = timestamp;
      const time = clock.current;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, element.width, element.height);
      const fit = Math.max(cssWidth / width, cssHeight / height);
      context.setTransform(
        fit * resolution,
        0,
        0,
        fit * resolution,
        ((cssWidth - width * fit) / 2) * resolution,
        ((cssHeight - height * fit) / 2) * resolution,
      );
      if (foliageContext && foliageCanvas) {
        foliageContext.setTransform(1, 0, 0, 1, 0, 0);
        foliageContext.clearRect(0, 0, foliageCanvas.width, foliageCanvas.height);
        foliageContext.setTransform(context.getTransform());
        for (const [index, item] of patches.entries()) {
          const wind = Math.sin(time * (0.76 + index * 0.13) + index * 1.8);
          const amplitude = low ? 0.65 : 1;
          const anchorX = item.pivot[0] * item.patch.width;
          const anchorY = item.pivot[1] * item.patch.height;
          foliageContext.save();
          foliageContext.translate(
            item.x + anchorX + wind * 2.2 * amplitude,
            item.y + anchorY + Math.sin(time * 0.61 + index) * 0.85 * amplitude,
          );
          foliageContext.rotate(wind * 0.031 * amplitude);
          foliageContext.drawImage(item.patch, -anchorX, -anchorY);
          foliageContext.restore();
        }
      }
      context.globalCompositeOperation = "screen";
      const lights = classic ? classicLights : scifiLights;
      for (const [index, light] of lights.entries()) {
        const breath = 0.16 + 0.84 * Math.sin(time * (0.53 + index * 0.024) + index * 1.8) ** 2;
        glow(
          context,
          light[0] * width,
          light[1] * height,
          light[2] * width * 1.2,
          light[3] * height * 1.16,
          "255,208,133",
          breath * (classic ? 0.63 : 0.75),
        );
      }
      if (!classic) {
        for (let index = 0; index < 4; index++) {
          glow(
            context,
            (0.2 + index * 0.18) * width,
            (0.253 - index * 0.018) * height,
            width * 0.18,
            height * 0.008,
            "84,175,255",
            0.07 + Math.sin(time * 0.58 + index) ** 2 * 0.48,
          );
        }
        glow(
          context,
          width * 0.5,
          height * 0.88,
          width * 0.055,
          height * 0.1,
          "67,166,255",
          0.04 + Math.sin(time * 0.52) ** 2 * 0.34,
        );
      }
      const sunrise = classic ? [0.67, 0.202, 0.14, 0.17] : [0.713, 0.179, 0.095, 0.095];
      glow(
        context,
        (sunrise[0] ?? 0) * width,
        (sunrise[1] ?? 0) * height,
        (sunrise[2] ?? 0) * width,
        (sunrise[3] ?? 0) * height,
        "255,216,172",
        0.08 + Math.sin(time * 0.39) ** 2 * 0.38,
      );
      if (classic) drawWater(context, time, width, height, low);
      else drawStars(context, time, width, height, low);
      const particles = low ? 12 : 26;
      for (let index = 0; index < particles; index++) {
        const phase = noise(index + 812) * Math.PI * 2;
        const x = (0.08 + noise(index + 955) * 0.84 + Math.sin(time * 0.055 + phase) * 0.007) * width;
        const y = (0.28 + ((noise(index + 479) + time * 0.003) % 0.66)) * height;
        const radius = 0.45 + noise(index + 188) * 1.3;
        const alpha = (0.5 + Math.sin(time * 0.6 + phase) * 0.5) * (classic ? 0.42 : 0.29);
        glow(context, x, y, radius * 3.5, radius * 3.5, classic ? "255,231,189" : "132,211,255", alpha);
      }
      context.globalCompositeOperation = "source-over";
    };
    if (running) frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [aspect, classic, loadedAsset, low, running]);

  return (
    <div
      ref={surface}
      className="hub-atmosphere"
      data-hub-scene={classic ? "classic" : "scifi"}
      aria-hidden="true"
      {...motion.attributes}
    >
      <img
        ref={photograph}
        className="hub-atmosphere__image"
        src={`/design/hub-20260926/hub-${classic ? "classic" : "scifi"}.png`}
        alt=""
        draggable={false}
        fetchPriority="high"
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight);
          setLoadedAsset(image.currentSrc);
        }}
      />
      <canvas ref={foliage} className="hub-atmosphere__foliage" />
      <canvas ref={canvas} className="hub-atmosphere__light" />
      <span className="hub-atmosphere__finish" />
    </div>
  );
}
