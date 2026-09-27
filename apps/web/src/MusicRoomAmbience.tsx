import { type CSSProperties, useId, useRef } from "react";
import { fabriqueMotionProfile } from "./motion";
import { useEnvironmentMotion } from "./useEnvironmentMotion";
import "./music-room-ambience.css";

export const musicRoomColors = [
  { name: "Ambre", color: "#ffbc70" },
  { name: "Glacier", color: "#60d8ff" },
  { name: "Violet", color: "#b398ff" },
  { name: "Rose", color: "#ff96cc" },
  { name: "Menthe", color: "#80ebbd" },
] as const;
export type MusicRoomLighting = { color: string; intensity: number };
export const initialMusicRoomLighting: MusicRoomLighting = { color: "#ffbc70", intensity: 65 };

/** Decorative SVG is registered to the existing 1536 × 1024 room image with cover cropping.
 * No audio, sensor, smart-home action, provider, persistence or business-state change. */
export function MusicRoomAmbience({ paused, lighting }: { paused: boolean; lighting: MusicRoomLighting }) {
  const surface = useRef<HTMLDivElement>(null);
  const motion = useEnvironmentMotion(surface, fabriqueMotionProfile, paused);
  const id = useId();
  return (
    <div ref={surface} className="music-room-ambience" aria-hidden="true" {...motion.attributes}>
      <svg viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-hearth`}>
            <stop stopColor="#ffb055" stopOpacity=".75" />
            <stop offset="1" stopColor="#ff962b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-flame`} x1="0" x2="0" y1="1" y2="0">
            <stop stopColor="#fff5ba" />
            <stop offset=".3" stopColor="#ffe29b" />
            <stop offset="1" stopColor="#ff8128" stopOpacity=".7" />
          </linearGradient>
          <radialGradient id={`${id}-tint`}>
            <stop stopColor="currentColor" stopOpacity=".45" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="music-room-ambience__fire">
          <ellipse
            className="music-room-ambience__hearth-glow"
            cx="332"
            cy="562"
            rx="67"
            ry="37"
            fill={`url(#${id}-hearth)`}
          />
          {[303, 313, 323, 334, 344, 356, 366].map((x, index) => (
            <path
              key={x}
              className="music-room-ambience__flame"
              style={
                {
                  "--flame-delay": `${index * -0.53}s`,
                  "--flame-speed": `${2.2 + (index % 3) * 0.6}s`,
                } as CSSProperties
              }
              d={`M${x - 4} 568 Q${x - 6} 561 ${x} ${544 + (index % 3) * 4} Q${x - 1} 556 ${x + 3} 560 Q${x + 7} 565 ${x + 4} 568Z`}
              fill={`url(#${id}-flame)`}
            />
          ))}
          <path className="music-room-ambience__embers" d="M299 569H373" fill="none" stroke="#ffe3a6" strokeWidth="2" />
        </g>
        <g
          className="music-room-ambience__neons"
          style={{ color: lighting.color, opacity: Math.max(0, Math.min(100, lighting.intensity)) / 100 }}
        >
          <g className="music-room-ambience__wash" fill={`url(#${id}-tint)`}>
            <ellipse cx="778" cy="70" rx="420" ry="155" />
            <ellipse cx="759" cy="769" rx="531" ry="91" />
            <ellipse cx="246" cy="688" rx="193" ry="62" />
          </g>
          <g className="music-room-ambience__trim" fill="none" stroke="currentColor" strokeLinecap="round">
            <path d="M456 0C480 95 965 93 1014 0" />
            <path d="M13 730L293 681M1253 682L1381 691M1390 799L1536 839" />
            <path d="M0 989C166 1047 1028 1084 1115 935" />
            <path d="M371 606L646 612M984 610L1236 619" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function MusicRoomControls({
  lighting,
  onChange,
}: {
  lighting: MusicRoomLighting;
  onChange: (value: MusicRoomLighting) => void;
}) {
  return (
    <details className="music-room-controls">
      <summary>✧ Ambiance du studio</summary>
      <div className="music-room-controls__panel">
        <fieldset>
          <legend>Couleur des néons</legend>
          <div className="music-room-controls__swatches">
            {musicRoomColors.map(({ name, color }) => (
              <button
                key={name}
                type="button"
                aria-label={`Néons ${name.toLocaleLowerCase("fr")}`}
                aria-pressed={lighting.color === color}
                onClick={() => onChange({ ...lighting, color })}
                style={{ "--swatch": color } as CSSProperties}
              >
                <span aria-hidden="true" />
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="music-room-controls__intensity">
          Intensité <output>{lighting.intensity} %</output>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={lighting.intensity}
            aria-label="Intensité des néons"
            onChange={(event) => onChange({ ...lighting, intensity: Number(event.target.value) })}
          />
        </label>
        <p>Décor du studio uniquement. Aucune lumière de l’appartement n’est commandée.</p>
      </div>
    </details>
  );
}
