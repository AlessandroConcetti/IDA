import { randomUUID } from "node:crypto";
import {
  type IdaCommand,
  type IdaCommandIntent,
  idaCommandInputSchema,
  idaCommandSchema,
  type PermissionLevel,
  type SystemStatus,
  systemStatusSchema,
} from "@ida/contracts";
import { ToolGateway } from "@ida/domain";

import type { DemoDatabase, MediaAsset, TodayItem } from "./database.js";
import { demoContext } from "./demo-context.js";

export class CommandInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_COMMAND";

  constructor(message: string) {
    super(message);
    this.name = "CommandInputError";
  }
}

type DeterministicCommandKind = "TODAY" | "UNUSED_CONTENT" | "SYSTEM" | "HELP";

export type CommandToolUse = {
  key: string;
  moduleKey: "TASKS" | "CONTENT" | "SYSTEM" | "IDA";
  permission: PermissionLevel;
};

export type CommandResponse = {
  command: IdaCommand;
  kind: DeterministicCommandKind;
  message: string;
  tools: CommandToolUse[];
  result: {
    items?: TodayItem[] | MediaAsset[];
    system?: SystemStatus[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/gu, " ")
    .trim();
}

function classify(message: string): { kind: DeterministicCommandKind; intent: IdaCommandIntent } {
  const normalized = normalize(message);

  if (
    normalized.includes("aujourd'hui") ||
    normalized.includes("aujourdhui") ||
    normalized.includes("today") ||
    normalized.includes("prepare ma journee") ||
    normalized.includes("prepare demain")
  ) {
    return { kind: "TODAY", intent: "PREPARE_DAY" };
  }

  if (
    normalized.includes("inutilise") ||
    normalized.includes("unused") ||
    normalized.includes("jamais publie") ||
    normalized.includes("jamais utilise")
  ) {
    return { kind: "UNUSED_CONTENT", intent: "LIST_UNUSED_CONTENT" };
  }

  if (
    normalized.includes("system") ||
    normalized.includes("statut") ||
    normalized.includes("etat") ||
    normalized.includes("fonctionne")
  ) {
    return { kind: "SYSTEM", intent: "UNKNOWN" };
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

function getMessageFromBody(body: unknown): string {
  if (!isRecord(body) || typeof body.message !== "string") {
    throw new CommandInputError("Le champ message est obligatoire.");
  }

  return body.message;
}

export class DeterministicIdaCore {
  private readonly gateway: ToolGateway;

  constructor(
    private readonly database: DemoDatabase,
    gateway = new ToolGateway(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.gateway = gateway;
  }

  async execute(body: unknown): Promise<CommandResponse> {
    // Le workspace du client est délibérément ignoré : l'auth réelle remplacera
    // ce contexte local sans laisser le client choisir un autre périmètre.
    const input = idaCommandInputSchema.safeParse({
      workspaceId: demoContext.workspaceId,
      message: getMessageFromBody(body),
    });

    if (!input.success) {
      throw new CommandInputError("La commande doit contenir un message non vide.");
    }

    const classified = classify(input.data.message);
    const timestamp = this.now().toISOString();
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
      case "TODAY": {
        const tool: CommandToolUse = { key: "get_today", moduleKey: "TASKS", permission: "READ" };
        this.gateway.assertAuthorized({ toolKey: tool.key, moduleKey: tool.moduleKey, permission: tool.permission });
        const items = await this.database.listToday(demoContext.workspaceId);

        return {
          command,
          kind: classified.kind,
          message:
            items.length === 0
              ? "Ton agenda IDA est libre pour le moment."
              : `Aujourd’hui, tu as ${items.length} élément${items.length > 1 ? "s" : ""} à suivre dans IDA.`,
          tools: [tool],
          result: { items },
        };
      }
      case "UNUSED_CONTENT": {
        const tool: CommandToolUse = { key: "search_unused_media", moduleKey: "CONTENT", permission: "READ" };
        this.gateway.assertAuthorized({ toolKey: tool.key, moduleKey: tool.moduleKey, permission: tool.permission });
        const items = await this.database.listMedia(demoContext.workspaceId, "UNUSED");

        return {
          command,
          kind: classified.kind,
          message:
            items.length === 0
              ? "Je n’ai trouvé aucun contenu inutilisé dans ton workspace."
              : `J’ai trouvé ${items.length} contenu${items.length > 1 ? "s" : ""} inutilisé${items.length > 1 ? "s" : ""} à exploiter.`,
          tools: [tool],
          result: { items },
        };
      }
      case "SYSTEM": {
        const tool: CommandToolUse = { key: "get_system_status", moduleKey: "SYSTEM", permission: "READ" };
        this.gateway.assertAuthorized({ toolKey: tool.key, moduleKey: tool.moduleKey, permission: tool.permission });
        const system = currentSystemStatus(timestamp);

        return {
          command,
          kind: classified.kind,
          message:
            "IDA est en mode démo local : la base est prête, les intégrations externes ne sont pas encore connectées.",
          tools: [tool],
          result: { system },
        };
      }
      case "HELP": {
        const tool: CommandToolUse = { key: "describe_supported_commands", moduleKey: "IDA", permission: "READ" };
        this.gateway.assertAuthorized({ toolKey: tool.key, moduleKey: tool.moduleKey, permission: tool.permission });

        return {
          command,
          kind: classified.kind,
          message:
            "Je peux actuellement résumer ta journée, lister les contenus inutilisés et expliquer l’état du système. Essaie : « Qu’est-ce que j’ai aujourd’hui ? »",
          tools: [tool],
          result: {},
        };
      }
    }
  }

  getSystemStatus(): SystemStatus[] {
    return currentSystemStatus(this.now().toISOString());
  }
}
