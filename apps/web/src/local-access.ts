import {
  apiBaseUrl,
  IdaApiError,
  invalidateWorkspaceRequests,
  onAuthenticationRequired,
  requestApi,
} from "./api-transport";

export type AccessStatus =
  | { mode: "LOCAL_DEMO"; state: "UNLOCKED" }
  | { mode: "LOCAL_LOCK"; state: "UNINITIALIZED" | "LOCKED" }
  | { mode: "LOCAL_LOCK"; state: "UNLOCKED"; sessionExpiresAt: string };

export type AccessView =
  | { phase: "checking" | "locking" }
  | { phase: "unavailable"; message: string; retry: "check" | "lock" }
  | { phase: "closed"; screen: "setup" | "unlock"; busy: boolean; message?: string; retryAt?: number }
  | { phase: "open"; mode: "LOCAL_DEMO" | "LOCAL_LOCK"; expiresAt?: string };

export function assertSameOriginAccess(baseUrl: string, origin: string): void {
  const target = new URL(baseUrl || "/", origin);
  if (target.origin !== origin || target.username || target.password || !/^https?:$/u.test(target.protocol)) {
    throw new IdaApiError("Ouvre IDA depuis son adresse locale habituelle pour accéder au verrou.");
  }
}

export function parseAccessStatus(payload: unknown): AccessStatus {
  if (typeof payload !== "object" || payload === null || !("data" in payload))
    throw new IdaApiError("État d’accès invalide.");
  const data = payload.data;
  if (typeof data !== "object" || data === null || !("mode" in data) || !("state" in data)) {
    throw new IdaApiError("État d’accès invalide.");
  }
  if (data.mode === "LOCAL_DEMO" && data.state === "UNLOCKED") return { mode: data.mode, state: data.state };
  if (data.mode === "LOCAL_LOCK") {
    if (data.state === "LOCKED" || data.state === "UNINITIALIZED") return { mode: data.mode, state: data.state };
    if (
      data.state === "UNLOCKED" &&
      "sessionExpiresAt" in data &&
      typeof data.sessionExpiresAt === "string" &&
      Number.isFinite(Date.parse(data.sessionExpiresAt))
    ) {
      return { mode: data.mode, state: data.state, sessionExpiresAt: data.sessionExpiresAt };
    }
  }
  throw new IdaApiError("État d’accès invalide.");
}

export interface AccessClient {
  status(): Promise<AccessStatus>;
  authenticate(action: "setup" | "unlock", passphrase: string): Promise<AccessStatus>;
  lock(): Promise<void>;
}

