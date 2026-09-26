import { type CSSProperties, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type WeatherBulletin, type WeatherCity, weatherCities } from "../../../packages/contracts/src/weather";
import { onWorkspaceInvalidated } from "./api-transport";
import { cachedWeather } from "./assistant-reads";
import type { NavigationId } from "./data";
import { LocalDialogue } from "./LocalDialogue";
import { LineIcon, Sheet } from "./ReferenceChrome";
import {
  aqiLabel,
  bulletinIsCurrent,
  weatherNumber as number,
  weatherTime as time,
  weatherDay,
  weatherIcon,
  weatherLabel,
  windCompass,
} from "./weather-display";
import { loadWeatherBulletin, weatherLoadMessage } from "./weather-loader";

type Tab = "today" | "forecast" | "maps" | "air" | "alerts";
type Panel = "dialogue" | "privacy" | "settings" | "hour" | null;
const tabs: readonly [Tab, string][] = [
  ["today", "Aujourd’hui"],
  ["forecast", "Prévisions"],
  ["maps", "Cartes"],
  ["air", "Qualité de l’air"],
  ["alerts", "Alertes"],
];
const titles = {
  dialogue: "Dialoguer avec IDA",
  privacy: "Vos données météo",
  settings: "Affichage et connexion",
  hour: "Détail de la prévision",
};
const external = { target: "_blank", rel: "noreferrer noopener" } as const;

function Metric({ icon, label, value, detail }: { icon: string; label: string; value: string; detail?: string }) {
  return (
    <div className="weather-metric">
      <LineIcon kind={icon} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  );
}

