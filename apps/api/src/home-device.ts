import { randomUUID } from "node:crypto";
import type { RequestIdentityContext } from "@ida/contracts";
import { type HomeDeviceStatus, homeDeviceReadSchema, homeDeviceResultSchema } from "@ida/contracts/home-device";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ConnectorSecret } from "./connector-vault.js";
import type { DemoDatabase } from "./database.js";
import { createHomeAssistantHttpsTransport, homeAssistantTargetState } from "./home-assistant-transport.js";
import { createHomeAssistantReadProvider } from "./smart-home-read.js";

export const homeDeviceTool = { toolKey: "read_home_device", moduleKey: "HOME", permission: "READ" } as const;
export type HomeAssistantBinding = Readonly<{
  workspaceId: string;
  enabled: boolean;
  origin: string;
  address: string;
  entityId: string;
  secret: ConnectorSecret;
}>;
type Options = {
  locked: boolean;
  binding?: HomeAssistantBinding | undefined;
  authorize: (request: FastifyRequest) => RequestIdentityContext;
  revalidate: (request: FastifyRequest) => Promise<void>;
  now?: (() => Date) | undefined;
};

export function registerHomeDevice(app: FastifyInstance, database: DemoDatabase, options: Options) {
  const binding = options.binding ? Object.freeze({ ...options.binding }) : undefined;
  const now = options.now ?? (() => new Date());
  let active: AbortController | undefined;
  let busy = false;
  let calls = 0;
  let windowEnd = 0;
  app.addHook("onClose", async () => {
    active?.abort();
  });
  function authorize(request: FastifyRequest) {
    const identity = options.authorize(request);
    if (binding && binding.workspaceId !== identity.workspaceId)
      throw Object.assign(new Error("Ressource non autorisée."), { statusCode: 403, code: "HOME_DEVICE_FORBIDDEN" });
    return identity;
  }
  async function state(): Promise<HomeDeviceStatus["state"]> {
    if (!options.locked) return "DISABLED";
    if (!binding) return "CONNECTION_REQUIRED";
    if (!binding.enabled) return "DISABLED";
    const target = homeAssistantTargetState(binding);
    if (target !== "VALID") return target;
    try {
      return (await binding.secret.available()) ? "CONFIGURED" : "SECRET_REQUIRED";
    } catch {
      return "SECRET_REQUIRED";
    }
  }
  app.get("/v1/home/device/status", async (request) => {
    authorize(request);
    const current = await state();
    await options.revalidate(request);
    return { data: { provider: "HOME_ASSISTANT", mode: "READ_ONLY_PILOT", state: current } };
  });
  app.post("/v1/home/device/read", { bodyLimit: 512 }, async (request, reply) => {
    const identity = authorize(request);
    if (!homeDeviceReadSchema.safeParse(request.body).success)
      return reply.code(400).send({
        error: {
          code: "INVALID_HOME_READ",
          message: "Confirmez la lecture de la lampe autorisée, sans autre paramètre.",
        },
      });
    // Guard synchrone avant tout await, y compris l'inspection du coffre.
    const time = now().getTime();
    if (time >= windowEnd) {
      calls = 0;
      windowEnd = time + 3_600_000;
    }
    if (busy || calls >= 30)
      return reply
        .code(429)
        .header("Retry-After", "10")
        .send({
          error: {
            code: "HOME_RATE_LIMITED",
            message: "Lecture en cours ou limite de 30 lectures par heure atteinte.",
          },
        });
    busy = true;
    const controller = new AbortController();
    active = controller;
    const timer = setTimeout(() => controller.abort(), 12_000);
    const cancel = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    request.raw.once("aborted", cancel);
    reply.raw.once("close", cancel);
    const runId = `home_${randomUUID().replaceAll("-", "")}`;
    let audited = false;
    async function audit(outcome: "REQUESTED" | "SUCCEEDED" | "FAILED") {
      await database.pglite.query(
        "INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload) VALUES ($1, $2, $3, 'home.device.read', 'HOME_DEVICE_READ', $4, $5::json)",
        [
          `act_${randomUUID().replaceAll("-", "")}`,
          identity.workspaceId,
          identity.userId,
          runId,
          JSON.stringify({
            toolKey: homeDeviceTool.toolKey,
            outcome,
            sessionId: identity.session.id,
            clientInstanceId: identity.clientInstance.id,
          }),
        ],
      );
    }
    try {
      if (!binding || (await state()) !== "CONFIGURED")
        return reply.code(503).send({
          error: {
            code: "HOME_NOT_CONFIGURED",
            message: "Préparez HTTPS vérifié, une lampe autorisée et son secret serveur avant lecture.",
          },
        });
      calls++;
      await audit("REQUESTED");
      audited = true;
      await options.revalidate(request);
      controller.signal.throwIfAborted();
      const transport = createHomeAssistantHttpsTransport(binding, async (signal) => {
        const token = await binding.secret.resolve(signal);
        // Révocation pendant le déchiffrement : aucun token envoyé au hub.
        await options.revalidate(request);
        signal.throwIfAborted();
        return token;
      });
      const result = await createHomeAssistantReadProvider(binding, transport).readState(controller.signal);
      controller.signal.throwIfAborted();
      if (result.status !== "READY") throw new Error("INVALID_HOME_RESULT");
      const data = homeDeviceResultSchema.parse({
        state: result.state,
        providerUpdatedAt: result.providerUpdatedAt,
        observedAt: now().toISOString(),
      });
      if (Date.parse(data.providerUpdatedAt) > now().getTime() + 60_000) throw new Error("INVALID_HOME_TIME");
      await options.revalidate(request);
      await audit("SUCCEEDED");
      await options.revalidate(request);
      controller.signal.throwIfAborted();
      return { data };
    } catch {
      if (audited) await audit("FAILED").catch(() => undefined);
      await options.revalidate(request);
      return reply.code(503).send({
        error: {
          code: "HOME_READ_UNAVAILABLE",
          message:
            "État non reçu ou non validé. Aucun appareil n’a été commandé. Vérifiez Home Assistant et la connexion serveur.",
        },
      });
    } finally {
      controller.abort();
      clearTimeout(timer);
      request.raw.off("aborted", cancel);
      reply.raw.off("close", cancel);
      active = undefined;
      busy = false;
    }
  });
}
