import type { IntelligenceScope } from "@ida/contracts/intelligence";
import { intelligencePolicySchema, intelligenceScopeSchema } from "@ida/contracts/intelligence";
import type { MusicContextQuery } from "@ida/contracts/music-context";
import { musicContextQuerySchema } from "@ida/contracts/music-context";
import { IntelligenceError, sameIntelligenceScope } from "@ida/domain";
import { assertIntelligenceIdentity } from "./core-intelligence.js";
import type { DemoDatabase } from "./database.js";
import { LocalIntelligenceAccess } from "./local-intelligence-access.js";
import type { MusicContextAuthority } from "./music-context.js";
import { createMusicContextStore } from "./music-context-store.js";

/** Vue persistante cohérente, brève et en lecture seule ; jamais de réseau/audit sous transaction. */
export class LocalMusicContextAuthority implements MusicContextAuthority {
  private readonly scope: IntelligenceScope;
  constructor(
    private readonly options: ConstructorParameters<typeof LocalIntelligenceAccess>[0] & { database: DemoDatabase },
  ) {
    const parsed = intelligenceScopeSchema.safeParse(options.authenticatedScope);
    if (!parsed.success) throw new IntelligenceError("FORBIDDEN");
    this.scope = parsed.data;
  }

  async loadCurrent(rawScope: IntelligenceScope, rawQuery: MusicContextQuery) {
    try {
      const scope = intelligenceScopeSchema.parse(rawScope);
      const query = musicContextQuerySchema.parse(rawQuery);
      if (!sameIntelligenceScope(scope, this.scope)) throw new IntelligenceError("FORBIDDEN");
      const now = () => this.options.now?.() ?? new Date();
      const snapshot = await this.options.database.pglite.transaction(async (transaction) => {
        await transaction.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
        const access = new LocalIntelligenceAccess({
          ...this.options,
          authenticatedScope: structuredClone(this.scope),
          database: {
            resolveRequestIdentityContext: (sessionId, workspaceId, at) =>
              this.options.database.resolveRequestIdentityContext(sessionId, workspaceId, at, transaction),
          },
        });
        const { identity } = await access.loadCurrent(scope);
        const facts = await createMusicContextStore({ pglite: transaction }).read(scope, query);
        return { identity, facts };
      });
      assertIntelligenceIdentity(scope, snapshot.identity, now());
      // Lire la policy runtime après la transaction ; pas de cache du début de lecture.
      const policy = intelligencePolicySchema.parse(this.options.getPolicy(structuredClone(scope)));
      return { ...snapshot, policy };
    } catch {
      throw new IntelligenceError("FORBIDDEN");
    }
  }
}
