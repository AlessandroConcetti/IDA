import { openMeteoAirSchema as airSchema, openMeteoForecastSchema as forecastSchema } from "@ida/contracts/open-meteo";
import { type WeatherBulletin, type WeatherCity, weatherBulletinSchema } from "@ida/contracts/weather";

export interface WeatherAdapter {
  read(city: WeatherCity, now: Date, signal: AbortSignal): Promise<WeatherBulletin>;
}
function iso(value: number) {
  return new Date(value * 1000).toISOString();
}
function localDate(value: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value * 1000);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function aligned(value: Record<string, (number | null)[]>) {
  const length = value.time?.length;
  if (!length || Object.values(value).some((items) => items.length !== length)) throw new Error("INVALID_WEATHER_DATA");
  const times = value.time ?? [];
  if (times.some((time, index) => time === null || (index > 0 && time <= (times[index - 1] ?? Infinity))))
    throw new Error("INVALID_WEATHER_DATA");
}

/** Ne conserve jamais de réponse brute, texte externe, en-tête ou géolocalisation utilisateur. */
export function normalizeWeather(forecast: unknown, air: unknown, city: WeatherCity, now: Date): WeatherBulletin {
  const data = forecastSchema.parse(forecast);
  aligned(data.hourly);
  aligned(data.daily);
  if (Math.abs(data.current.time * 1000 - now.getTime()) > 2 * 3_600_000) throw new Error("STALE_WEATHER_DATA");
  const airResult = airSchema.safeParse(air);
  const airCurrent =
    airResult.success && Math.abs(airResult.data.current.time * 1000 - now.getTime()) <= 3 * 3_600_000
      ? airResult.data.current
      : null;
  const airProjection = airCurrent
    ? weatherBulletinSchema.shape.air.safeParse({
        at: iso(airCurrent.time),
        europeanAqi: airCurrent.european_aqi,
        pm25: airCurrent.pm2_5,
        pm10: airCurrent.pm10,
      })
    : null;
  const cutoff = Math.floor(data.current.time / 3600) * 3600;
  const daily = data.daily.time.map((time, index) => ({
    date: localDate(time, city.timezone),
    minimum: data.daily.temperature_2m_min[index],
    maximum: data.daily.temperature_2m_max[index],
    code: data.daily.weather_code[index],
    precipitationProbability: data.daily.precipitation_probability_max[index],
    uvMax: data.daily.uv_index_max[index],
    sunrise: data.daily.sunrise[index] == null ? null : iso(data.daily.sunrise[index]),
    sunset: data.daily.sunset[index] == null ? null : iso(data.daily.sunset[index]),
    daylightSeconds: data.daily.daylight_duration[index],
    snowfall: data.daily.snowfall_sum[index],
  }));
  if (daily[0]?.date !== localDate(data.current.time, city.timezone)) throw new Error("STALE_WEATHER_DATA");
  const hourly = data.hourly.time
    .map((time, index) => ({
      at: iso(time),
      temperature: data.hourly.temperature_2m[index],
      precipitationProbability: data.hourly.precipitation_probability[index],
      code: data.hourly.weather_code[index],
    }))
    .filter((item) => Date.parse(item.at) >= cutoff * 1000)
    .slice(0, 48);
  if (!hourly.length) throw new Error("STALE_WEATHER_DATA");
  return weatherBulletinSchema.parse({
    version: 1,
    cityId: city.id,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 600_000).toISOString(),
    source: "OPEN_METEO",
    current: {
      at: iso(data.current.time),
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
      pressure: data.current.pressure_msl,
      code: data.current.weather_code,
      isDay: data.current.is_day === 1,
    },
    hourly,
    daily,
    air: airProjection?.success ? airProjection.data : null,
  });
}

const origins = new Set(["https://api.open-meteo.com", "https://air-quality-api.open-meteo.com"]);
/** Limite sur les octets décompressés, y compris sans Content-Length. Aucune URL entrante n'est utilisée. */
export async function readWeatherJson(url: URL, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (
    !origins.has(url.origin) ||
    url.username ||
    url.password ||
    !["/v1/forecast", "/v1/air-quality"].includes(url.pathname)
  )
    throw new Error("WEATHER_DESTINATION_DENIED");
  const response = await fetcher(url, {
    method: "GET",
    signal,
    redirect: "error",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  const maximum = 128 * 1024;
  if (
    !response.ok ||
    !response.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
    Number(response.headers.get("content-length")) > maximum ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error("WEATHER_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("WEATHER_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export class OpenMeteoAdapter implements WeatherAdapter {
  async read(city: WeatherCity, now: Date, signal: AbortSignal): Promise<WeatherBulletin> {
    const forecast = new URL("https://api.open-meteo.com/v1/forecast");
    const air = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    for (const url of [forecast, air]) {
      url.searchParams.set("latitude", String(city.latitude));
      url.searchParams.set("longitude", String(city.longitude));
      url.searchParams.set("timezone", city.timezone);
      url.searchParams.set("timeformat", "unixtime");
    }
    forecast.searchParams.set("forecast_days", "7");
    forecast.searchParams.set("temperature_unit", "celsius");
    forecast.searchParams.set("wind_speed_unit", "kmh");
    forecast.searchParams.set("precipitation_unit", "mm");
    forecast.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,weather_code,is_day",
    );
    forecast.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
    forecast.searchParams.set(
      "daily",
      "temperature_2m_min,temperature_2m_max,weather_code,sunrise,sunset,daylight_duration,precipitation_probability_max,uv_index_max,snowfall_sum",
    );
    air.searchParams.set("current", "european_aqi,pm2_5,pm10");
    const [forecastResult, airResult] = await Promise.all([
      readWeatherJson(forecast, signal),
      readWeatherJson(air, signal).catch(() => null),
    ]);
    signal.throwIfAborted();
    return normalizeWeather(forecastResult, airResult, city, now);
  }
}
