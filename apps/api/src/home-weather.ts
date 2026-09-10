import { randomUUID } from "node:crypto";
import type { RequestIdentityContext } from "@ida/contracts";
import { type WeatherBulletin, weatherBulletinSchema, weatherCities, weatherReadSchema } from "@ida/contracts/weather";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DemoDatabase } from "./database.js";
import { OpenMeteoAdapter, type WeatherAdapter } from "./weather-adapter.js";

export const homeWeatherTool = { toolKey: "read_home_weather", moduleKey: "HOME", permission: "READ" } as const;
type WeatherOptions = {
  enabled: boolean;
  locked: boolean;
  authorize: (request: FastifyRequest) => RequestIdentityContext;
  revalidate: (request: FastifyRequest) => Promise<void>;
  now?: () => Date;
  adapter?: WeatherAdapter;
};

export function registerHomeWeather(app: FastifyInstance, database: DemoDatabase, options: WeatherOptions) {
  const enabled = options.enabled && options.locked;
  const adapter = options.adapter ?? new OpenMeteoAdapter();
  const now = options.now ?? (() => new Date());
  const cache = new Map<string, WeatherBulletin>(); // Exclusivement des bulletins publics, huit villes maximum.
  const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let busy = false;
  let calls = 0;
  let windowEnd = 0;
  let active: AbortController | undefined;
  app.addHook("onClose", async () => {
    active?.abort();
    cache.clear();
    for (const timer of expiryTimers.values()) clearTimeout(timer);
    expiryTimers.clear();
  });
  app.get("/v1/home/weather/status", async (request) => {
    options.authorize(request);
    return {
      data: {
        enabled,
        provider: "OPEN_METEO",
        mode: "PERSONAL_NON_COMMERCIAL",
        cityIds: weatherCities.map((city) => city.id),
      },
    };
  });

  app.post("/v1/home/weather", { bodyLimit: 1024 }, async (request, reply) => {
    const identity = options.authorize(request);
    const input = weatherReadSchema.safeParse(request.body);
    if (!input.success)
      return reply.code(400).send({
        error: {
          code: "INVALID_WEATHER_REQUEST",
          message: "Choisissez une ville du catalogue et confirmez le chargement de ses prévisions.",
        },
      });
    if (!enabled)
      return reply.code(503).send({
        error: { code: "WEATHER_DISABLED", message: "La connexion météo n’est pas activée sur ce serveur local." },
      });
    const city = weatherCities.find((item) => item.id === input.data.cityId);
    if (!city)
      return reply
        .code(400)
        .send({ error: { code: "INVALID_CITY", message: "Cette ville n’est pas dans le catalogue." } });
    const currentTime = now();
    if (currentTime.getTime() >= windowEnd) {
      calls = 0;
      windowEnd = currentTime.getTime() + 3_600_000;
    }
    if (busy || calls >= 30)
      return reply
        .header("Retry-After", busy ? "10" : String(Math.max(1, Math.ceil((windowEnd - currentTime.getTime()) / 1000))))
        .code(429)
        .send({
          error: {
            code: "WEATHER_RATE_LIMITED",
            message: busy
              ? "Un bulletin est déjà en cours de chargement. Réessayez dans quelques secondes."
              : "La limite locale de 30 consultations par heure est atteinte.",
          },
        });
    busy = true;
    calls++;
    const controller = new AbortController();
    active = controller;
    const timer = setTimeout(() => controller.abort(), 10_000);
    const cancel = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    request.raw.once("aborted", cancel);
    reply.raw.once("close", cancel);
    const runId = `weather_${randomUUID().replaceAll("-", "")}`;
    async function audit(outcome: "REQUESTED" | "SUCCEEDED" | "FAILED") {
      await database.pglite.query(
        "INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload) VALUES ($1, $2, $3, 'home.weather.read', 'HOME_WEATHER', $4, $5::json)",
        [
          `act_${randomUUID().replaceAll("-", "")}`,
          identity.workspaceId,
          identity.userId,
          runId,
          JSON.stringify({
            toolKey: homeWeatherTool.toolKey,
            outcome,
            sessionId: identity.session.id,
            clientInstanceId: identity.clientInstance.id,
          }),
        ],
      );
    }
    try {
      // Audit préalable obligatoire ; sa panne interdit la sortie externe.
      await audit("REQUESTED");
      await options.revalidate(request);
      controller.signal.throwIfAborted();
      const cached = cache.get(city.id);
      const bulletin =
        cached && Date.parse(cached.expiresAt) > currentTime.getTime()
          ? cached
          : weatherBulletinSchema.parse(await adapter.read(city, currentTime, controller.signal));
      if (bulletin.cityId !== city.id || Date.parse(bulletin.expiresAt) <= now().getTime())
        throw new Error("INVALID_BULLETIN");
      controller.signal.throwIfAborted();
      await options.revalidate(request);
      await audit("SUCCEEDED");
      // Le bulletin n'est restitué qu'après la dernière validation persistée.
      await options.revalidate(request);
      controller.signal.throwIfAborted();
      cache.set(city.id, bulletin);
      clearTimeout(expiryTimers.get(city.id));
      expiryTimers.set(
        city.id,
        setTimeout(
          () => {
            cache.delete(city.id);
            expiryTimers.delete(city.id);
          },
          Math.max(1, Date.parse(bulletin.expiresAt) - now().getTime()),
        ).unref(),
      );
      return { data: bulletin };
    } catch {
      await audit("FAILED").catch(() => undefined);
      // Ne pas convertir une révocation pendant le transport en réponse métier.
      await options.revalidate(request);
      return reply.code(503).send({
        error: {
          code: "WEATHER_UNAVAILABLE",
          message:
            "Le bulletin n’a pas pu être chargé ou validé. Réessayez ; les services météo officiels restent accessibles.",
        },
      });
    } finally {
      controller.abort(); // Arrête également la requête air si forecast a échoué en premier.
      clearTimeout(timer);
      request.raw.off("aborted", cancel);
      reply.raw.off("close", cancel);
      active = undefined;
      busy = false;
    }
  });
}
