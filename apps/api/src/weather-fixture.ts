// Données synthétiques pour tests seulement ; aucun chiffre de démo dans l'interface.
export const weatherFixtureNow = new Date("2026-09-10T08:15:00.000Z");
const seconds = (iso: string) => Date.parse(iso) / 1000;
export function forecastFixture() {
  return {
    current_units: {
      time: "unixtime",
      temperature_2m: "°C",
      apparent_temperature: "°C",
      relative_humidity_2m: "%",
      wind_speed_10m: "km/h",
      wind_direction_10m: "°",
      pressure_msl: "hPa",
    },
    hourly_units: { time: "unixtime", temperature_2m: "°C", precipitation_probability: "%" },
    daily_units: {
      time: "unixtime",
      temperature_2m_min: "°C",
      temperature_2m_max: "°C",
      sunrise: "unixtime",
      sunset: "unixtime",
      daylight_duration: "s",
      precipitation_probability_max: "%",
      snowfall_sum: "cm",
    },
    current: {
      time: seconds("2026-09-10T08:15:00Z"),
      temperature_2m: 17,
      apparent_temperature: 16,
      relative_humidity_2m: 68,
      wind_speed_10m: 12,
      wind_direction_10m: 45,
      pressure_msl: 1024,
      weather_code: 2,
      is_day: 1,
    },
    hourly: {
      time: [seconds("2026-09-10T08:00:00Z"), seconds("2026-09-10T09:00:00Z")],
      temperature_2m: [17, 18],
      precipitation_probability: [0, 10],
      weather_code: [2, 3],
    },
    daily: {
      time: [seconds("2026-09-09T22:00:00Z"), seconds("2026-09-10T22:00:00Z")],
      temperature_2m_min: [10, 11],
      temperature_2m_max: [22, 23],
      weather_code: [2, 3],
      sunrise: [seconds("2026-09-10T05:00:00Z"), seconds("2026-09-11T05:01:00Z")],
      sunset: [seconds("2026-09-10T18:00:00Z"), seconds("2026-09-11T17:59:00Z")],
      daylight_duration: [46800, 46680],
      precipitation_probability_max: [10, 30],
      uv_index_max: [4, 3],
      snowfall_sum: [0, 0],
    },
  };
}
export function airFixture() {
  return {
    current_units: { time: "unixtime", pm2_5: "μg/m³", pm10: "μg/m³" },
    current: { time: seconds("2026-09-10T08:00:00Z"), european_aqi: 25, pm2_5: 8, pm10: 14 },
  };
}
