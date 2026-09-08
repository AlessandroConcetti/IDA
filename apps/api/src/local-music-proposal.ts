import type { EnvironmentBrainProfile } from "@ida/contracts/environment-brains";
import type { IntelligencePolicy, IntelligenceScope } from "@ida/contracts/intelligence";
import type { AgentRegistry, ProviderRegistry, ToolGateway } from "@ida/domain";
import type { DemoDatabase } from "./database.js";
import { createPersistentIntelligenceAudit } from "./intelligence-audit.js";
import { LocalIntelligenceAccess } from "./local-intelligence-access.js";
import { LocalMusicContextAuthority } from "./local-music-context-authority.js";
import { createMusicContextStore } from "./music-context-store.js";
import { MusicProposalService } from "./music-proposal.js";

/** Composition serveur, sans activation, login, HTTP ou modification de profil.
 * Le scope doit déjà provenir de l'authentification serveur, jamais d'un body client.
 */
export function createLocalMusicProposalService(options: {
  database: DemoDatabase;
  authenticatedScope: IntelligenceScope;
  registry: ProviderRegistry;
  agents: AgentRegistry;
  gateway: ToolGateway;
  profileVersion: string;
  getPolicy: (scope: IntelligenceScope) => IntelligencePolicy;
  getProfile: (scope: IntelligenceScope, key: "music") => EnvironmentBrainProfile;
  now?: () => Date;
}): MusicProposalService {
  const audit = createPersistentIntelligenceAudit(options.database, options.authenticatedScope);
  return new MusicProposalService({
    ...options,
    access: new LocalIntelligenceAccess(options),
    contextAuthority: new LocalMusicContextAuthority(options),
    store: createMusicContextStore(options.database),
    audit,
  });
}
