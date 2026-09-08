import {
  type EnvironmentBrainProfile,
  type EnvironmentInvocation,
  environmentInvocationSchema,
} from "@ida/contracts/environment-brains";
import type { IntelligenceRequest, IntelligenceScope, IntelligenceText } from "@ida/contracts/intelligence";
import { intelligenceRequestSchema } from "@ida/contracts/intelligence";
import type { EnvironmentIntelligenceAudit } from "@ida/contracts/intelligence-audit";
import type { ToolGateway } from "@ida/domain";
import {
  type AgentRegistry,
  constrainEnvironmentPolicy,
  IntelligenceError,
  type IntelligencePort,
  type ProviderRegistry,
} from "@ida/domain";
import { assertIntelligenceIdentity, CoreIntelligence, type IntelligenceAccessSource } from "./core-intelligence.js";

export type { EnvironmentIntelligenceAudit } from "@ida/contracts/intelligence-audit";
/** Un profil de cerveau utilise le même registre/provider et les mêmes allocations. */
export class EnvironmentIntelligence implements IntelligencePort {
  private readonly invocation: EnvironmentInvocation;
  constructor(
    private readonly options: {
      invocation: EnvironmentInvocation;
      agents: AgentRegistry;
      registry: ProviderRegistry;
      access: IntelligenceAccessSource;
      gateway: ToolGateway;
      // Autorité runtime serveur en mémoire, synchrone et sans effet : ni cache périmé ni entrée cliente.
      // Une future persistance exige une autorité identité/policy/profil agrégée et versionnée,
      // pas une Promise cachée dans cette adaptation synchrone.
      getProfile: (
        scope: IntelligenceScope,
        environmentKey: EnvironmentInvocation["environmentKey"],
      ) => EnvironmentBrainProfile;
      audit: (event: EnvironmentIntelligenceAudit) => Promise<void>;
      now?: () => Date;
      acceptOutput?: (output: IntelligenceText) => boolean;
    },
  ) {
    const parsed = environmentInvocationSchema.safeParse(options.invocation);
    if (!parsed.success) throw new IntelligenceError("INVALID_REQUEST");
    this.invocation = parsed.data;
  }
  async generate(raw: IntelligenceRequest, signal?: AbortSignal): Promise<IntelligenceText> {
    const parsed = intelligenceRequestSchema.safeParse(raw);
    if (!parsed.success) throw new IntelligenceError("INVALID_REQUEST");
    const request = parsed.data;
    const core = new CoreIntelligence({
      registry: this.options.registry,
      gateway: this.options.gateway,
      now: this.options.now,
      acceptOutput: this.options.acceptOutput,
      access: {
        loadCurrent: async (scope) => {
          const access = await this.options.access.loadCurrent(scope);
          assertIntelligenceIdentity(scope, access.identity, this.options.now?.() ?? new Date());
          // Aucun await entre l'identité fraîche et le profil courant. Le schéma refuse une Promise.
          const profile = this.options.getProfile(structuredClone(scope), this.invocation.environmentKey);
          return {
            identity: access.identity,
            policy: constrainEnvironmentPolicy(profile, this.invocation, request, access.policy, this.options.agents),
          };
        },
      },
      audit: (event) =>
        this.options.audit({
          ...event,
          environmentKey: this.invocation.environmentKey,
          agentKey: this.invocation.agentKey,
          profileVersion: this.invocation.profileVersion,
        }),
    });
    return core.generate(request, signal);
  }
}
