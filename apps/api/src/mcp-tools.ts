import { randomUUID } from "node:crypto";
import type { RequestIdentityContext } from "@ida/contracts";
import type { ToolAuthorizationRequest } from "@ida/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DemoDatabase } from "./database.js";
import { executeScopedMcp } from "./mcp-adapter.js";
import { createMcpScopedFiles, type McpFileBinding, validateMcpFileRequest } from "./mcp-scoped-files.js";

export const mcpReadFileTool = { toolKey: "READ_FILE_SCOPED", moduleKey: "IDA", permission: "READ" } as const;
export const mcpSearchFilesTool = { toolKey: "SEARCH_FILES_SCOPED", moduleKey: "IDA", permission: "READ" } as const;

type Options = {
  locked: boolean;
  binding?: McpFileBinding | undefined;
  authorize: (request: FastifyRequest, tool: ToolAuthorizationRequest) => RequestIdentityContext;
  revalidate: (request: FastifyRequest, tool: ToolAuthorizationRequest) => Promise<void>;
};

function isAuthorizationError(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return false;
  return error.statusCode === 401 || error.statusCode === 403;
}

export function registerMcpTools(app: FastifyInstance, database: DemoDatabase, options: Options) {
  // Snapshot serveur : aucun paramètre de requête ne peut changer la racine ou le catalogue.
  const binding = options.binding
    ? Object.freeze({
        ...options.binding,
        resources: Object.freeze(options.binding.resources.map((resource) => Object.freeze({ ...resource }))),
      })
    : undefined;
  let active: AbortController | undefined;
  let busy = false;
  let calls = 0;
  let windowEnd = 0;
  app.addHook("onClose", async () => {
    active?.abort();
  });

  function authorize(request: FastifyRequest, tool: ToolAuthorizationRequest) {
    const identity = options.authorize(request, tool);
    if (binding && binding.workspaceId !== identity.workspaceId)
      throw Object.assign(new Error("Ressource non autorisée."), { statusCode: 403, code: "MCP_FORBIDDEN" });
    return identity;
  }

  app.get("/v1/mcp/status", async (request) => {
    authorize(request, mcpReadFileTool);
    const configured = options.locked && binding !== undefined;
    const resources = configured ? createMcpScopedFiles(binding).catalog() : [];
    await options.revalidate(request, mcpReadFileTool);
    return {
      data: {
        provider: "MCP",
        mode: "SCOPED_READ_ONLY",
        state: !options.locked ? "DISABLED" : configured ? "CONFIGURED" : "PREPARED",
        verification: "NOT_PERFORMED",
        tools: [mcpReadFileTool, mcpSearchFilesTool],
        resources,
      },
    };
  });

  app.post("/v1/mcp/call", { bodyLimit: 1024 }, async (request, reply) => {
    let input: ReturnType<typeof validateMcpFileRequest>;
    try {
      input = validateMcpFileRequest(request.body);
    } catch {
      return reply.code(400).send({
        error: {
          code: "INVALID_MCP_CALL",
          message: "Choisissez un outil de lecture et ses seuls paramètres autorisés.",
        },
      });
    }
    const tool = input.tool === "READ_FILE_SCOPED" ? mcpReadFileTool : mcpSearchFilesTool;
    const identity = authorize(request, tool);
    if (!options.locked || !binding)
      return reply.code(503).send({
        error: {
          code: "MCP_NOT_CONFIGURED",
          message: "Configurez le dossier de lecture et une session locale verrouillée.",
        },
      });

    // Guard synchrone avant tout await ; compteur borné par la seule configuration serveur.
    const time = Date.now();
    if (time >= windowEnd) {
      calls = 0;
      windowEnd = time + 60_000;
    }
    if (busy || calls >= 60)
      return reply
        .code(429)
        .header("Retry-After", String(Math.max(1, Math.ceil((windowEnd - time) / 1000))))
        .send({
          error: { code: "MCP_RATE_LIMITED", message: "Lecture en cours ou limite de 60 appels par minute atteinte." },
        });
    busy = true;
    calls++;
    const controller = new AbortController();
    active = controller;
    const timer = setTimeout(() => controller.abort(), 5_000);
    const cancel = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    request.raw.once("aborted", cancel);
    reply.raw.once("close", cancel);
    const runId = `mcp_${randomUUID().replaceAll("-", "")}`;
    let audited = false;
    let executing = false;
    async function audit(outcome: "REQUESTED" | "SUCCEEDED" | "FAILED") {
      await database.pglite.query(
        "INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload) VALUES ($1, $2, $3, 'mcp.tool.call', 'MCP_TOOL_CALL', $4, $5::json)",
        [
          `act_${randomUUID().replaceAll("-", "")}`,
          identity.workspaceId,
          identity.userId,
          runId,
          JSON.stringify({
            toolKey: tool.toolKey,
            outcome,
            sessionId: identity.session.id,
            clientInstanceId: identity.clientInstance.id,
          }),
        ],
      );
    }
    try {
      await audit("REQUESTED");
      audited = true;
      await options.revalidate(request, tool);
      controller.signal.throwIfAborted();
      executing = true;
      const data = await executeScopedMcp(binding, input, controller.signal);
      executing = false;
      controller.signal.throwIfAborted();
      await options.revalidate(request, tool);
      await audit("SUCCEEDED");
      await options.revalidate(request, tool);
      controller.signal.throwIfAborted();
      return { data };
    } catch (error) {
      if (audited) await audit("FAILED").catch(() => undefined);
      await options.revalidate(request, tool);
      if (isAuthorizationError(error)) throw error;
      return reply.code(executing ? 502 : 503).send({
        error: { code: "MCP_CALL_UNAVAILABLE", message: "Lecture indisponible ou non validée. Aucun résultat livré." },
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
