import { z } from "zod";

// Contrats de bord du fournisseur ; jamais les objets reçus exposés au client.
const nullableNumber = z.number().finite().nullable();
const epoch = z.number().int().min(0).max(10_000_000_000);
const series = z.array(nullableNumber).max(192);
export const openMeteoForecastSchema = z.object({
  current_units: z.object({
    time: z.literal("unixtime"),
    temperature_2m: z.literal("°C"),
    apparent_temperature: z.literal("°C"),
    relative_humidity_2m: z.literal("%"),
    wind_speed_10m: z.literal("km/h"),
    wind_direction_10m: z.literal("°"),
    pressure_msl: z.literal("hPa"),
  }),
  hourly_units: z.object({
    time: z.literal("unixtime"),
    temperature_2m: z.literal("°C"),
    precipitation_probability: z.literal("%"),
  }),
  daily_units: z.object({
    time: z.literal("unixtime"),
    temperature_2m_min: z.literal("°C"),
    temperature_2m_max: z.literal("°C"),
    sunrise: z.literal("unixtime"),
    sunset: z.literal("unixtime"),
    daylight_duration: z.literal("s"),
    precipitation_probability_max: z.literal("%"),
    snowfall_sum: z.literal("cm"),
  }),
  current: z.object({
    time: epoch,
    temperature_2m: nullableNumber,
    apparent_temperature: nullableNumber,
    relative_humidity_2m: nullableNumber,
    wind_speed_10m: nullableNumber,
    wind_direction_10m: nullableNumber,
    pressure_msl: nullableNumber,
    weather_code: nullableNumber,
    is_day: z.union([z.literal(0), z.literal(1)]),
  }),
  hourly: z.object({
    time: z.array(epoch).min(1).max(192),
    temperature_2m: series,
    precipitation_probability: series,
    weather_code: series,
  }),
  daily: z.object({
    time: z.array(epoch).min(1).max(7),
    temperature_2m_min: series,
    temperature_2m_max: series,
    weather_code: series,
    sunrise: z.array(epoch.nullable()).max(7),
    sunset: z.array(epoch.nullable()).max(7),
    daylight_duration: series,
    precipitation_probability_max: series,
    uv_index_max: series,
    snowfall_sum: series,
  }),
});
export const openMeteoAirSchema = z.object({
  current_units: z.object({ time: z.literal("unixtime"), pm2_5: z.literal("μg/m³"), pm10: z.literal("μg/m³") }),
  current: z.object({ time: epoch, european_aqi: nullableNumber, pm2_5: nullableNumber, pm10: nullableNumber }),
});
