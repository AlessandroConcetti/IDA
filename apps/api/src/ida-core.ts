import { randomUUID } from "node:crypto";
import {
  type ContentRotationCandidate as ContentRotationCandidateContract,
  type IdaCommand,
  type IdaCommandIntent,
  idaCommandInputSchema,
  idaCommandSchema,
  type PermissionLevel,
  type RequestIdentityContext,
  type SystemStatus,
  systemStatusSchema,
} from "@ida/contracts";
import type { IntelligenceRequest, IntelligenceText } from "@ida/contracts/intelligence";
import {
  IdentityAccessPolicy,
  IntelligenceError,
  type IntelligencePort,
  sameIntelligenceScope,
  ToolGateway,
} from "@ida/domain";

import { toContentRotationCandidateResponse } from "./content-rotation.js";
import { intelligenceProposalTool } from "./core-intelligence.js";
import type { DemoDatabase, TodayItem } from "./database.js";
import { getWorkspaceDayRange } from "./workspace-time.js";

export class CommandInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_COMMAND";

  constructor(message: string) {
    super(message);
    this.name = "CommandInputError";
  }
}

type DeterministicCommandKind = "TODAY" | "TOMORROW" | "UNUSED_CONTENT" | "SYSTEM" | "HELP";

type SocialPlatformDiagnostic = "Instagram" | "TikTok" | "YouTube" | "Facebook";

export type CommandToolUse = {
  key: string;
  moduleKey: "TASKS" | "CONTENT" | "SYSTEM" | "IDA";
  permission: PermissionLevel;
};

export type CommandResponse = {
  command: IdaCommand;
  commandRunId: string;
  state: IdaCommand["state"];
  kind: DeterministicCommandKind;
  message: string;
  tools: CommandToolUse[];
  result: {
    items?: TodayItem[] | ContentRotationCandidateContract[];
    system?: SystemStatus[];
  };
};

type CommandCompletion = Omit<CommandResponse, "command" | "commandRunId" | "state">;

