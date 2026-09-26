import type { ReactNode } from "react";
import "./hub-animated-icon.css";

/** Decorative artwork only. Geometry conveys no live metric, forecast or agent status. */
const artwork = {
  mail: (
    <>
      <path d="M3 8h18v12H3Z" />
      <g className="hub-icon-letter">
        <path d="M7 8V5h10v3M9 7h6" />
      </g>
      <path className="hub-icon-flap" d="m3 8 9 7 9-7" />
      <path d="m3 20 6-6m12 6-6-6" />
    </>
  ),
  finance: (
    <>
      <path d="M3 21h18" />
      <path className="hub-icon-bar hub-icon-part-1" d="M5 18v-5" />
      <path className="hub-icon-bar hub-icon-part-2" d="M10 18V9" />
      <path className="hub-icon-bar hub-icon-part-3" d="M15 18V6" />
      <path className="hub-icon-bar hub-icon-part-4" d="M20 18V3" />
    </>
  ),
  automation: (
    <>
      <g className="hub-icon-links">
        <path pathLength="1" d="m10.5 6-5 9m8-9 5 9M8 18h8" />
      </g>
      <circle cx="12" cy="4" r="2.5" />
      <circle cx="5" cy="18" r="3" />
      <circle cx="19" cy="18" r="3" />
    </>
  ),
  heart: (
    <g className="hub-icon-heart">
      <path d="M12 21S2 14.5 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6.5-10 13-10 13Z" />
    </g>
  ),
  note: (
    <g className="hub-icon-note">
      <path d="M9 18V5l11-3v14M9 9l11-3" />
      <ellipse cx="6" cy="18" rx="3" ry="2.5" />
      <ellipse cx="17" cy="16" rx="3" ry="2.5" />
    </g>
  ),
  cloud: (
    <>
      <g className="hub-icon-weather-sun">
        <circle cx="8" cy="7" r="3" />
        <path d="M8 1v1M2 7H1m2-5 1 1m9-1-1 1M3 11l-1 1" />
      </g>
      <path d="M6 16a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.1A3.5 3.5 0 1 1 18 16H6Z" />
      <g className="hub-icon-rain">
        <path className="hub-icon-part-1" d="m8 19-.7 2" />
        <path className="hub-icon-part-2" d="m13 19-.7 2" />
        <path className="hub-icon-part-3" d="m18 19-.7 2" />
      </g>
    </>
  ),
  home: (
    <>
      <path d="m2 11 10-9 10 9M5 9v12h14V9M10 21v-6h4v6" />
      <path className="hub-icon-window" d="M10 9h4v3h-4Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 4v1m8 7h-1m-7 8v-1m-8-7h1" />
      <g className="hub-icon-hand">
        <path d="M12 12V7" />
      </g>
      <path d="m12 12 3 2" />
    </>
  ),
  grid: (
    <>
      <rect className="hub-icon-tile hub-icon-part-1" x="3" y="3" width="7" height="7" rx="1" />
      <rect className="hub-icon-tile hub-icon-part-2" x="14" y="3" width="7" height="7" rx="1" />
      <rect className="hub-icon-tile hub-icon-part-3" x="14" y="14" width="7" height="7" rx="1" />
      <rect className="hub-icon-tile hub-icon-part-4" x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 2v6m10-6v6M3 10h18M7 14h1m4 0h1m4 0h1m-11 4h1m4 0h1" />
      <rect className="hub-icon-date" x="16" y="16.5" width="2.5" height="2.5" rx=".4" />
    </>
  ),
  ideas: (
    <>
      <path d="M8 17c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8M8 17h8M9 20h6m-5 3h4" />
      <path className="hub-icon-filament" d="m9 10 3 3 3-3m-3 3v4" />
      <g className="hub-icon-bulb-rays">
        <path d="M1 8h1m20 0h1M3 2l1 1m16 0 1-1" />
      </g>
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <g className="hub-icon-meridian">
        <ellipse cx="12" cy="12" rx="4" ry="9" />
      </g>
      <path d="M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
    </>
  ),
  document: (
    <>
      <path d="M5 2h9l5 5v15H5V2Zm9 0v6h5" />
      <g className="hub-icon-written">
        <path pathLength="1" d="M8 12h8" />
        <path className="hub-icon-part-2" pathLength="1" d="M8 16h8" />
        <path className="hub-icon-part-3" pathLength="1" d="M8 19h5" />
      </g>
    </>
  ),
} satisfies Record<string, ReactNode>;

export type HubAnimatedIconKind = keyof typeof artwork;

export function isHubAnimatedIconKind(kind: string): kind is HubAnimatedIconKind {
  return Object.hasOwn(artwork, kind);
}

/** No hooks or side effects: callers may use a null result to select their existing static icon. */
export function HubAnimatedIcon({ kind }: { kind: string }) {
  if (!isHubAnimatedIconKind(kind)) return null;
  return (
    <svg
      className={`hub-animated-icon hub-animated-icon--${kind}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-hub-icon={kind}
    >
      {artwork[kind]}
    </svg>
  );
}
