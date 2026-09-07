import {
  type EnvironmentBrainProfile,
  type EnvironmentInvocation,
  environmentInvocationSchema,
} from "@ida/contracts/environment-brains";
import type { IntelligenceRequest, IntelligenceScope, IntelligenceText } from "@ida/contracts/intelligence";
import { intelligenceRequestSchema } from "@ida/contracts/intelligence";
import type { ToolGateway } from "@ida/domain";
import {
  type AgentRegistry,
  constrainEnvironmentPolicy,
  type IntelligenceAudit,
  IntelligenceError,
  type IntelligencePort,
  type ProviderRegistry,
} from "@ida/domain";
import { CoreIntelligence, type IntelligenceAccessSource } from "./core-intelligence.js";

export type EnvironmentIntelligenceAudit = IntelligenceAudit & {
  environmentKey: EnvironmentInvocation["environmentKey"];
  agentKey: string;
  profileVersion: string;
};

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
      loadProfile: (
        scope: IntelligenceScope,
        environmentKey: EnvironmentInvocation["environmentKey"],
      ) => Promise<EnvironmentBrainProfile>;
      audit: (event: EnvironmentIntelligenceAudit) => Promise<void>;
      now?: () => Date;
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
      access: {
        loadCurrent: async (scope) => {
          const access = await this.options.access.loadCurrent(scope);
          // Le chargeur est une autorité serveur isolée par scope, pas un profil fourni par le navigateur.
          const profile = await this.options.loadProfile(scope, this.invocation.environmentKey);
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
