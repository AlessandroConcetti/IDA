import type { RequestIdentityContext } from "@ida/contracts";
import type {
  IntelligencePolicy,
  IntelligenceRequest,
  IntelligenceScope,
  IntelligenceText,
} from "@ida/contracts/intelligence";
import {
  IdentityAccessPolicy,
  type IntelligenceAudit,
  IntelligenceError,
  type IntelligencePort,
  type ProviderRegistry,
  ProviderRouter,
  sameIntelligenceScope,
  type ToolGateway,
} from "@ida/domain";

export const intelligenceProposalTool = {
  toolKey: "generate_intelligence_proposal",
  moduleKey: "IDA",
  permission: "READ",
} as const;

export interface IntelligenceAccessSource {
  // Relecture à chaque tentative ET avant livraison ; ne pas réutiliser le snapshot HTTP.
  loadCurrent(scope: IntelligenceScope): Promise<{
    identity: RequestIdentityContext;
    policy: IntelligencePolicy;
  }>;
}

/** Façade commune au Core/agents : autorise une proposition, jamais son exécution. */
export class CoreIntelligence implements IntelligencePort {
  private readonly router: ProviderRouter;
  constructor(options: {
    registry: ProviderRegistry;
    access: IntelligenceAccessSource;
    gateway: ToolGateway;
    audit: (event: IntelligenceAudit) => Promise<void>;
    now?: () => Date;
  }) {
    const now = options.now ?? (() => new Date());
    const identityPolicy = new IdentityAccessPolicy();
    this.router = new ProviderRouter(
      options.registry,
      async (request) => {
        const { identity, policy } = await options.access.loadCurrent(request.scope);
        identityPolicy.assertAuthorized({ context: identity, permission: "READ", now: now() });
        if (
          !sameIntelligenceScope(request.scope, {
            userId: identity.userId,
            workspaceId: identity.workspaceId,
            sessionId: identity.session.id,
            clientInstanceId: identity.clientInstance.id,
          })
        )
          throw new IntelligenceError("FORBIDDEN");
        options.gateway.assertAuthorized(intelligenceProposalTool);
        return policy;
      },
      options.audit,
      () => now().getTime(),
    );
  }
  generate(request: IntelligenceRequest, signal?: AbortSignal): Promise<IntelligenceText> {
    return this.router.generate(request, signal);
  }
}
