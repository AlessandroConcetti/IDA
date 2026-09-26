import type { ReactNode } from "react";
import "./hub-widget-atmosphere.css";

export type HubWeatherAtmosphere = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "neutral";

/** Only observed WMO codes select weather. Missing or invalid readings stay neutral. */
export function classifyHubWeather(code?: number | null): HubWeatherAtmosphere {
  if (code === 0 || code === 1) return "sun";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code !== undefined && code !== null && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "rain";
  if (code !== undefined && code !== null && [71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return "neutral";
}

function WeatherAtmosphere({ weather }: { weather: HubWeatherAtmosphere }) {
  if (weather === "neutral") return <span className="hub-widget-atmosphere__neutral" />;
  if (weather === "sun") {
    return (
      <>
        <span className="hub-widget-atmosphere__sun" />
        <span className="hub-widget-atmosphere__rays" />
      </>
    );
  }
  if (weather === "fog" || weather === "cloud") {
    return (
      <>
        <span className="hub-widget-atmosphere__cloud" />
        <span className="hub-widget-atmosphere__cloud hub-widget-atmosphere__cloud--second" />
      </>
    );
  }
  return (
    <>
      <span className="hub-widget-atmosphere__cloud" />
      <svg viewBox="0 0 360 180" preserveAspectRatio="none" focusable="false" aria-hidden="true">
        {[28, 64, 111, 163, 205, 248, 295, 329].map((x, index) => (
          <g className={`hub-widget-atmosphere__fall hub-widget-atmosphere__fall--${index % 4}`} key={x}>
            {weather === "snow" ? (
              <path d={`M${x} ${12 + (index % 3) * 21}v5m-2.5-2.5h5`} />
            ) : (
              <path d={`M${x} ${8 + (index % 3) * 26}l-3 13`} />
            )}
          </g>
        ))}
      </svg>
      {weather === "storm" ? <span className="hub-widget-atmosphere__storm" /> : null}
    </>
  );
}

const illustrations: Record<string, ReactNode> = {
  agenda: (
    <>
      <path className="hub-widget-atmosphere__rule" d="M315 19V166M307 34h16m-16 28h16m-16 28h16m-16 28h16m-16 28h16" />
      <path className="hub-widget-atmosphere__travel" d="M315 24v23" />
    </>
  ),
  house: (
    <>
      <path d="M236 169V61l38-29 41 29v108M238 99h77m-40-64v134" />
      <path className="hub-widget-atmosphere__warm-window" d="M281 74h24v20h-24z" />
    </>
  ),
  messages: (
    <>
      <path
        className="hub-widget-atmosphere__paper"
        d="M243 30h74v122h-74zM253 47h50m-50 11h34m-34 15h50m-50 11h45m-45 15h50m-50 11h29m-29 15h50m-50 11h39"
      />
      <path className="hub-widget-atmosphere__paper-back" d="M234 38h-5v123h76v-5" />
    </>
  ),
  finance: (
    <>
      <path
        className="hub-widget-atmosphere__ledger"
        d="M210 25v138m49-138v138m49-138v138M200 41h139m-139 25h139m-139 25h139m-139 25h139m-139 25h139"
      />
      <path className="hub-widget-atmosphere__travel" d="M210 135h98" />
    </>
  ),
  care: (
    <>
      <path className="hub-widget-atmosphere__care-line" d="M192 175c-9-47 58-57 75-91s34-42 88-36" />
      <path
        className="hub-widget-atmosphere__care-line hub-widget-atmosphere__care-line--second"
        d="M223 180c-12-40 54-57 64-96s39-30 73-37"
      />
    </>
  ),
  music: (
    <>
      <g className="hub-widget-atmosphere__grooves">
        <ellipse cx="292" cy="118" rx="58" ry="41" />
        <ellipse cx="292" cy="118" rx="46" ry="32" />
        <ellipse cx="292" cy="118" rx="33" ry="23" />
        <ellipse cx="292" cy="118" rx="19" ry="13" />
      </g>
      <path className="hub-widget-atmosphere__needle" d="m255 86 12 9" />
    </>
  ),
  agents: (
    <>
      <path
        className="hub-widget-atmosphere__connections"
        d="m225 132 27-59 42 18 35-48M225 132l72 13-3-54 37 30m-79-48 45 72 34-24"
      />
      <g className="hub-widget-atmosphere__nodes">
        <circle cx="225" cy="132" r="3" />
        <circle cx="252" cy="73" r="3" />
        <circle cx="294" cy="91" r="3" />
        <circle cx="329" cy="43" r="3" />
        <circle cx="297" cy="145" r="3" />
        <circle cx="331" cy="121" r="3" />
      </g>
    </>
  ),
  activity: (
    <>
      <path
        className="hub-widget-atmosphere__archive"
        d="M204 49h128v100H204zM204 75h128m-128 25h128m-128 25h128M220 62h6m-6 25h6m-6 25h6m-6 25h6M237 62h78m-78 25h78m-78 25h78m-78 25h78"
      />
    </>
  ),
};

/** Ambient illustration, never a status, progress bar or inferred business reading. */
export function HubWidgetAtmosphere({ kind, weatherCode }: { kind: string; weatherCode?: number | null | undefined }) {
  const weather = classifyHubWeather(weatherCode);
  const known = kind === "weather" || Object.hasOwn(illustrations, kind);
  return (
    <div
      className="hub-widget-atmosphere"
      data-widget-atmosphere={known ? kind : "neutral"}
      data-weather={kind === "weather" ? weather : undefined}
      aria-hidden="true"
    >
      <span className="hub-widget-atmosphere__wash" />
      {kind === "weather" ? (
        <WeatherAtmosphere weather={weather} />
      ) : known ? (
        <svg viewBox="0 0 360 180" preserveAspectRatio="none" focusable="false" aria-hidden="true">
          {illustrations[kind]}
        </svg>
      ) : null}
      {kind === "messages" || kind === "activity" || kind === "agenda" ? (
        <span className="hub-widget-atmosphere__scan" />
      ) : null}
    </div>
  );
}
