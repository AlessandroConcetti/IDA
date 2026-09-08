import {
  type IntelligencePolicy,
  type IntelligenceScope,
  intelligencePolicySchema,
  intelligenceScopeSchema,
} from "@ida/contracts/intelligence";
import { IntelligenceError, sameIntelligenceScope } from "@ida/domain";
import { assertIntelligenceIdentity, type IntelligenceAccessSource } from "./core-intelligence.js";
import type { DemoDatabase } from "./database.js";

/** Revalide un travail déjà authentifié par LOCAL_LOCK, sans conserver son cookie.
 * Ne remplace pas l'authentification HTTP et n'accepte pas la session de démo.
 */
export class LocalIntelligenceAccess implements IntelligenceAccessSource {
  private readonly boundScope: IntelligenceScope;
  constructor(
    private readonly options: {
      database: Pick<DemoDatabase, "resolveRequestIdentityContext">;
      authenticatedScope: IntelligenceScope;
      // Lecture sans effet de l'autorité runtime, synchrone : aucun await après l'identité.
      getPolicy: (scope: IntelligenceScope) => IntelligencePolicy;
      now?: () => Date;
    },
  ) {
    const parsed = intelligenceScopeSchema.safeParse(options.authenticatedScope);
    if (!parsed.success) throw new IntelligenceError("FORBIDDEN");
    this.boundScope = parsed.data;
  }

  async loadCurrent(rawScope: IntelligenceScope) {
    try {
      const scope = intelligenceScopeSchema.parse(rawScope);
      if (!sameIntelligenceScope(scope, this.boundScope)) throw new IntelligenceError("FORBIDDEN");
      const now = () => this.options.now?.() ?? new Date();
      const identity = await this.options.database.resolveRequestIdentityContext(
        scope.sessionId,
        scope.workspaceId,
        now().toISOString(),
      );
      if (!identity) throw new IntelligenceError("FORBIDDEN");
      assertIntelligenceIdentity(scope, identity, now());
      const policy = intelligencePolicySchema.parse(this.options.getPolicy(structuredClone(scope)));
      return { identity, policy };
    } catch {
      throw new IntelligenceError("FORBIDDEN");
    }
  }
}
