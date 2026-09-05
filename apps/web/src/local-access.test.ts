import { afterEach, describe, expect, it, vi } from "vitest";
import { IdaApiError, invalidateWorkspaceRequests, onAuthenticationRequired, requestApi } from "./api-transport";
import {
  type AccessClient,
  type AccessStatus,
  assertSameOriginAccess,
  LocalAccessController,
  parseAccessStatus,
} from "./local-access";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const opened: AccessStatus = { mode: "LOCAL_LOCK", state: "UNLOCKED", sessionExpiresAt: "2099-12-31T12:00:00.000Z" };
const cleanups: Array<() => void> = [];
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function createController(status: AccessStatus = { mode: "LOCAL_LOCK", state: "LOCKED" }) {
  const client = {
    status: vi.fn<AccessClient["status"]>().mockResolvedValue(status),
    authenticate: vi.fn<AccessClient["authenticate"]>().mockResolvedValue(opened),
    lock: vi.fn<AccessClient["lock"]>().mockResolvedValue(undefined),
  };
  const controller = new LocalAccessController(client);
  cleanups.push(controller.connect());
  return { client, controller };
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  invalidateWorkspaceRequests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Frontière d’accès du hub", () => {
  it("n'ouvre rien avant confirmation du serveur et ne prend jamais un échec pour un mode démo", async () => {
    const { controller, client } = createController();
    expect(controller.getSnapshot().phase).toBe("checking");
    await settle();
    expect(controller.getSnapshot()).toMatchObject({ phase: "closed", screen: "unlock" });
    client.status.mockRejectedValueOnce(new IdaApiError("introuvable", 404));
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("unavailable");
    expect(client.authenticate).not.toHaveBeenCalled();
  });
  it("distingue une démo explicitement autorisée et un verrou initialisable", async () => {
    const demo = createController({ mode: "LOCAL_DEMO", state: "UNLOCKED" });
    const setup = createController({ mode: "LOCAL_LOCK", state: "UNINITIALIZED" });
    await settle();
    expect(demo.controller.getSnapshot()).toMatchObject({ phase: "open", mode: "LOCAL_DEMO" });
    expect(setup.controller.getSnapshot()).toMatchObject({ phase: "closed", screen: "setup" });
    await setup.controller.authenticate("Une phrase de test temporaire");
    expect(setup.client.authenticate).toHaveBeenCalledWith("setup", "Une phrase de test temporaire");
    expect(setup.controller.getSnapshot().phase).toBe("open");
    expect(JSON.stringify(setup.controller.getSnapshot())).not.toContain("phrase de test");
  });
  it("refuse le downgrade de verrou vers démo en cours de session", async () => {
    const { client, controller } = createController(opened);
    await settle();
    client.status.mockResolvedValue({ mode: "LOCAL_DEMO", state: "UNLOCKED" });
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("unavailable");
  });
  it("ignore un ancien polling UNLOCKED terminé après la demande de verrouillage", async () => {
    const { client, controller } = createController(opened);
    await settle();
    const stale = deferred<AccessStatus>();
    client.status.mockReturnValueOnce(stale.promise);
    const polling = controller.check();
    const locking = controller.lock();
    expect(controller.getSnapshot().phase).toBe("locking");
    stale.resolve(opened);
    await Promise.all([polling, locking]);
    expect(controller.getSnapshot()).toMatchObject({ phase: "closed", screen: "unlock" });
  });
  it("ignore une réponse d'unlock après masquage et requiert une nouvelle vérification", async () => {
    const { client, controller } = createController();
    await settle();
    const stale = deferred<AccessStatus>();
    client.authenticate.mockReturnValueOnce(stale.promise);
    const unlocking = controller.authenticate("Une phrase de test temporaire");
    controller.conceal();
    stale.resolve(opened);
    await unlocking;
    expect(controller.getSnapshot().phase).toBe("checking");
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("closed");
  });
  it("conserve le verrouillage en cours à travers un changement d’onglet", async () => {
    const { client, controller } = createController(opened);
    await settle();
    const pending = deferred<void>();
    client.lock.mockReturnValueOnce(pending.promise);
    const locking = controller.lock();
    controller.conceal();
    controller.expire();
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("locking");
    pending.resolve(undefined);
    await locking;
    expect(controller.getSnapshot().phase).toBe("closed");
  });
  it("un échec de logout masque les données et aucun polling ne peut rouvrir le hub", async () => {
    const { client, controller } = createController(opened);
    await settle();
    client.lock.mockRejectedValueOnce(new Error("offline"));
    await controller.lock();
    controller.conceal();
    controller.expire();
    await controller.check();
    expect(controller.getSnapshot()).toMatchObject({ phase: "unavailable", retry: "lock" });
    expect(client.status).toHaveBeenCalledTimes(1);
    await controller.lock();
    expect(controller.getSnapshot().phase).toBe("closed");
  });
  it("ne double pas la soumission et respecte Retry-After sans recopier l'erreur serveur", async () => {
    const { client, controller } = createController();
    await settle();
    vi.useFakeTimers();
    client.authenticate.mockRejectedValueOnce(new IdaApiError("secret accidentel", 429, 5));
    await Promise.all([controller.authenticate("phrase provisoire"), controller.authenticate("phrase provisoire")]);
    expect(client.authenticate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("secret accidentel");
    await controller.authenticate("phrase provisoire");
    expect(client.authenticate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    await controller.authenticate("phrase provisoire");
    expect(controller.getSnapshot().phase).toBe("open");
  });
  it("traite un setup déjà effectué comme un unlock et ne stocke pas la phrase", async () => {
    const { client, controller } = createController({ mode: "LOCAL_LOCK", state: "UNINITIALIZED" });
    await settle();
    client.authenticate.mockRejectedValueOnce(new IdaApiError("already initialized", 409));
    await controller.authenticate("phrase provisoire");
    expect(controller.getSnapshot()).toMatchObject({ phase: "closed", screen: "unlock", busy: false });
  });
  it("refuse une session arrivée à son échéance absolue", async () => {
    const { controller } = createController({
      mode: "LOCAL_LOCK",
      state: "UNLOCKED",
      sessionExpiresAt: "2020-01-01T00:00:00.000Z",
    });
    await settle();
    expect(controller.getSnapshot().phase).toBe("closed");
  });
  it("rejette les états incomplets ou inconnus et l’envoi de credentials à une autre origine", () => {
    for (const payload of [
      null,
      { data: { mode: "LOCAL_LOCK", state: "UNLOCKED" } },
      { data: { mode: "UNKNOWN", state: "UNLOCKED" } },
      { data: { mode: "LOCAL_LOCK", state: "UNLOCKED", sessionExpiresAt: "invalid" } },
    ]) {
      expect(() => parseAccessStatus(payload)).toThrow();
    }
    expect(() => assertSameOriginAccess("", "http://127.0.0.1:5173")).not.toThrow();
    expect(() => assertSameOriginAccess("http://127.0.0.1:8787", "http://127.0.0.1:5173")).toThrow();
    expect(() => assertSameOriginAccess("https://attacker.example", "http://127.0.0.1:5173")).toThrow();
  });
});

describe("Transport des requêtes privées", () => {
  it("ne livre pas une ancienne réponse après invalidation même si fetch ignore abort", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const request = requestApi("/v1/tasks");
    invalidateWorkspaceRequests();
    pending.resolve(Response.json({ data: ["données privées"] }));
    await expect(request).rejects.toThrow("Demande interrompue");
  });
  it("un 401 métier invalide le hub mais un 401 de phrase incorrecte reste au formulaire", async () => {
    const callback = vi.fn();
    cleanups.push(onAuthenticationRequired(callback));
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { message: "refus" } }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestApi("/v1/auth/unlock", { method: "POST" }, true)).rejects.toMatchObject({ status: 401 });
    expect(callback).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(Response.json({ error: { message: "refus" } }, { status: 401 }));
    await expect(requestApi("/v1/tasks")).rejects.toMatchObject({ status: 401 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenLastCalledWith(
      "/v1/tasks",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store", redirect: "error" }),
    );
  });
  it("ne déclenche ni logout ni nouvelle tentative automatique pour un refus d'autorisation", async () => {
    const callback = vi.fn();
    cleanups.push(onAuthenticationRequired(callback));
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { message: "action refusée" } }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestApi("/v1/tasks", { method: "POST" })).rejects.toMatchObject({ status: 403 });
    expect(callback).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
