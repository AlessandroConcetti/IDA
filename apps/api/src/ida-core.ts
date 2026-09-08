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
import type { MusicTrackFact } from "@ida/contracts/music-context";
import {
  IdentityAccessPolicy,
  IntelligenceError,
  type IntelligencePort,
  sameIntelligenceScope,
  ToolGateway,
} from "@ida/domain";
import { type CatalogCommand, parseCatalogCommand } from "./catalog-command.js";
import {
  type ChatMediaFact,
  chatLabel,
  dayMessage,
  mediaSearchMessage,
  readChatMedia,
  trackSearchMessage,
} from "./chat-catalog.js";
import { toContentRotationCandidateResponse } from "./content-rotation.js";
import { intelligenceProposalTool } from "./core-intelligence.js";
import type { DemoDatabase, TodayItem } from "./database.js";
import { LocalDemoAuthenticationError } from "./identity-context.js";
import { createMusicContextStore } from "./music-context-store.js";
import { getWorkspaceDayRange } from "./workspace-time.js";

export class CommandInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_COMMAND";

  constructor(message: string) {
    super(message);
    this.name = "CommandInputError";
  }
}

type DeterministicCommandKind = "TODAY" | "TOMORROW" | "UNUSED_CONTENT" | "SYSTEM" | "HELP" | CatalogCommand["kind"];

type SocialPlatformDiagnostic = "Instagram" | "TikTok" | "YouTube" | "Facebook";

export type CommandToolUse = {
  key: string;
  moduleKey: "TASKS" | "CONTENT" | "SYSTEM" | "IDA" | "MUSIC";
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
    tracks?: MusicTrackFact[];
    media?: ChatMediaFact[];
    catalogQuery?: Exclude<CatalogCommand, { kind: "CLARIFY_CATALOG" }>;
  };
};

type CommandCompletion = Omit<CommandResponse, "command" | "commandRunId" | "state">;

