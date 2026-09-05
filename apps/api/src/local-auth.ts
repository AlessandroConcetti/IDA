import {
  createHash,
  scrypt as nodeScrypt,
  randomBytes,
  randomUUID,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";
import type { LocalAuthStatus, RequestIdentityContext } from "@ida/contracts";
import { IdentityAccessPolicy } from "@ida/domain";

import type { DemoDatabase, LocalOwnerCredential } from "./database.js";

const scryptParameters = Object.freeze({
  algorithm: "SCRYPT_V1" as const,
  cost: 2 ** 17,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  maxmem: 256 * 1024 * 1024,
});

const absoluteSessionLifetimeMs = 8 * 60 * 60 * 1_000;
const idleSessionLifetimeMs = 30 * 60 * 1_000;
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export type LocalAuthMode = "LOCAL_DEMO" | "LOCAL_LOCK";

export type LocalAuthAccount = {
  userId: string;
  workspaceId: string;
  clientInstanceId: string;
};

export type LocalAuthSession = {
  token: string;
  expiresAt: string;
};

export type LocalAuthResolution = {
  identity: RequestIdentityContext;
  expiresAt: string;
};

export type LocalAuthSetupResult =
  | { kind: "created"; session: LocalAuthSession }
  | { kind: "already-initialized" }
  | { kind: "denied" };

export type LocalAuthUnlockResult =
  | { kind: "authenticated"; session: LocalAuthSession }
  | { kind: "invalid" }
  | { kind: "rate-limited"; retryAfterSeconds: number };

function deriveScrypt(passphrase: string, salt: Buffer): Promise<Buffer> {
  const options: ScryptOptions = {
    N: scryptParameters.cost,
    r: scryptParameters.blockSize,
    p: scryptParameters.parallelization,
    maxmem: scryptParameters.maxmem,
  };

  return new Promise((resolve, reject) => {
    nodeScrypt(passphrase, salt, scryptParameters.keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

export async function createLocalOwnerCredential(
  userId: string,
  passphrase: string,
): Promise<Omit<LocalOwnerCredential, "failedAttempts" | "retryAfter">> {
  const salt = randomBytes(16);
  const verifier = await deriveScrypt(passphrase, salt);

  return {
    userId,
    algorithm: scryptParameters.algorithm,
    salt: salt.toString("base64url"),
    verifier: verifier.toString("base64url"),
    cost: scryptParameters.cost,
    blockSize: scryptParameters.blockSize,
    parallelization: scryptParameters.parallelization,
    keyLength: scryptParameters.keyLength,
  };
}

export async function verifyLocalOwnerPassphrase(
  credential: LocalOwnerCredential,
  passphrase: string,
): Promise<boolean> {
  if (
    credential.algorithm !== scryptParameters.algorithm ||
    credential.cost !== scryptParameters.cost ||
    credential.blockSize !== scryptParameters.blockSize ||
    credential.parallelization !== scryptParameters.parallelization ||
    credential.keyLength !== scryptParameters.keyLength
  ) {
    return false;
  }

  const salt = decodeCanonicalBase64Url(credential.salt);
  const expected = decodeCanonicalBase64Url(credential.verifier);

  if (salt?.byteLength !== 16 || !expected || expected.byteLength !== credential.keyLength) {
    return false;
  }

  const actual = await deriveScrypt(passphrase, salt);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export function createOpaqueLocalSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestOpaqueLocalSessionToken(token: string): string | null {
  if (!opaqueTokenPattern.test(token)) {
    return null;
  }

  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class LocalAuthService {
  private readonly identityPolicy = new IdentityAccessPolicy();
  private credentialQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: DemoDatabase,
    private readonly account: LocalAuthAccount,
    private readonly now: () => Date,
  ) {}

  private async createSession(): Promise<LocalAuthSession | null> {
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + absoluteSessionLifetimeMs);
    const idleExpiresAt = new Date(issuedAt.getTime() + idleSessionLifetimeMs);
    const token = createOpaqueLocalSessionToken();
    const tokenDigest = digestOpaqueLocalSessionToken(token);

    if (!tokenDigest) {
      throw new Error("La génération de session locale a produit un token invalide.");
    }

    const created = await this.database.createLocalAuthSession({
      sessionId: `ses_${randomUUID().replaceAll("-", "")}`,
      userId: this.account.userId,
      workspaceId: this.account.workspaceId,
      clientInstanceId: this.account.clientInstanceId,
      tokenDigest,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      idleExpiresAt: idleExpiresAt.toISOString(),
    });

    return created ? { token, expiresAt: expiresAt.toISOString() } : null;
  }

  private async serializeCredentialOperation<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.credentialQueue;
    let release: (() => void) | undefined;
    this.credentialQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await predecessor;

    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  async setup(passphrase: string): Promise<LocalAuthSetupResult> {
    return this.serializeCredentialOperation(() => this.setupSerialized(passphrase));
  }

  private async setupSerialized(passphrase: string): Promise<LocalAuthSetupResult> {
    if (await this.database.hasLocalOwnerCredential(this.account.userId)) {
      return { kind: "already-initialized" };
    }

    const credential = await createLocalOwnerCredential(this.account.userId, passphrase);
    const created = await this.database.createLocalOwnerCredential(credential, this.now().toISOString());

    if (!created) {
      return { kind: "already-initialized" };
    }

    const session = await this.createSession();
    return session ? { kind: "created", session } : { kind: "denied" };
  }

  async unlock(passphrase: string): Promise<LocalAuthUnlockResult> {
    return this.serializeCredentialOperation(() => this.unlockSerialized(passphrase));
  }

  private async unlockSerialized(passphrase: string): Promise<LocalAuthUnlockResult> {
    const credential = await this.database.getLocalOwnerCredential(this.account.userId);

    if (!credential) {
      return { kind: "invalid" };
    }

    const checkedAt = this.now();
    const retryAfterMs = credential.retryAfter === null ? Number.NaN : Date.parse(credential.retryAfter);

    if (Number.isFinite(retryAfterMs) && retryAfterMs > checkedAt.getTime()) {
      return {
        kind: "rate-limited",
        retryAfterSeconds: Math.max(1, Math.ceil((retryAfterMs - checkedAt.getTime()) / 1_000)),
      };
    }

    if (!(await verifyLocalOwnerPassphrase(credential, passphrase))) {
      await this.database.recordLocalUnlockFailure(this.account.userId, this.now().toISOString());
      return { kind: "invalid" };
    }

    const session = await this.createSession();
    return session ? { kind: "authenticated", session } : { kind: "invalid" };
  }

  async resolve(token: string, refreshIdle = true): Promise<LocalAuthResolution | null> {
    const tokenDigest = digestOpaqueLocalSessionToken(token);

    if (!tokenDigest) {
      return null;
    }

    const session = await this.database.resolveLocalAuthSession(
      tokenDigest,
      this.account.userId,
      this.account.clientInstanceId,
      this.account.workspaceId,
      this.now().toISOString(),
      idleSessionLifetimeMs,
      refreshIdle,
    );

    if (!session) {
      return null;
    }

    const decision = this.identityPolicy.evaluate({
      context: session.identity,
      permission: "READ",
      now: this.now(),
    });

    if (!decision.allowed) {
      await this.database.revokeLocalAuthSession(tokenDigest, this.now().toISOString());
      return null;
    }

    return { identity: decision.context, expiresAt: session.expiresAt };
  }

  async status(token: string | null): Promise<LocalAuthStatus> {
    if (!(await this.database.hasLocalOwnerCredential(this.account.userId))) {
      return { mode: "LOCAL_LOCK", state: "UNINITIALIZED" };
    }

    // Cette route sera naturellement interrogée par l'interface de verrouillage.
    // Un simple polling ne constitue pas une activité utilisateur et ne doit
    // donc jamais repousser l'expiration d'inactivité.
    const resolution = token ? await this.resolve(token, false) : null;

    if (!resolution) {
      return { mode: "LOCAL_LOCK", state: "LOCKED" };
    }

    return { mode: "LOCAL_LOCK", state: "UNLOCKED", sessionExpiresAt: resolution.expiresAt };
  }

  async lock(token: string): Promise<void> {
    const tokenDigest = digestOpaqueLocalSessionToken(token);

    if (tokenDigest) {
      await this.database.revokeLocalAuthSession(tokenDigest, this.now().toISOString());
    }
  }
}

export function localSessionCookieName(secure: boolean): string {
  return secure ? "__Host-ida_session" : "ida_local_session";
}

function localSessionCookiePath(secure: boolean): string {
  // Le préfixe __Host- impose Path=/. En HTTP loopback, /v1 réduit en revanche
  // l'exposition accidentelle du cookie aux autres chemins du serveur Vite.
  return secure ? "/" : "/v1";
}

export function readLocalSessionCookie(cookieHeader: string | undefined, secure: boolean): string | null {
  if (!cookieHeader) {
    return null;
  }

  const expectedName = localSessionCookieName(secure);
  let token: string | null = null;
  let seen = false;

  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");

    if (separator < 1 || segment.slice(0, separator).trim() !== expectedName) {
      continue;
    }

    if (seen) {
      return null;
    }

    seen = true;
    const candidate = segment.slice(separator + 1).trim();
    token = opaqueTokenPattern.test(candidate) ? candidate : null;
  }

  return token;
}

export function serializeLocalSessionCookie(token: string, secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${localSessionCookieName(secure)}=${token}; Path=${localSessionCookiePath(secure)}; HttpOnly; SameSite=Strict${secureAttribute}`;
}

export function serializeClearedLocalSessionCookie(secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${localSessionCookieName(secure)}=; Path=${localSessionCookiePath(secure)}; HttpOnly; SameSite=Strict; Max-Age=0${secureAttribute}`;
}