/** Public city weather loads on entry. No geolocation, other sensor or LLM is activated. */
export function WeatherEnvironment({
  titleRef,
  onBack,
  onFridge,
  onNavigate,
  onSelectWorld,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onFridge: () => void;
  onNavigate: (id: NavigationId) => void;
  onSelectWorld: (id: string) => void;
}) {
  const [city, setCity] = useState<WeatherCity>(weatherCities[1]);
  const [tab, setTab] = useState<Tab>("today");
  const [panel, setPanel] = useState<Panel>(null);
  const [bulletins, setBulletins] = useState<Partial<Record<WeatherCity["id"], WeatherBulletin>>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedHour, setSelectedHour] = useState<WeatherBulletin["hourly"][number] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [still, setStill] = useState(false);
  const [solid, setSolid] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const busyRef = useRef(false);
  const localBulletin = bulletins[city.id];
  const sharedBulletin = cachedWeather(city.id);
  const raw =
    sharedBulletin &&
    bulletinIsCurrent(sharedBulletin, clock) &&
    (!localBulletin ||
      !bulletinIsCurrent(localBulletin, clock) ||
      Date.parse(sharedBulletin.fetchedAt) > Date.parse(localBulletin.fetchedAt))
      ? sharedBulletin
      : (localBulletin ?? sharedBulletin);
  const data = bulletinIsCurrent(raw, clock) ? raw : undefined;
  const day =
    (tab === "forecast" ? data?.daily.find((item) => item.date === selectedDate) : undefined) ?? data?.daily[0];
  const hourRows =
    tab === "forecast" && day
      ? (data?.hourly.filter(
          (hour) =>
            new Intl.DateTimeFormat("sv-SE", { timeZone: city.timezone }).format(new Date(hour.at)) === day.date,
        ) ?? [])
      : (data?.hourly.slice(0, 10) ?? []);
  const current = data?.current;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [titleRef]);

  useEffect(() => {
    const nextExpiry = [...Object.values(bulletins), ...(raw ? [raw] : [])]
      .filter((item) => Date.parse(item.expiresAt) > clock)
      .map((item) => Date.parse(item.expiresAt))
      .sort((a, b) => a - b)[0];
    if (!nextExpiry) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(1, nextExpiry - Date.now() + 10));
    return () => window.clearTimeout(timer);
  }, [bulletins, clock, raw]);

  function chooseCity(id: string) {
    const next = weatherCities.find((item) => item.id === id);
    if (!next) return;
    request.current?.abort();
    request.current = null;
    busyRef.current = false;
    setBusy(false);
    setError("");
    setCity(next);
    setSelectedDate("");
    setClock(Date.now());
  }
  const load = useCallback(
    async (force = false) => {
      if (document.hidden || busyRef.current) return;
      const controller = new AbortController();
      request.current?.abort();
      request.current = controller;
      busyRef.current = true;
      setBusy(true);
      setEnabled(null);
      setError("");
      try {
        const received = await loadWeatherBulletin(city.id, controller.signal, force);
        if (controller.signal.aborted || request.current !== controller) return;
        setEnabled(true);
        setBulletins((previous) => ({ ...previous, [city.id]: received }));
        setClock(Date.now());
        setSelectedDate(received.daily[0]?.date ?? "");
      } catch (failure) {
        if (!controller.signal.aborted && request.current === controller) {
          setEnabled(false);
          setError(weatherLoadMessage(failure));
        }
      } finally {
        if (!controller.signal.aborted && request.current === controller) {
          busyRef.current = false;
          setBusy(false);
          request.current = null;
        }
      }
    },
    [city.id],
  );

  useEffect(() => {
    const cancel = () => {
      request.current?.abort();
      request.current = null;
      busyRef.current = false;
      setBusy(false);
    };
    const visibility = () => {
      if (document.hidden) cancel();
      else void load();
    };
    const unsubscribe = onWorkspaceInvalidated(cancel);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", cancel);
    void load();
    return () => {
      request.current?.abort();
      request.current = null;
      busyRef.current = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", cancel);
    };
  }, [load]);
  function stop() {
    request.current?.abort();
    request.current = null;
    busyRef.current = false;
    setBusy(false);
    setError("Chargement annulé.");
  }
  function selectTab(next: Tab) {
    setTab(next);
  }
  const hourlyPanel = (
    <section className="weather-card weather-hours" aria-label="Prévisions horaires">
      <div className="weather-card-heading">
        <h2>{tab === "forecast" && day ? weatherDay(day.date, true) : "Les prochaines heures"}</h2>
        <span>{city.timezone}</span>
      </div>
      {hourRows.length ? (
        <div className="weather-hour-strip">
          {hourRows.map((hour) => (
            <button
              key={hour.at}
              type="button"
              onClick={() => {
                setSelectedHour(hour);
                setPanel("hour");
              }}
              aria-label={`${time(hour.at, city.timezone)}, ${number(hour.temperature, " degrés")}, ${weatherLabel(hour.code)}`}
            >
              <span>{time(hour.at, city.timezone)}</span>
              <LineIcon kind={weatherIcon(hour.code)} />
              <strong>{number(hour.temperature, "°")}</strong>
              <small>{number(hour.precipitationProbability, " %")}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="weather-empty">
          {data
            ? "Les prévisions horaires ne couvrent pas cette journée. Consultez son résumé ci-dessous."
            : "Les températures et probabilités de précipitations apparaîtront dès que le bulletin sera disponible."}
        </p>
      )}
    </section>
  );
  const airPanel = (
    <section className="weather-card weather-air">
      <h2>
        <LineIcon kind="leaf" />
        Qualité de l’air
      </h2>
      <div className="weather-air-value">
        <strong>{aqiLabel(data?.air?.europeanAqi)}</strong>
        <span>{number(data?.air?.europeanAqi)}</span>
      </div>
      {data?.air?.europeanAqi != null ? (
        <meter
          min={0}
          max={150}
          value={Math.min(150, data.air.europeanAqi)}
          aria-label="Indice européen de qualité de l’air"
        />
      ) : (
        <div className="weather-meter-empty" />
      )}
      <p>
        Indice européen AQI ·{" "}
        {data?.air ? `modélisé à ${time(data.air.at, city.timezone)}` : "aucune mesure disponible"}
      </p>
      {tab === "air" ? (
        <>
          <dl className="weather-air-detail">
            <div>
              <dt>PM2,5</dt>
              <dd>{number(data?.air?.pm25, " μg/m³", 1)}</dd>
            </div>
            <div>
              <dt>PM10</dt>
              <dd>{number(data?.air?.pm10, " μg/m³", 1)}</dd>
            </div>
          </dl>
          <p>
            Modèle régional CAMS, pas un capteur à votre adresse. Ces informations ne remplacent pas un avis médical.
          </p>
          <a {...external} href="https://airindex.eea.europa.eu/AQI/index.html">
            Consulter l’indice officiel européen ↗
          </a>
        </>
      ) : (
        <button type="button" onClick={() => selectTab("air")}>
          Comprendre les indicateurs <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );

  return (
    <section
      className="environment-screen weather-environment"
      data-world="home"
      data-section="weather"
      data-surface={solid || still ? "solid" : "glass"}
      data-motion={String(!still)}
      style={{ "--environment-image": 'url("/design/user-20260909/weather-lake-v1.png")' } as CSSProperties}
      aria-label="Météo — IDA Home"
    >
      <aside className="weather-rail">
        <button className="weather-brand" type="button" onClick={onBack} aria-label="Retour à IDA Home">
          IDA<span>HOME</span>
        </button>
        <nav aria-label="Espaces d’IDA">
          <button type="button" onClick={onBack}>
            <LineIcon kind="home" />
            Accueil
          </button>
          <button type="button" onClick={() => setPanel("dialogue")}>
            <LineIcon kind="chat" />
            Chat
          </button>
          <button type="button" onClick={() => onNavigate("calendar")}>
            <LineIcon kind="calendar" />
            Agenda
          </button>
          <button type="button" onClick={() => onNavigate("content")}>
            <LineIcon kind="book" />
            Fichiers & médias
          </button>
          <button type="button" onClick={onFridge}>
            <LineIcon kind="fridge" />
            Mon frigo
          </button>
          <button type="button" onClick={onBack}>
            <LineIcon kind="home" />
            Maison
          </button>
          <button type="button" onClick={() => onSelectWorld("health")}>
            <LineIcon kind="heart" />
            Santé
          </button>
          <button type="button" onClick={() => onSelectWorld("finance")}>
            <LineIcon kind="grid" />
            Finances
          </button>
          <button type="button" onClick={() => onSelectWorld("fabrique")}>
            <LineIcon kind="case" />
            Projets
          </button>
          <button type="button" onClick={() => onSelectWorld("travel")}>
            <LineIcon kind="plane" />
            Voyages
          </button>
          <button type="button" aria-current="page" onClick={() => selectTab("today")}>
            <LineIcon kind="cloud" />
            Météo
          </button>
          <button type="button" onClick={() => onNavigate("tasks")}>
            <LineIcon kind="book" />
            Notes & tâches
          </button>
          <button type="button" onClick={() => setPanel("settings")}>
            <LineIcon kind="sliders" />
            Paramètres
          </button>
        </nav>
        <div className="weather-rail-end">
          <LineIcon kind="globe" />
          <p>
            Toujours
            <br />à vos côtés.
          </p>
          <button type="button" onClick={() => setPanel("privacy")}>
            Confidentialité
          </button>
        </div>
      </aside>
      <div className="weather-main">
        <header className="weather-toolbar">
          <button type="button" onClick={onBack} aria-label="Retour à IDA Home">
            ‹
          </button>
          <h1 ref={titleRef} tabIndex={-1}>
            Météo
          </h1>
          <button className="weather-dialogue-open" type="button" onClick={() => setPanel("dialogue")}>
            <LineIcon kind="search" />
            <span>Demande à IDA…</span>
            <LineIcon kind="chat" />
          </button>
          <button type="button" onClick={() => setPanel("settings")} aria-label="Affichage et connexion">
            <LineIcon kind="sliders" />
          </button>
        </header>
        <div className="weather-content">
          <header className="weather-hero">
            <label className="weather-city">
              <LineIcon kind="pin" />
              <span className="weather-visually-hidden">Ville du bulletin</span>
              <select ref={picker} value={city.id} onChange={(event) => chooseCity(event.target.value)}>
                {weatherCities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}, {item.country}
                  </option>
                ))}
              </select>
            </label>
            <p className="weather-observed">
              {current
                ? `Modélisation du ${new Intl.DateTimeFormat("fr-FR", { timeZone: city.timezone, dateStyle: "long" }).format(new Date(current.at))} · ${time(current.at, city.timezone)}`
                : busy
                  ? "Le bulletin de votre ville se charge…"
                  : "Bulletin indisponible · vous pouvez réessayer."}
            </p>
            <div className="weather-temperature">
              <span>{number(current?.temperature)}</span>
              <span>°C</span>
            </div>
            <p className="weather-condition">
              {current ? weatherLabel(current.code) : "Votre météo, à portée de main."}
            </p>
            <p className="weather-greeting">
              {data
                ? `Bonjour. Retrouvez les prévisions pour ${city.name}.`
                : busy
                  ? "Bonjour. Je récupère les prévisions de votre ville."
                  : "Bonjour. Le bulletin n’est pas disponible pour le moment."}
            </p>
            <blockquote>
              « Chaque jour a son ciel. »<cite>IDA</cite>
            </blockquote>
            <div className="weather-metrics">
              <Metric icon="thermometer" label="Ressenti" value={number(current?.apparentTemperature, "°C")} />
              <Metric icon="drop" label="Humidité" value={number(current?.humidity, " %")} />
              <Metric
                icon="wind"
                label="Vent"
                value={number(current?.windSpeed, " km/h")}
                detail={current ? windCompass(current.windDirection) : undefined}
              />
              <Metric icon="gauge" label="Pression" value={number(current?.pressure, " hPa")} />
              <Metric icon="sun" label="UV max. du jour" value={number(data?.daily[0]?.uvMax, "", 1)} />
              <Metric icon="leaf" label="Qualité de l’air" value={aqiLabel(data?.air?.europeanAqi)} />
            </div>
          </header>
          <form
            className="weather-load weather-card"
            onSubmit={(event) => {
              event.preventDefault();
              void load(true);
            }}
          >
            <div>
              <strong>
                {busy
                  ? "Chargement du bulletin…"
                  : data
                    ? `Bulletin de ${city.name}`
                    : raw
                      ? "Bulletin expiré · à actualiser"
                      : "Connexion météo"}
              </strong>
              <p>
                {data
                  ? `Reçu à ${time(data.fetchedAt, city.timezone)} · expiration à ${time(data.expiresAt, city.timezone)}`
                  : enabled === null
                    ? "Vérification du service IDA…"
                    : enabled
                      ? "Prévisions de modèles Open-Meteo · usage personnel"
                      : "Service indisponible ou désactivé"}
              </p>
            </div>
            <p>
              Prévisions Open-Meteo pour {city.name}. Seules les coordonnées publiques du centre de la ville sont
              transmises ; aucune géolocalisation de votre appareil.
            </p>
            <button className="weather-load-button" type="submit" disabled={busy}>
              {busy ? "Chargement…" : "Actualiser"}
              <span aria-hidden="true">↻</span>
            </button>
            {busy ? (
              <button type="button" onClick={stop}>
                Annuler
              </button>
            ) : null}
          </form>
          {error ? (
            <p className="weather-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="weather-status" role="status">
            {busy
              ? "La lecture est en cours, sans géolocalisation ni appel à une IA."
              : data
                ? "Bulletin chargé. Sélectionnez une heure ou un jour pour le détail."
                : "Les tirets indiquent des données inconnues, pas des valeurs nulles."}
          </p>
          <div className="weather-columns">
            <div className="weather-primary">
              <nav className="weather-tabs" aria-label="Vues météo">
                {tabs.map(([id, label]) => (
                  <button type="button" key={id} aria-pressed={tab === id} onClick={() => selectTab(id)}>
                    {label}
                  </button>
                ))}
              </nav>
              {tab === "today" || tab === "forecast" ? (
                <>
                  {tab === "forecast" && data ? (
                    <nav className="weather-day-picker" aria-label="Jour du bulletin">
                      {data.daily.map((item) => (
                        <button
                          key={item.date}
                          type="button"
                          aria-pressed={day?.date === item.date}
                          onClick={() => setSelectedDate(item.date)}
                        >
                          {weatherDay(item.date)}
                        </button>
                      ))}
                    </nav>
                  ) : null}
                  {hourlyPanel}
                  <div className="weather-day-grid">
                    <section className="weather-card weather-week">
                      <h2>Cette semaine</h2>
                      {data ? (
                        data.daily.map((item, index) => (
                          <button
                            type="button"
                            key={item.date}
                            aria-label={`Détails du ${weatherDay(item.date, true)}`}
                            onClick={() => {
                              setSelectedDate(item.date);
                              setTab("forecast");
                            }}
                          >
                            <span>{index === 0 ? "Aujourd’hui" : weatherDay(item.date)}</span>
                            <LineIcon kind={weatherIcon(item.code)} />
                            <small>{number(item.minimum, "°")}</small>
                            <strong>{number(item.maximum, "°")}</strong>
                          </button>
                        ))
                      ) : (
                        <p className="weather-empty">Les sept prochains jours apparaîtront après le chargement.</p>
                      )}
                    </section>
                    <section className="weather-card weather-day-details">
                      <h2>{tab === "forecast" && day ? weatherDay(day.date, true) : "Détails du jour"}</h2>
                      <div className="weather-sun-path" aria-hidden="true">
                        <svg viewBox="0 0 300 95" aria-hidden="true">
                          <path d="M15 88 Q150 -65 285 88" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <LineIcon kind="sun" />
                      </div>
                      <div className="weather-sun-times">
                        <span>
                          <strong>{time(day?.sunrise, city.timezone)}</strong>Lever du soleil
                        </span>
                        <span>
                          <strong>{time(day?.sunset, city.timezone)}</strong>Coucher du soleil
                        </span>
                      </div>
                      <Metric
                        icon="sun"
                        label="Durée du jour"
                        value={
                          day?.daylightSeconds == null
                            ? "—"
                            : `${Math.floor(day.daylightSeconds / 3600)} h ${Math.floor((day.daylightSeconds % 3600) / 60)} min`
                        }
                      />
                      <Metric
                        icon="thermometer"
                        label="Températures min. / max."
                        value={`${number(day?.minimum, "°")} / ${number(day?.maximum, "°")}`}
                      />
                      <Metric
                        icon="rain"
                        label="Probabilité de précipitations"
                        value={number(day?.precipitationProbability, " %")}
                      />
                      <Metric icon="snow" label="Chutes de neige prévues" value={number(day?.snowfall, " cm", 1)} />
                    </section>
                  </div>
                </>
              ) : null}
              {tab === "maps" ? (
                <section className="weather-card weather-map-full">
                  <h2>Cartes météo</h2>
                  <LineIcon kind="map" />
                  <p>
                    Explorez les cartes et les modèles pour {city.name} sur un service externe. Aucune carte distante
                    n’est chargée en arrière-plan.
                  </p>
                  <a {...external} href={`https://www.windy.com/?${city.latitude},${city.longitude},8`}>
                    Ouvrir Windy pour {city.name} ↗
                  </a>
                  <a {...external} href="https://www.meteosuisse.admin.ch/">
                    Bulletins et cartes MétéoSuisse ↗
                  </a>
                  <a {...external} href="https://vigilance.meteofrance.fr/fr">
                    Vigilance Météo-France ↗
                  </a>
                  <p className="weather-muted">Le décor de cette page est une illustration, pas une carte satellite.</p>
                </section>
              ) : null}
              {tab === "air" ? (
                <>
                  {airPanel}
                  <section className="weather-card weather-aqi-scale">
                    <h2>Lire l’indice européen</h2>
                    <p>
                      Jusqu’à 20 : bonne · au-dessus de 20 à 40 : correcte · au-dessus de 40 à 60 : modérée · au-dessus
                      de 60 à 80 : mauvaise · au-dessus de 80 à 100 : très mauvaise · au-delà de 100 : extrêmement
                      mauvaise.
                    </p>
                    <p>
                      Un tiret signifie « inconnu ». Une absence de données ne permet pas de conclure que l’air est bon.
                    </p>
                    <a {...external} href="https://open-meteo.com/en/docs/air-quality-api">
                      Méthode et sources des modèles ↗
                    </a>
                  </section>
                </>
              ) : null}
              {tab === "alerts" ? (
                <section className="weather-card weather-alerts">
                  <h2>
                    <LineIcon kind="alert" />
                    Vigilance officielle à consulter
                  </h2>
                  <p>
                    IDA ne reçoit pas encore les alertes des autorités. Ce panneau ne signifie pas « aucune alerte » et
                    ne déclenche pas de notifications.
                  </p>
                  <div className="weather-official-links">
                    <a {...external} href="https://www.meteosuisse.admin.ch/">
                      Suisse · MétéoSuisse ↗
                    </a>
                    <a {...external} href="https://vigilance.meteofrance.fr/fr">
                      France · Météo-France ↗
                    </a>
                  </div>
                  <p>
                    Pour une autre destination, consultez le service météorologique et les autorités locales avant une
                    activité exposée.
                  </p>
                </section>
              ) : null}
            </div>
            <aside className="weather-secondary" aria-label="Carte, air et repères">
              <section className="weather-card weather-map-card">
                <button className="weather-map-city" type="button" onClick={() => picker.current?.focus()}>
                  <LineIcon kind="pin" />
                  {city.name}
                  <span aria-hidden="true">⌄</span>
                </button>
                <div className="weather-map-illustration">
                  <LineIcon kind="map" />
                  <span>Cartes & prévisions</span>
                </div>
                <button type="button" onClick={() => selectTab("maps")}>
                  <LineIcon kind="map" />
                  Voir la carte météo<span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("today");
                    setSelectedHour(data?.hourly[2] ?? null);
                    setPanel("hour");
                  }}
                >
                  <LineIcon kind="rain" />
                  Dans les prochaines heures<span aria-hidden="true">→</span>
                </button>
              </section>
              {tab !== "air" ? airPanel : null}
              <section className="weather-card weather-insights">
                <h2>
                  <LineIcon kind="ideas" />
                  Les repères d’IDA
                </h2>
                <p>
                  <LineIcon kind="clock" />
                  {data
                    ? `Prévisions datées, dans le fuseau ${city.timezone}.`
                    : "Chargez un bulletin pour consulter les heures et les jours à venir."}
                </p>
                <p>
                  <LineIcon kind="drop" />
                  Les pourcentages expriment une probabilité, pas une certitude.
                </p>
                <button type="button" onClick={() => selectTab("alerts")}>
                  <LineIcon kind="alert" />
                  Vérifier la vigilance officielle<span aria-hidden="true">→</span>
                </button>
              </section>
            </aside>
          </div>
          <footer className="weather-bottom">
            <section className="weather-card weather-world">
              <h2>
                <LineIcon kind="globe" />
                Ailleurs dans le monde
              </h2>
              <div>
                {(["paris", "new-york", "tokyo", "dubai"] as const).map((id) => {
                  const place = weatherCities.find((item) => item.id === id);
                  const bulletin = bulletinIsCurrent(bulletins[id], clock) ? bulletins[id] : undefined;
                  return (
                    <button type="button" key={id} aria-label={`Choisir ${place?.name}`} onClick={() => chooseCity(id)}>
                      <LineIcon kind={weatherIcon(bulletin?.current.code)} />
                      <span>
                        {place?.name}
                        <strong>{bulletin ? number(bulletin.current.temperature, "°C") : "Choisir"}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            <blockquote className="weather-card weather-bottom-quote">
              « Le beau temps n’est pas qu’une donnée,
              <br />
              c’est une invitation. »<cite>IDA</cite>
            </blockquote>
          </footer>
          <div className="weather-source">
            <span>
              Prévisions :{" "}
              <a {...external} href="https://open-meteo.com/">
                Open-Meteo
              </a>{" "}
              · Air :{" "}
              <a {...external} href="https://atmosphere.copernicus.eu/">
                CAMS / Copernicus
              </a>{" "}
              · CC BY 4.0
            </span>
            <span>Décor illustratif · aucune capture de position</span>
            <button type="button" aria-pressed={still} onClick={() => setStill((value) => !value)}>
              {still ? "Animer les reflets" : "Mettre les reflets en pause"}
            </button>
          </div>
        </div>
      </div>
      {panel ? (
        <Sheet title={titles[panel]} close={() => setPanel(null)}>
          {panel === "dialogue" ? (
            <>
              <p className="reference-hint">
                Demandez la météo d’une ville du catalogue, aujourd’hui ou demain. IDA lit les prévisions réelles via
                son outil météo ; aucun bulletin n’est envoyé automatiquement à un modèle.
              </p>
              <LocalDialogue />
            </>
          ) : panel === "privacy" ? (
            <>
              <p>
                Le bulletin se charge à l’ouverture et au changement de ville, sans clic supplémentaire. Seul le centre
                de la ville sélectionnée est transmis à l’API officielle Open-Meteo si aucun bulletin valide n’est en
                cache. Le fournisseur voit l’adresse IP sortante du serveur. Aucun nom, adresse de domicile, donnée Care
                ou fichier n’est envoyé.
              </p>
              <p>
                Votre choix de ville est temporaire. Un bulletin public peut être réutilisé pendant dix minutes ; les
                permissions de votre session sont contrôlées côté serveur à chaque requête API. Pas de géolocalisation,
                de mémoire permanente ni de requête IA implicite.
              </p>
              <a {...external} href="https://open-meteo.com/en/terms">
                Conditions et confidentialité du fournisseur ↗
              </a>
            </>
          ) : panel === "settings" ? (
            <>
              <label>
                <input type="checkbox" checked={still} onChange={(event) => setStill(event.target.checked)} />
                Mettre les reflets en pause
              </label>
              <label>
                <input type="checkbox" checked={solid} onChange={(event) => setSolid(event.target.checked)} />
                Renforcer l’opacité des panneaux
              </label>
              <p>
                Ces réglages restent temporaires. Les préférences système de réduction du mouvement et de transparence
                sont respectées.
              </p>
              <p>
                Connexion :{" "}
                {enabled
                  ? "bulletin disponible, cache partagé prioritaire à l’ouverture"
                  : busy
                    ? "vérification en cours"
                    : "indisponible ou désactivée"}
                .
              </p>
              <button type="button" disabled={busy} onClick={() => void load(true)}>
                Revérifier le service IDA
              </button>
            </>
          ) : selectedHour && data ? (
            <>
              <h3>
                {time(selectedHour.at, city.timezone)} · {city.name}
              </h3>
              <p>{weatherLabel(selectedHour.code)}</p>
              <div className="weather-hour-modal">
                <Metric icon="thermometer" label="Température prévue" value={number(selectedHour.temperature, "°C")} />
                <Metric
                  icon="rain"
                  label="Probabilité de précipitations"
                  value={number(selectedHour.precipitationProbability, " %")}
                />
              </div>
              <p>Prévision horaire de modèle. Ce n’est pas une prévision radar minute par minute.</p>
            </>
          ) : (
            <p>Chargez les prévisions de cette ville pour consulter le détail horaire.</p>
          )}
        </Sheet>
      ) : null}
    </section>
  );
}