const idaCoreAllowedTools = [
  intelligenceProposalTool,
  { toolKey: "get_today", moduleKey: "TASKS", permission: "READ" },
  { toolKey: "list_tracks", moduleKey: "MUSIC", permission: "READ" },
  { toolKey: "search_media", moduleKey: "CONTENT", permission: "READ" },
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
  catalog?: CatalogCommand;
} {
  const normalized = normalize(message)
    .replace(/^ida(?:\s*[,!:]\s*|\s+)/u, "")
    .replace(/[.!?]+$/u, "")
    .trim();
  // Compatibilité : la demande générique historique conserve la rotation
  // éditoriale ; un filtre explicite (vidéo, nom, quantité) cherche la bibliothèque.
  if (
    /^(?:(?:montre(?:-moi| moi)?|liste|affiche) )?(?:(?:mes|les) )?(?:contenus|medias) inutilises$/u.test(normalized) ||
    normalized === "unused content"
  ) {
    return { kind: "UNUSED_CONTENT", intent: "LIST_UNUSED_CONTENT" };
  }
  // Les noms propres restent des données : « morceau Demain » n'est pas un agenda.
  const catalog = parseCatalogCommand(message);
  if (catalog) {
    return {
      kind: catalog.kind,
      intent: catalog.kind === "CLARIFY_CATALOG" ? "UNKNOWN" : catalog.kind,
      catalog,
    };
  }
  const socialPlatform = socialPlatformFromMessage(normalized);
  const day =
    /^(?:(?:prepare|resume|affiche|montre(?:-moi| moi)?) (?:ma journee(?: de)? )?|(?:qu'est-ce que j'ai|qu'est ce que j'ai|que dois-je faire|que dois je faire)(?: a faire)? )?(aujourd'hui|aujourdhui|demain|today|tomorrow)$/u.exec(
      normalized,
    );
  if (day || normalized === "prepare ma journee") {
    const tomorrow = day?.[1] === "demain" || day?.[1] === "tomorrow";
    return { kind: tomorrow ? "TOMORROW" : "TODAY", intent: "PREPARE_DAY", dayOffset: tomorrow ? 1 : 0 };
  }

  if (
    /^(?:(?:montre(?:-moi| moi)?|affiche|explique(?:-moi| moi)?) (?:l'|le )?)?(?:etat|statut)(?: du)? (?:systeme|system|ida)$/u.test(
      normalized,
    ) ||
    /^(?:systeme|system|statut|etat)$/u.test(normalized) ||
    /^(?:pourquoi|why) (?:instagram|tiktok|youtube|facebook) (?:ne fonctionne (?:plus|pas)|n'est pas connecte|est deconnecte)$/u.test(
      normalized,
    ) ||
    /^(?:etat|statut|probleme)(?: de)? (?:instagram|tiktok|youtube|facebook)$/u.test(normalized)
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
    // Relire les droits après la lecture métier. Le contexte HTTP n'est pas
    // une autorisation permanente ; une révocation pendant l'attente est refusée.
    let currentIdentity = identity;
    for (const tool of completion.tools) currentIdentity = await this.refreshIdentity(identity, tool);
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

    const currentHistoryPermission = this.identityPolicy.evaluate({
      context: currentIdentity,
      permission: "WRITE",
      now: this.now(),
    });
    if (historyPermission.allowed && currentHistoryPermission.allowed) {
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

    for (const tool of completion.tools) await this.refreshIdentity(identity, tool);

    return response;
  }

  private async refreshIdentity(
    identity: RequestIdentityContext,
    tool: CommandToolUse,
  ): Promise<RequestIdentityContext> {
    this.assertAuthorized(identity, tool, this.now());
    const current = await this.database.resolveRequestIdentityContext(identity.session.id, identity.workspaceId);
    if (
      !current ||
      current.userId !== identity.userId ||
      current.workspaceId !== identity.workspaceId ||
      current.clientInstance.id !== identity.clientInstance.id ||
      current.session.id !== identity.session.id
    )
      throw new LocalDemoAuthenticationError();
    // Le contexte initial peut avoir une échéance idle plus courte que la session SQL.
    // Ne jamais prolonger cette échéance ou augmenter les droits de la requête.
    this.assertAuthorized(identity, tool, this.now());
    this.assertAuthorized(current, tool, this.now());
    return current;
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
      case "SEARCH_TRACK": {
        const catalog = classified.catalog;
        if (catalog?.kind !== "SEARCH_TRACK") throw new CommandInputError("Recherche de morceau invalide.");
        const tool: CommandToolUse = { key: "list_tracks", moduleKey: "MUSIC", permission: "READ" };
        await this.refreshIdentity(identity, tool);
        // Réutiliser la projection SQL bornée, pas activer le broker IA ou un agent.
        const facts = await createMusicContextStore(this.database).read(
          {
            userId: identity.userId,
            workspaceId: identity.workspaceId,
            sessionId: identity.session.id,
            clientInstanceId: identity.clientInstance.id,
          },
          {
            intent: "SEARCH_TRACK",
            limit: catalog.limit,
            ...(catalog.title === undefined ? {} : { title: catalog.title }),
          },
        );
        return this.complete(identity, commandNow, command, {
          kind: "SEARCH_TRACK",
          message: trackSearchMessage(facts.tracks, catalog.title, catalog.limit),
          tools: [tool],
          result: { tracks: facts.tracks, catalogQuery: catalog },
        });
      }
      case "SEARCH_MEDIA": {
        const catalog = classified.catalog;
        if (catalog?.kind !== "SEARCH_MEDIA") throw new CommandInputError("Recherche de média invalide.");
        const tool: CommandToolUse = { key: "search_media", moduleKey: "CONTENT", permission: "READ" };
        await this.refreshIdentity(identity, tool);
        const media = await readChatMedia(this.database, identity.workspaceId, catalog);
        return this.complete(identity, commandNow, command, {
          kind: "SEARCH_MEDIA",
          message: mediaSearchMessage(media, catalog),
          tools: [tool],
          result: { media, catalogQuery: catalog },
        });
      }
      case "CLARIFY_CATALOG": {
        const catalog = classified.catalog;
        if (catalog?.kind !== "CLARIFY_CATALOG") throw new CommandInputError("Demande invalide.");
        const tool: CommandToolUse = { key: "describe_supported_commands", moduleKey: "IDA", permission: "READ" };
        this.assertAuthorized(identity, tool, commandNow);
        return this.complete(identity, commandNow, command, {
          kind: "CLARIFY_CATALOG",
          message: catalog.message,
          tools: [tool],
          result: {},
        });
      }
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
          message: dayMessage(items, dayLabel, timezone),
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
              : [
                  `J’ai trouvé ${items.length} média${items.length > 1 ? "s" : ""} réellement disponible${items.length > 1 ? "s" : ""} à proposer (aperçu limité à 12).`,
                  ...items.map((item, index) => `${index + 1}. « ${chatLabel(item.filename, 160)} »`),
                  "Source : rotation éditoriale. Les médias déjà liés à une proposition sont exclus. Aucune publication effectuée.",
                ].join("\n"),
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
            "Je peux consulter aujourd’hui ou demain, chercher un morceau par son titre, filtrer la bibliothèque et expliquer l’état du système. Essaie : « Trouve le morceau “Aurore” » ou « Montre-moi cinq vidéos inutilisées ». Pour la disponibilité éditoriale, écris « contenus inutilisés ». Recherche locale sans modèle : je ne comprends pas encore les relances comme « et le deuxième ? », ne génère pas de contenu et ne publie rien.",
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
