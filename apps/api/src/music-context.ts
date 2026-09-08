import { randomUUID } from "node:crypto";
import type { EnvironmentBrainProfile, EnvironmentInvocation } from "@ida/contracts/environment-brains";
import { type IntelligenceScope, intelligencePolicySchema, intelligenceScopeSchema } from "@ida/contracts/intelligence";
import {
  type MusicContextQuery,
  type MusicContextRows,
  musicContextQuerySchema,
  musicContextRowsSchema,
} from "@ida/contracts/music-context";
import { type AgentRegistry, authorizeEnvironmentContext, IntelligenceError, type ToolGateway } from "@ida/domain";
import { assertIntelligenceIdentity, type IntelligenceAccessSource } from "./core-intelligence.js";

export type { MusicContextQuery, MusicContextRows, MusicMediaFact, MusicTrackFact } from "@ida/contracts/music-context";
export { musicContextQuerySchema };
export interface MusicContextStore {
  // Infrastructure serveur seulement : ce port ne constitue pas une autorisation.
  read(scope: IntelligenceScope, query: MusicContextQuery): Promise<MusicContextRows>;
}
export type MusicContextAudit = {
  runId: string;
  scope: IntelligenceScope;
  environmentKey: "music";
  agentKey: "agent_music_librarian";
  intent: MusicContextQuery["intent"];
  outcome: "ATTEMPT" | "SUCCEEDED" | "DENIED";
};
export type MusicContextSnapshot = {
  version: "music-context.v1";
  scope: IntelligenceScope;
  invocation: EnvironmentInvocation;
  dataClasses: ["PRIVATE_CREATIVE"];
  capturedAt: string;
  facts: MusicContextRows;
};

/** Sélection déterministe, sans modèle, outil d'écriture, cache ou stockage de prompt. */
export class MusicContextBroker {
  constructor(
    private readonly options: {
      profileVersion: string;
      agents: AgentRegistry;
      access: IntelligenceAccessSource;
      gateway: ToolGateway;
      store: MusicContextStore;
      // Autorité runtime synchrone, pas un cache d'une policy persistée périmée.
      getProfile: (scope: IntelligenceScope, key: "music") => EnvironmentBrainProfile;
      audit: (event: MusicContextAudit) => Promise<void>;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async authorize(scope: IntelligenceScope, invocation: EnvironmentInvocation, signal?: AbortSignal) {
    if (signal?.aborted) throw new IntelligenceError("CANCELLED");
    try {
      const current = await this.options.access.loadCurrent(structuredClone(scope));
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
    } catch {
      throw new IntelligenceError("FORBIDDEN");
    }
    if (signal?.aborted) throw new IntelligenceError("CANCELLED");
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
