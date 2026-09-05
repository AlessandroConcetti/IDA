import type { RequestIdentityContext } from "@ida/contracts";
import { IdentityAccessPolicy } from "@ida/domain";
import type { FastifyRequest } from "fastify";

import type { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import type { LocalAuthService } from "./local-auth.js";

// Le contexte vit hors de l'objet Fastify : une route, un plugin ou un hook
// tardif ne peut donc ni le remplacer ni lui substituer un scope fourni par le
// client. La WeakMap libère l'entrée avec la requête.
const requestIdentityContexts = new WeakMap<FastifyRequest, RequestIdentityContext>();

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

export function isIdaApiRequestPath(url: string): boolean {
  const queryStart = url.indexOf("?");
  const pathname = queryStart === -1 ? url : url.slice(0, queryStart);

  return pathname === "/v1" || pathname.startsWith("/v1/");
}

function freezeRequestIdentityContext(context: RequestIdentityContext): RequestIdentityContext {
  const stepUp = context.session.stepUp === undefined ? undefined : Object.freeze({ ...context.session.stepUp });

  return Object.freeze({
    ...context,
    membership: Object.freeze({ ...context.membership }),
    clientInstance: Object.freeze({ ...context.clientInstance }),
    clientGrant: Object.freeze({ ...context.clientGrant }),
    session: Object.freeze({
      ...context.session,
      ...(stepUp === undefined ? {} : { stepUp }),
    }),
  });
}

export function getRequestIdentityContext(request: FastifyRequest): RequestIdentityContext {
  const context = requestIdentityContexts.get(request);

  if (!context) {
    throw new LocalDemoAuthenticationError();
  }

  return context;
}

export function attachRequestIdentityContext(
  request: FastifyRequest,
  context: RequestIdentityContext,
): RequestIdentityContext {
  if (requestIdentityContexts.has(request)) {
    throw new Error("Le contexte Identity de cette requête est déjà attaché.");
  }

  const frozenContext = freezeRequestIdentityContext(context);
  requestIdentityContexts.set(request, frozenContext);

  return frozenContext;
}

/**
 * Pont transitoire entre la démo mono-utilisateur et le futur Session Gateway.
 *
 * Le sélecteur de session est compilé côté serveur et relu en base à chaque
 * requête. Ce résolveur accepte uniquement le compte, le workspace et
 * l'instance exacts de la démo.
 * Rôle et grant peuvent être réduits en base : les permissions par action les
 * réévaluent ensuite. Il ne doit pas être réutilisé tel quel pour exposer IDA
 * sur le réseau ou activer un login.
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
      context.clientInstance.platform !== demoIdentity.platform
    ) {
      throw new LocalDemoAuthenticationError();
    }

    const decision = this.policy.evaluate({ context, permission: "READ", now: this.now() });

    if (!decision.allowed) {
      throw new LocalDemoAuthenticationError();
    }

    return freezeRequestIdentityContext(decision.context);
  }
}

/**
 * Adaptateur du verrou local vers le même RequestIdentityContext que le mode
 * de démonstration. Le token opaque ne quitte jamais ce bord HTTP/service et
 * n'est transmis ni aux routes métier, ni au Core, ni aux outils.
 */
export class LocalLockIdentityContextResolver {
  private readonly policy = new IdentityAccessPolicy();

  constructor(
    private readonly localAuth: LocalAuthService,
    private readonly now: () => Date,
  ) {}

  async resolve(token: string): Promise<RequestIdentityContext> {
    const resolution = await this.localAuth.resolve(token);
    const context = resolution?.identity;

    if (
      !context ||
      context.userId !== demoContext.userId ||
      context.workspaceId !== demoContext.workspaceId ||
      context.clientInstance.id !== demoIdentity.clientInstanceId ||
      context.clientInstance.kind !== demoIdentity.kind ||
      context.clientInstance.platform !== demoIdentity.platform
    ) {
      await this.localAuth.lock(token);
      throw new LocalDemoAuthenticationError();
    }

    const decision = this.policy.evaluate({ context, permission: "READ", now: this.now() });

    if (!decision.allowed) {
      await this.localAuth.lock(token);
      throw new LocalDemoAuthenticationError();
    }

    return freezeRequestIdentityContext(decision.context);
  }
}