const idaCoreAllowedTools = [
  intelligenceProposalTool,
  { toolKey: "get_today", moduleKey: "TASKS", permission: "READ" },
  { toolKey: "list_content_rotation_candidates", moduleKey: "CONTENT", permission: "READ" },
  { toolKey: "get_system_status", moduleKey: "SYSTEM", permission: "READ" },
  { toolKey: "describe_supported_commands", moduleKey: "IDA", permission: "READ" },
  // L'écriture locale n'est pas exposée dans la réponse de commande. Elle
  // doit néanmoins rester explicitement allowlistée côté serveur.
  { toolKey: "persist_command_history", moduleKey: "IDA", permission: "WRITE" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[’‘`]/gu, "'")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/gu, " ")
    .trim();
}

function socialPlatformFromMessage(normalizedMessage: string): SocialPlatformDiagnostic | undefined {
  if (normalizedMessage.includes("instagram")) {
    return "Instagram";
  }

  if (normalizedMessage.includes("tiktok")) {
    return "TikTok";
  }

  if (normalizedMessage.includes("youtube")) {
    return "YouTube";
  }

  if (normalizedMessage.includes("facebook")) {
    return "Facebook";
  }

  return undefined;
}

function classify(message: string): {
  kind: DeterministicCommandKind;
  intent: IdaCommandIntent;
  dayOffset?: 0 | 1;
  socialPlatform?: SocialPlatformDiagnostic;
} {
  const normalized = normalize(message);
  const socialPlatform = socialPlatformFromMessage(normalized);

  if (normalized.includes("demain") || normalized.includes("tomorrow")) {
    return { kind: "TOMORROW", intent: "PREPARE_DAY", dayOffset: 1 };
  }

  if (
    normalized.includes("aujourd'hui") ||
    normalized.includes("aujourdhui") ||
    normalized.includes("today") ||
    normalized.includes("prepare ma journee")
  ) {
    return { kind: "TODAY", intent: "PREPARE_DAY", dayOffset: 0 };
  }

  if (normalized.includes("inutilise") || normalized.includes("unused")) {
    return { kind: "UNUSED_CONTENT", intent: "LIST_UNUSED_CONTENT" };
  }

  if (
    normalized.includes("system") ||
    normalized.includes("statut") ||
    normalized.includes("etat") ||
    normalized.includes("fonctionne") ||
    (socialPlatform !== undefined &&
      (normalized.includes("pourquoi") ||
        normalized.includes("why") ||
        normalized.includes("probleme") ||
        normalized.includes("connecte")))
  ) {
    return { kind: "SYSTEM", intent: "UNKNOWN", socialPlatform };
  }

  return { kind: "HELP", intent: "UNKNOWN" };
}

function currentSystemStatus(now: string): SystemStatus[] {
  return [
    { component: "AI", state: "ONLINE", message: "Mode déterministe local actif.", checkedAt: now },
    { component: "DATABASE", state: "ONLINE", message: "PGlite local prêt.", checkedAt: now },
    { component: "STORAGE", state: "WARNING", message: "Bibliothèque démo locale uniquement.", checkedAt: now },
    {
      component: "SOCIAL_ACCOUNTS",
      state: "DISCONNECTED",
      message: "Aucun compte social connecté dans cette tranche.",
      checkedAt: now,
    },
    { component: "SCHEDULER", state: "WARNING", message: "Le scheduler n'est pas encore implémenté.", checkedAt: now },
    {
      component: "NOTIFICATIONS",
      state: "WARNING",
      message: "Les notifications ne sont pas encore implémentées.",
      checkedAt: now,
    },
  ].map((status) => systemStatusSchema.parse(status));
}

function systemMessage(socialPlatform?: SocialPlatformDiagnostic): string {
  if (socialPlatform) {
    return `${socialPlatform} n’est pas connecté à IDA dans cette tranche locale. Sa matrice de capacités est seulement déclarative : aucun compte lié, OAuth lancé, token ni autorisation de publication n’est actif.`;
  }

  return "IDA est en mode démo local : la base est prête, les intégrations externes ne sont pas encore connectées.";
}

function getMessageFromBody(body: unknown): string {
  if (!isRecord(body) || typeof body.message !== "string") {
    throw new CommandInputError("Le champ message est obligatoire.");
  }

  return body.message;
}

export class DeterministicIdaCore {
  private readonly gateway: ToolGateway;
  private readonly identityPolicy = new IdentityAccessPolicy();

  constructor(
    private readonly database: DemoDatabase,
    gateway = new ToolGateway(undefined, idaCoreAllowedTools),
    private readonly now: () => Date = () => new Date(),
    private readonly intelligence?: IntelligencePort,
  ) {
    this.gateway = gateway;
  }

  // Point de branchement interne. Le chat déterministe n'active jamais l'IA
  // implicitement ; la composition serveur devra injecter CoreIntelligence.
  async generateProposal(
    identity: RequestIdentityContext,
    request: IntelligenceRequest,
    signal?: AbortSignal,
  ): Promise<IntelligenceText> {
    this.assertAuthorized(
      identity,
      { key: intelligenceProposalTool.toolKey, moduleKey: "IDA", permission: "READ" },
      this.now(),
    );
    if (
      !this.intelligence ||
      !sameIntelligenceScope(request.scope, {
        userId: identity.userId,
        workspaceId: identity.workspaceId,
        sessionId: identity.session.id,
        clientInstanceId: identity.clientInstance.id,
      })
    )
      throw new IntelligenceError("FORBIDDEN");
    return this.intelligence.generate(request, signal);
  }

  private assertAuthorized(
    identity: RequestIdentityContext,
    tool: { key: string; moduleKey: CommandToolUse["moduleKey"]; permission: PermissionLevel },
    now: Date,
  ): void {
    this.identityPolicy.assertAuthorized({ context: identity, permission: tool.permission, now });
    this.gateway.assertAuthorized({ toolKey: tool.key, moduleKey: tool.moduleKey, permission: tool.permission });
  }

  private async complete(
    identity: RequestIdentityContext,
    authorizationNow: Date,
    command: IdaCommand,
    completion: CommandCompletion,
  ): Promise<CommandResponse> {
    const response: CommandResponse = {
      command,
      commandRunId: command.id,
      state: command.state,
      ...completion,
    };

    // L'historique est un effet WRITE distinct de la commande READ. Il reste
    // consultable après rechargement lorsque le contexte autorise cette
    // écriture, mais ne transforme jamais une simple lecture en refus pour une
    // instance VIEW_ONLY.
    const historyPermission = this.identityPolicy.evaluate({
      context: identity,
      permission: "WRITE",
      now: authorizationNow,
    });

    if (historyPermission.allowed) {
      this.gateway.assertAuthorized({
        toolKey: "persist_command_history",
        moduleKey: "IDA",
        permission: "WRITE",
      });
      await this.database.createCommandRun(identity.workspaceId, identity.userId, {
        id: command.id,
        intent: command.intent,
        state: command.state,
        requestedPermission: command.requestedPermission,
        message: command.message,
        responseMessage: response.message,
        createdAt: command.createdAt,
      });
    }

    return response;
  }

  async execute(identity: RequestIdentityContext, body: unknown): Promise<CommandResponse> {
    const input = idaCommandInputSchema.safeParse({
      workspaceId: identity.workspaceId,
      message: getMessageFromBody(body),
    });

    if (!input.success) {
      throw new CommandInputError("La commande doit contenir un message non vide.");
    }

    const classified = classify(input.data.message);
    const commandNow = this.now();
    const timestamp = commandNow.toISOString();
    const command = idaCommandSchema.parse({
      id: `cmd_${randomUUID()}`,
      ...input.data,
      intent: classified.intent,
      state: "COMPLETED",
      requestedPermission: "READ",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    switch (classified.kind) {
      case "TODAY":
      case "TOMORROW": {
        const tool: CommandToolUse = { key: "get_today", moduleKey: "TASKS", permission: "READ" };
        this.assertAuthorized(identity, tool, commandNow);
        const timezone = await this.database.getWorkspaceTimezone(identity.workspaceId);

        if (!timezone) {
          throw new Error("Le fuseau du workspace est introuvable.");
        }

        const dayRange = getWorkspaceDayRange(commandNow, timezone, classified.dayOffset ?? 0);
        const items = await this.database.listToday(identity.workspaceId, dayRange.from, dayRange.to);
        const dayLabel = classified.kind === "TODAY" ? "Aujourd’hui" : "Demain";

        return this.complete(identity, commandNow, command, {
          kind: classified.kind,
          message:
            items.length === 0
              ? `${dayLabel}, ton agenda IDA est libre pour le moment.`
              : `${dayLabel}, tu as ${items.length} élément${items.length > 1 ? "s" : ""} à suivre dans IDA.`,
          tools: [tool],
          result: { items },
        });
      }
      case "UNUSED_CONTENT": {
        const tool: CommandToolUse = {
          key: "list_content_rotation_candidates",
          moduleKey: "CONTENT",
          permission: "READ",
        };
        this.assertAuthorized(identity, tool, commandNow);
        const items = (await this.database.listContentRotationCandidates(identity.workspaceId, 12)).map(
          toContentRotationCandidateResponse,
        );

        return this.complete(identity, commandNow, command, {
          kind: classified.kind,
          message:
            items.length === 0
              ? "Je n’ai trouvé aucun média réellement disponible à proposer. Les médias déjà liés à une proposition restent exclus."
              : `J’ai trouvé ${items.length} média${items.length > 1 ? "s" : ""} réellement disponible${items.length > 1 ? "s" : ""} à proposer.`,
          tools: [tool],
          result: { items },
        });
      }
      case "SYSTEM": {
        const tool: CommandToolUse = { key: "get_system_status", moduleKey: "SYSTEM", permission: "READ" };
        this.assertAuthorized(identity, tool, commandNow);
        const system = currentSystemStatus(timestamp);

        return this.complete(identity, commandNow, command, {
          kind: classified.kind,
          message: systemMessage(classified.socialPlatform),
          tools: [tool],
          result: { system },
        });
      }
      case "HELP": {
        const tool: CommandToolUse = { key: "describe_supported_commands", moduleKey: "IDA", permission: "READ" };
        this.assertAuthorized(identity, tool, commandNow);

        return this.complete(identity, commandNow, command, {
          kind: classified.kind,
          message:
            "Je peux actuellement résumer aujourd’hui ou demain, lister les médias réellement disponibles à proposer et expliquer l’état du système. Essaie : « Qu’est-ce que j’ai aujourd’hui ? »",
          tools: [tool],
          result: {},
        });
      }
    }
  }

  getSystemStatus(): SystemStatus[] {
    return currentSystemStatus(this.now().toISOString());
  }
}
