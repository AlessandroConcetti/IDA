import { z } from "zod";

export const weatherCities = [
  { id: "geneva", name: "Genève", country: "Suisse", timezone: "Europe/Zurich", latitude: 46.2044, longitude: 6.1432 },
  {
    id: "marseille",
    name: "Marseille",
    country: "France",
    timezone: "Europe/Paris",
    latitude: 43.2965,
    longitude: 5.3698,
  },
  { id: "paris", name: "Paris", country: "France", timezone: "Europe/Paris", latitude: 48.8566, longitude: 2.3522 },
  { id: "lyon", name: "Lyon", country: "France", timezone: "Europe/Paris", latitude: 45.764, longitude: 4.8357 },
  {
    id: "london",
    name: "Londres",
    country: "Royaume-Uni",
    timezone: "Europe/London",
    latitude: 51.5074,
    longitude: -0.1278,
  },
  {
    id: "new-york",
    name: "New York",
    country: "États-Unis",
    timezone: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
  },
  { id: "tokyo", name: "Tokyo", country: "Japon", timezone: "Asia/Tokyo", latitude: 35.6762, longitude: 139.6503 },
  {
    id: "dubai",
    name: "Dubaï",
    country: "Émirats arabes unis",
    timezone: "Asia/Dubai",
    latitude: 25.2048,
    longitude: 55.2708,
  },
] as const;
export type WeatherCity = (typeof weatherCities)[number];
export const weatherCityIdSchema = z.enum([
  "geneva",
  "marseille",
  "paris",
  "lyon",
  "london",
  "new-york",
  "tokyo",
  "dubai",
]);
export const weatherReadSchema = z.object({ cityId: weatherCityIdSchema, consent: z.literal(true) }).strict();
const temperature = z.number().min(-100).max(70).nullable();
const percent = z.number().min(0).max(100).nullable();
const instant = z.iso.datetime();
const code = z.number().int().min(0).max(99).nullable();
export const weatherBulletinSchema = z
  .object({
    version: z.literal(1),
    cityId: weatherCityIdSchema,
    fetchedAt: instant,
    expiresAt: instant,
    source: z.literal("OPEN_METEO"),
    current: z
      .object({
        at: instant,
        temperature,
        apparentTemperature: temperature,
        humidity: percent,
        windSpeed: z.number().min(0).max(500).nullable(),
        windDirection: z.number().min(0).max(360).nullable(),
        pressure: z.number().min(100).max(1200).nullable(),
        code,
        isDay: z.boolean(),
      })
      .strict(),
    hourly: z.array(z.object({ at: instant, temperature, precipitationProbability: percent, code }).strict()).max(48),
    daily: z
      .array(
        z
          .object({
            date: z.iso.date(),
            minimum: temperature,
            maximum: temperature,
            code,
            precipitationProbability: percent,
            uvMax: z.number().min(0).max(30).nullable(),
            sunrise: instant.nullable(),
            sunset: instant.nullable(),
            daylightSeconds: z.number().min(0).max(86400).nullable(),
            snowfall: z.number().min(0).max(1000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(7),
    air: z
      .object({
        at: instant,
        europeanAqi: z.number().min(0).max(1000).nullable(),
        pm25: z.number().min(0).max(10000).nullable(),
        pm10: z.number().min(0).max(10000).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type WeatherBulletin = z.infer<typeof weatherBulletinSchema>;
export type WeatherRead = z.infer<typeof weatherReadSchema>;
