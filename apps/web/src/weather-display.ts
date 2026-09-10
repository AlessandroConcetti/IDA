import type { WeatherBulletin } from "../../../packages/contracts/src/weather";

export function weatherLabel(code: number | null | undefined): string {
  if (code == null) return "Conditions non renseignées";
  if (code === 0) return "Ciel dégagé";
  if (code === 1) return "Peu nuageux";
  if (code === 2) return "Partiellement nuageux";
  if (code === 3) return "Ciel couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67].includes(code)) return "Pluie";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neige";
  if ([80, 81, 82].includes(code)) return "Averses";
  if ([95, 96, 99].includes(code)) return "Orage";
  return "Conditions non renseignées";
}
export function weatherIcon(code: number | null | undefined): string {
  if (code == null) return "unknown";
  if (code === 0 || code === 1) return "sun";
  if ([2, 3, 45, 48].includes(code)) return "cloud";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  return "unknown";
}
export function weatherNumber(value: number | null | undefined, unit = "", digits = 0): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value)}${unit}`;
}
export function weatherTime(value: string | null | undefined, timezone: string): string {
  return !value || !Number.isFinite(Date.parse(value))
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
        new Date(value),
      );
}
export function weatherDay(date: string, long = false): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function aqiLabel(value: number | null | undefined): string {
  if (value == null) return "Non disponible";
  if (value <= 20) return "Bonne";
  if (value <= 40) return "Correcte";
  if (value <= 60) return "Modérée";
  if (value <= 80) return "Mauvaise";
  if (value <= 100) return "Très mauvaise";
  return "Extrêmement mauvaise";
}
export function windCompass(value: number | null | undefined): string {
  if (value == null) return "—";
  return (
    ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"][
      Math.round(value / 22.5) % 16
    ] ?? "—"
  );
}
export function bulletinIsCurrent(data: WeatherBulletin | undefined, now = Date.now()): boolean {
  return !!data && Date.parse(data.fetchedAt) <= now + 60_000 && Date.parse(data.expiresAt) > now;
}
