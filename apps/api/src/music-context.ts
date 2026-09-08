import { randomUUID } from "node:crypto";
import type { EnvironmentBrainProfile, EnvironmentInvocation } from "@ida/contracts/environment-brains";
import { type IntelligenceScope, intelligencePolicySchema, intelligenceScopeSchema } from "@ida/contracts/intelligence";
import type { MusicContextAudit } from "@ida/contracts/intelligence-audit";
import {
  type MusicContextQuery,
  type MusicContextRows,
  musicContextQuerySchema,
  musicContextRowsSchema,
} from "@ida/contracts/music-context";
import {
  type AgentRegistry,
  authorizeEnvironmentContext,
  IntelligenceError,
  sameIntelligenceScope,
  type ToolGateway,
} from "@ida/domain";
import { assertIntelligenceIdentity, type IntelligenceAccessSource } from "./core-intelligence.js";

export type { MusicContextAudit } from "@ida/contracts/intelligence-audit";
export type { MusicContextQuery, MusicContextRows, MusicMediaFact, MusicTrackFact } from "@ida/contracts/music-context";
export { musicContextQuerySchema };
export interface MusicContextStore {
  // Infrastructure serveur seulement : ce port ne constitue pas une autorisation.
  read(scope: IntelligenceScope, query: MusicContextQuery): Promise<MusicContextRows>;
}
export interface MusicContextAuthority {
  // Identité et faits du MÊME snapshot persistant ; policy runtime courante à la sortie.
  loadCurrent(
    scope: IntelligenceScope,
    query: MusicContextQuery,
  ): Promise<Awaited<ReturnType<IntelligenceAccessSource["loadCurrent"]>> & { facts: MusicContextRows }>;
}
export type MusicContextSnapshot = {
  version: "music-context.v1";
  scope: IntelligenceScope;
  invocation: EnvironmentInvocation;
  dataClasses: ["PRIVATE_CREATIVE"];
  capturedAt: string;
  facts: MusicContextRows;
};
export type MusicContextBrokerOptions = {
  profileVersion: string;
  agents: AgentRegistry;
  access: IntelligenceAccessSource;
  gateway: ToolGateway;
  store: MusicContextStore;
  // Autorité runtime synchrone, pas un cache d'une policy persistée périmée.
  getProfile: (scope: IntelligenceScope, key: "music") => EnvironmentBrainProfile;
  audit: (event: MusicContextAudit) => Promise<void>;
  now?: () => Date;
};

/** Sélection déterministe, sans modèle, outil d'écriture, cache ou stockage de prompt. */
export class MusicContextBroker {
  constructor(private readonly options: MusicContextBrokerOptions) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async authorize(scope: IntelligenceScope, invocation: EnvironmentInvocation, signal?: AbortSignal) {
    if (signal?.aborted) throw new IntelligenceError("CANCELLED");
    try {
      const current = await this.options.access.loadCurrent(structuredClone(scope));
      return this.validateAccess(scope, invocation, current, signal);
    } catch {
      if (signal?.aborted) throw new IntelligenceError("CANCELLED");
      throw new IntelligenceError("FORBIDDEN");
    }
  }

  private validateAccess(
    scope: IntelligenceScope,
    invocation: EnvironmentInvocation,
    current: Awaited<ReturnType<IntelligenceAccessSource["loadCurrent"]>>,
    signal?: AbortSignal,
  ) {
    try {
      assertIntelligenceIdentity(scope, current.identity, this.now());
      const profile = this.options.getProfile(structuredClone(scope), "music");
      const policy = intelligencePolicySchema.parse(current.policy);
      if (policy.mode !== "AI") throw new IntelligenceError("FORBIDDEN");
      authorizeEnvironmentContext(profile, invocation, ["PRIVATE_CREATIVE"], this.options.agents);
      const tool =
        invocation.intent === "SEARCH_TRACK"
          ? ({ key: "list_tracks", moduleKey: "MUSIC", permission: "READ" } as const)
          : ({ key: "search_media", moduleKey: "CONTENT", permission: "READ" } as const);
      this.options.agents.assertActiveTool("agent_music_librarian", tool);
      this.options.gateway.assertAuthorized({
        toolKey: tool.key,
        moduleKey: tool.moduleKey,
        permission: tool.permission,
      });
      if (signal?.aborted) throw new IntelligenceError("CANCELLED");
      return current;
    } catch {
      if (signal?.aborted) throw new IntelligenceError("CANCELLED");
      throw new IntelligenceError("FORBIDDEN");
    }
  }

