import type { RequestIdentityContext } from "@ida/contracts";
import { IdentityAccessPolicy } from "@ida/domain";

import type { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

// Erreur volontairement générique : une réponse HTTP ne doit jamais révéler
// si la session, l'instance, la membership ou le grant précis existe.
export class LocalDemoAuthenticationError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";
  readonly statusCode = 401;

  constructor() {
    super("Authentification requise.");
    this.name = "LocalDemoAuthenticationError";
  }
}

/**
 * Pont transitoire entre la démo mono-utilisateur et le futur Session Gateway.
 *
 * Le sélecteur de session est compilé côté serveur et relu en base à chaque
 * requête. Tant que les routes utilisent encore `demoContext`, ce résolveur
 * accepte uniquement l'OWNER/TRUSTED exact du workspace local. Il ne doit pas
 * être réutilisé tel quel pour exposer IDA sur le réseau ou activer un login.
 */
export class LocalDemoIdentityContextResolver {
  private readonly policy = new IdentityAccessPolicy();

  constructor(
    private readonly database: DemoDatabase,
    private readonly now: () => Date,
  ) {}

  async resolve(): Promise<RequestIdentityContext> {
    const context = await this.database.resolveRequestIdentityContext(demoIdentity.sessionId, demoContext.workspaceId);

    if (
      context === null ||
      context.userId !== demoContext.userId ||
      context.workspaceId !== demoContext.workspaceId ||
      context.clientInstance.id !== demoIdentity.clientInstanceId ||
      context.clientInstance.kind !== demoIdentity.kind ||
      context.clientInstance.platform !== demoIdentity.platform ||
      context.membership.role !== demoContext.membershipRole ||
      context.clientGrant.accessLevel !== demoIdentity.accessLevel
    ) {
      throw new LocalDemoAuthenticationError();
    }

    const decision = this.policy.evaluate({ context, permission: "READ", now: this.now() });

    if (!decision.allowed) {
      throw new LocalDemoAuthenticationError();
    }

    return decision.context;
  }
}