async function accessRequest(path: string, passphrase?: string): Promise<unknown> {
  assertSameOriginAccess(apiBaseUrl, window.location.origin);
  return requestApi(
    `/v1/auth/${path}`,
    {
      method: path === "status" ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        ...(passphrase === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(passphrase === undefined ? {} : { body: JSON.stringify({ passphrase }) }),
    },
    true,
  );
}

export const localAccessClient: AccessClient = {
  status: async () => parseAccessStatus(await accessRequest("status")),
  authenticate: async (action, passphrase) => parseAccessStatus(await accessRequest(action, passphrase)),
  lock: async () => {
    await accessRequest("lock");
  },
};

// Ce store ne conserve ni formulaire ni credential. Toute sortie du hub
// invalide ses requêtes, et une réponse asynchrone ancienne ne peut le rouvrir.
export class LocalAccessController {
  private state: AccessView = { phase: "checking" };
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private active = false;
  private checking = false;
  private stickyLock = false;
  broadcast: (() => void) | undefined;

  constructor(private readonly client: AccessClient = localAccessClient) {}

  getSnapshot = (): AccessView => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private setState(next: AccessView): void {
    if (this.state.phase === "open" && next.phase !== "open") invalidateWorkspaceRequests();
    this.state = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
  private applyStatus(status: AccessStatus): void {
    if (status.mode === "LOCAL_LOCK") this.stickyLock = true;
    if (this.stickyLock && status.mode === "LOCAL_DEMO") {
      this.setState({
        phase: "unavailable",
        message: "Le mode d’accès d’IDA a changé. Vérifie le serveur local avant de réessayer.",
        retry: "check",
      });
      return;
    }
    if (status.state === "UNLOCKED") {
      if (status.mode === "LOCAL_LOCK" && Date.parse(status.sessionExpiresAt) <= Date.now()) {
        this.expire();
        return;
      }
      this.setState({
        phase: "open",
        mode: status.mode,
        ...(status.mode === "LOCAL_LOCK" ? { expiresAt: status.sessionExpiresAt } : {}),
      });
    } else {
      this.setState({ phase: "closed", screen: status.state === "UNINITIALIZED" ? "setup" : "unlock", busy: false });
    }
  }
  connect(): () => void {
    this.active = true;
    const unsubscribe = onAuthenticationRequired(() => this.expire());
    void this.check();
    return () => {
      this.active = false;
      this.version += 1;
      this.checking = false;
      invalidateWorkspaceRequests();
      unsubscribe();
    };
  }
  async check(): Promise<void> {
    if (
      !this.active ||
      this.checking ||
      this.state.phase === "locking" ||
      (this.state.phase === "closed" && this.state.busy) ||
      (this.state.phase === "unavailable" && this.state.retry === "lock")
    )
      return;
    const version = ++this.version;
    this.checking = true;
    if (this.state.phase !== "open") this.setState({ phase: "checking" });
    try {
      const status = await this.client.status();
      if (this.active && version === this.version) this.applyStatus(status);
    } catch {
      if (this.active && version === this.version)
        this.setState({
          phase: "unavailable",
          message: "IDA est inaccessible pour le moment. Vérifie que le serveur local est démarré, puis réessaie.",
          retry: "check",
        });
    } finally {
      if (version === this.version) this.checking = false;
    }
  }
  conceal(): void {
    if (this.state.phase === "locking" || (this.state.phase === "unavailable" && this.state.retry === "lock")) return;
    this.version += 1;
    this.checking = false;
    this.setState({ phase: "checking" });
  }
  expire(): void {
    if (this.state.phase === "locking" || (this.state.phase === "unavailable" && this.state.retry === "lock")) return;
    this.version += 1;
    this.checking = false;
    this.setState(
      this.stickyLock
        ? {
            phase: "closed",
            screen: "unlock",
            busy: false,
            message: "Ta session est terminée. Déverrouille IDA pour continuer.",
          }
        : {
            phase: "unavailable",
            message: "L’accès local a été interrompu. Vérifie l’état d’IDA pour continuer.",
            retry: "check",
          },
    );
  }
  async authenticate(passphrase: string): Promise<void> {
    if (!this.active || this.state.phase !== "closed" || this.state.busy || (this.state.retryAt ?? 0) > Date.now())
      return;
    const screen = this.state.screen;
    const version = ++this.version;
    this.checking = false;
    this.setState({ phase: "closed", screen, busy: true });
    try {
      const status = await this.client.authenticate(screen, passphrase);
      if (!this.active || version !== this.version) return;
      if (status.mode !== "LOCAL_LOCK" || status.state !== "UNLOCKED") throw new IdaApiError("État d’accès invalide.");
      this.applyStatus(status);
    } catch (error) {
      if (!this.active || version !== this.version) return;
      const status = error instanceof IdaApiError ? error.status : undefined;
      const seconds = error instanceof IdaApiError ? (error.retryAfterSeconds ?? 1) : 1;
      if (status === 409) {
        this.setState({
          phase: "closed",
          screen: "unlock",
          busy: false,
          message: "Le verrou a déjà été créé. Saisis ta phrase de passe pour continuer.",
        });
      } else {
        this.setState({
          phase: "closed",
          screen,
          busy: false,
          message:
            status === 401
              ? "Déverrouillage refusé. Vérifie ta phrase de passe et l’autorisation de cet appareil."
              : status === 429
                ? "Patiente avant de réessayer."
                : status === 403
                  ? "Cette adresse n’est pas autorisée à déverrouiller IDA. Reviens à l’adresse locale habituelle."
                  : "La demande n’a pas pu être confirmée. Réessaie ou vérifie l’état d’IDA.",
          ...(status === 429 ? { retryAt: Date.now() + seconds * 1_000 } : {}),
        });
      }
    }
  }
  async lock(): Promise<void> {
    if (!this.active || this.state.phase === "locking") return;
    const version = ++this.version;
    this.checking = false;
    this.setState({ phase: "locking" });
    invalidateWorkspaceRequests();
    this.broadcast?.();
    try {
      await this.client.lock();
      if (this.active && version === this.version) this.setState({ phase: "closed", screen: "unlock", busy: false });
    } catch {
      if (this.active && version === this.version)
        this.setState({
          phase: "unavailable",
          retry: "lock",
          message:
            "Tes données sont masquées. La fermeture de la session n’a pas encore été confirmée par le serveur. Réessaie le verrouillage.",
        });
    }
  }
}