  /** Composition interne uniquement : aucune entrée cliente ne peut fournir les faits à protéger. */
  async prepare(
    rawScope: IntelligenceScope,
    rawQuery: unknown,
    authority: MusicContextAuthority,
    signal?: AbortSignal,
  ) {
    const queryResult = musicContextQuerySchema.safeParse(rawQuery);
    if (!queryResult.success) throw new IntelligenceError("INVALID_REQUEST");
    const query = queryResult.data;
    const snapshot = await this.read(rawScope, query, signal);
    // La fermeture conserve une copie distincte de celle remise au consommateur.
    const expected = structuredClone(snapshot);
    const access: IntelligenceAccessSource = {
      loadCurrent: async (scope) => {
        const parsedScope = intelligenceScopeSchema.safeParse(scope);
        if (!parsedScope.success || !sameIntelligenceScope(parsedScope.data, expected.scope)) {
          throw new IntelligenceError("FORBIDDEN");
        }
        await this.authorize(expected.scope, expected.invocation, signal);
        try {
          const current = await authority.loadCurrent(structuredClone(expected.scope), structuredClone(query));
          const facts = musicContextRowsSchema.safeParse(current.facts);
          // Comparer toute la projection, y compris les IDs/timestamps. Une même date ne suffit pas.
          if (!facts.success || JSON.stringify(facts.data) !== JSON.stringify(expected.facts)) {
            throw new IntelligenceError("FORBIDDEN");
          }
          // Aucune nouvelle attente SQL après cet instantané agrégé.
          this.validateAccess(expected.scope, expected.invocation, current, signal);
          return { identity: current.identity, policy: current.policy };
        } catch {
          if (signal?.aborted) throw new IntelligenceError("CANCELLED");
          throw new IntelligenceError("FORBIDDEN");
        }
      },
    };
    return { snapshot, access };
  }

  private async log(event: MusicContextAudit) {
    try {
      await this.options.audit(structuredClone(event));
    } catch {
      throw new IntelligenceError("AUDIT_UNAVAILABLE");
    }
  }

  async read(rawScope: IntelligenceScope, rawQuery: unknown, signal?: AbortSignal): Promise<MusicContextSnapshot> {
    const scopeResult = intelligenceScopeSchema.safeParse(rawScope);
    const queryResult = musicContextQuerySchema.safeParse(rawQuery);
    if (!scopeResult.success || !queryResult.success) throw new IntelligenceError("INVALID_REQUEST");
    const scope = scopeResult.data;
    const query = queryResult.data;
    const invocation: EnvironmentInvocation = {
      environmentKey: "music",
      profileVersion: this.options.profileVersion,
      agentKey: "agent_music_librarian",
      intent: query.intent,
      contextSources: [query.intent === "SEARCH_TRACK" ? "MUSIC_CATALOG" : "CONTENT_LIBRARY"],
    };
    const event: MusicContextAudit = {
      runId: randomUUID(),
      scope,
      environmentKey: "music",
      agentKey: "agent_music_librarian",
      intent: query.intent,
      outcome: "ATTEMPT",
    };
    try {
      await this.authorize(scope, invocation, signal);
      await this.log(event);
      // L'audit peut lui aussi attendre ; l'accès est recalculé avant la lecture SQL.
      await this.authorize(scope, invocation, signal);
      const capturedAt = this.now().toISOString();
      const parsed = musicContextRowsSchema.safeParse(
        await this.options.store.read(structuredClone(scope), structuredClone(query)),
      );
      if (!parsed.success) throw new IntelligenceError("INVALID_RESPONSE");
      const facts = parsed.data;
      const selected = query.intent === "SEARCH_TRACK" ? facts.tracks : facts.media;
      if (
        selected.length > query.limit ||
        new Set(selected.map((row) => row.id)).size !== selected.length ||
        (query.intent === "SEARCH_TRACK" ? facts.media.length !== 0 : facts.tracks.length !== 0)
      ) {
        throw new IntelligenceError("INVALID_RESPONSE");
      }
      await this.authorize(scope, invocation, signal);
      await this.log({ ...event, outcome: "SUCCEEDED" });
      await this.authorize(scope, invocation, signal);
      // Snapshot informatif, PAS un jeton d'autorisation réutilisable pour une inférence.
      return {
        version: "music-context.v1",
        scope,
        invocation,
        dataClasses: ["PRIVATE_CREATIVE"],
        capturedAt,
        facts,
      };
    } catch (error) {
      await this.log({ ...event, outcome: "DENIED" });
      if (error instanceof IntelligenceError) throw new IntelligenceError(error.code);
      throw new IntelligenceError("UNAVAILABLE");
    }
  }
}
