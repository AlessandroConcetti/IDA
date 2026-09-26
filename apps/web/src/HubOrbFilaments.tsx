import { useId } from "react";
import "./hub-orb-filaments.css";

/** Optical detail within the shared IDA orb; no separate identity or activity state. */
export function HubOrbFilaments() {
  const id = `hub-orb-${useId().replaceAll(":", "")}`;
  const ribbon = `url(#${id}-ribbon)`;
  return (
    <svg className="hub-orb-filaments" viewBox="-20 -20 440 440" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-volume`} cx="48%" cy="48%" r="56%">
          <stop offset="0" stopColor="var(--orb-core, #06183b)" stopOpacity="0.02" />
          <stop offset="0.48" stopColor="var(--orb-core, #06183b)" stopOpacity="0.04" />
          <stop offset="0.72" stopColor="var(--orb-volume, #338bef)" stopOpacity="0.08" />
          <stop offset="0.88" stopColor="var(--orb-volume, #338bef)" stopOpacity="0.35" />
          <stop offset="0.955" stopColor="var(--orb-edge, #c1f5ff)" stopOpacity="0.56" />
          <stop offset="1" stopColor="var(--orb-volume, #338bef)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ribbon`} x1="32" y1="68" x2="330" y2="333" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--orb-edge, #c1f5ff)" stopOpacity="0.18" />
          <stop offset="0.22" stopColor="#ffffff" stopOpacity="0.94" />
          <stop offset="0.38" stopColor="var(--orb-edge, #c1f5ff)" stopOpacity="0.84" />
          <stop offset="0.56" stopColor="var(--orb-volume, #338bef)" stopOpacity="0.24" />
          <stop offset="0.79" stopColor="var(--orb-violet, #a9a6ff)" stopOpacity="0.92" />
          <stop offset="0.94" stopColor="#f4fdff" stopOpacity="0.92" />
          <stop offset="1" stopColor="var(--orb-edge, #c1f5ff)" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="58" y1="58" x2="275" y2="162" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.41" stopColor="#e0f7ff" stopOpacity="0.25" />
          <stop offset="0.65" stopColor="#fff" stopOpacity="0.49" />
          <stop offset="1" stopColor="#b5d4ff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-bloom`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
        <path
          id={`${id}-a`}
          d="M196 15C270 7 328 54 362 115C397 177 374 238 337 291C303 341 268 388 202 385C125 381 50 331 27 263C3 191 25 126 83 78C123 46 139 22 196 15Z"
        />
        <path
          id={`${id}-b`}
          d="M196 24C251 12 290 44 324 93C358 142 386 200 362 264C337 330 275 366 205 378C138 389 76 361 47 304C15 241 29 174 66 129C105 83 131 39 196 24Z"
        />
        <path
          id={`${id}-c`}
          d="M38 239C14 173 38 94 97 54C152 17 195 35 246 70C300 106 362 108 378 170C394 231 361 292 307 331C249 374 180 389 123 363C66 336 58 291 38 239Z"
        />
        <path
          id={`${id}-d`}
          d="M356 99C390 158 363 225 312 267C259 311 225 375 162 374C103 373 49 325 25 264C4 206 39 146 77 94C124 30 194 15 257 38C306 56 334 61 356 99Z"
        />
        <path
          id={`${id}-e`}
          d="M71 80C108 28 191 10 253 39C315 68 333 135 367 194C400 251 359 332 300 359C235 389 171 362 113 336C50 308 14 251 24 191C33 142 43 119 71 80Z"
        />
        <path
          id={`${id}-f`}
          d="M83 49C141 11 217 13 276 45C330 75 327 116 353 168C381 225 377 287 324 333C274 376 210 394 143 371C74 348 37 299 24 235C12 171 36 80 83 49Z"
        />
      </defs>
      <circle cx="200" cy="200" r="198" fill={`url(#${id}-volume)`} />
      <g className="hub-orb-filaments__current hub-orb-filaments__current--one" stroke={ribbon}>
        <g className="hub-orb-filaments__bloom" filter={`url(#${id}-bloom)`} strokeWidth="9" opacity="0.56">
          <use href={`#${id}-a`} />
          <use href={`#${id}-b`} />
        </g>
        <use href={`#${id}-a`} strokeWidth="2.2" />
        <use href={`#${id}-b`} strokeWidth="0.9" opacity="0.65" />
      </g>
      <g className="hub-orb-filaments__current hub-orb-filaments__current--two" stroke={ribbon}>
        <g className="hub-orb-filaments__bloom" filter={`url(#${id}-bloom)`} strokeWidth="6" opacity="0.4">
          <use href={`#${id}-c`} />
          <use href={`#${id}-d`} />
        </g>
        <use href={`#${id}-c`} strokeWidth="1.6" opacity="0.85" />
        <use href={`#${id}-d`} strokeWidth="0.65" opacity="0.54" />
      </g>
      <g className="hub-orb-filaments__current hub-orb-filaments__current--three" stroke={ribbon}>
        <g className="hub-orb-filaments__bloom" filter={`url(#${id}-bloom)`} strokeWidth="7" opacity="0.37">
          <use href={`#${id}-e`} />
        </g>
        <use href={`#${id}-e`} strokeWidth="1.2" opacity="0.82" />
        <use href={`#${id}-f`} strokeWidth="0.75" opacity="0.39" />
      </g>
      <path
        className="hub-orb-filaments__reflection"
        d="M53 136C79 69 140 32 203 36C248 38 281 63 301 90C258 63 223 65 183 72C129 82 89 102 53 136Z"
        fill={`url(#${id}-sheen)`}
      />
    </svg>
  );
}
