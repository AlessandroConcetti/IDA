import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceRequests, onWorkspaceMutation, requestApi } from "./api-transport";
import { SnapshotReader } from "./snapshot-reader";

const cleanups: Array<() => void> = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
function listen() {
  const listener = vi.fn();
  cleanups.push(onWorkspaceMutation(listener));
  return listener;
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  invalidateWorkspaceRequests();
  vi.unstubAllGlobals();
});

describe("Invalidation du résumé après une écriture confirmée", () => {
  it.each([
    "/v1/releases",
    "/v1/tracks",
    "/v1/media",
    "/v1/campaigns",
    "/v1/post-variants/example/approve",
    "/v1/post-variants/example/reject",
    "/v1/post-variants/example/internal-schedules",
    "/v1/internal-post-schedules/example/cancel",
  ])("signale %s sans transporter de donnée", async (path) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { private: "example" } })));
    const listener = listen();
    await requestApi(path, { method: "POST" });
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  it("ignore les lectures, commandes READ, accès et écritures hors résumé", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json({ data: {} })),
    );
    const listener = listen();
    await requestApi("/v1/tracks");
    await requestApi("/v1/ida/commands", { method: "POST" });
    await requestApi("/v1/auth/lock", { method: "POST" }, true);
    await requestApi("/v1/releases", { method: "POST" }, true);
    await requestApi("/v1/memories/proposals", { method: "POST" });
    await requestApi("/v1/tasks", { method: "POST" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("ne signale ni un refus ni une réponse antérieure au verrouillage", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({}, { status: 403 }))
        .mockReturnValueOnce(pending.promise),
    );
    const listener = listen();
    await expect(requestApi("/v1/releases", { method: "POST" })).rejects.toMatchObject({ status: 403 });
    const stale = requestApi("/v1/releases", { method: "POST" });
    invalidateWorkspaceRequests();
    pending.resolve(Response.json({ data: {} }));
    await expect(stale).rejects.toThrow("Demande interrompue");
    expect(listener).not.toHaveBeenCalled();
  });

  it("respecte le désabonnement et préserve le succès malgré une erreur d'observateur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { id: "created" } })));
    const removed = vi.fn();
    onWorkspaceMutation(removed)();
    cleanups.push(
      onWorkspaceMutation(() => {
        throw new Error("observer");
      }),
    );
    const listener = listen();
    await expect(requestApi("/v1/releases", { method: "POST" })).resolves.toEqual({ data: { id: "created" } });
    expect(removed).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("Lecture sérialisée du dashboard", () => {
  it("ne lit pas avant connexion et reste stable jusqu'à une invalidation", async () => {
    const load = vi.fn().mockResolvedValue({ count: 2 });
    const reader = new SnapshotReader(load);
    reader.refresh();
    expect(load).not.toHaveBeenCalled();
    expect(reader.getSnapshot()).toBe(reader.getSnapshot());
    cleanups.push(reader.connect());
    expect(reader.getSnapshot()).toEqual({ phase: "loading" });
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "ready", data: { count: 2 } });
    await settle();
    expect(load).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"])("ignore une ancienne réponse (%s) et regroupe les relances", async (outcome) => {
    const old = deferred<number>();
    const latest = deferred<number>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const reader = new SnapshotReader(load);
    cleanups.push(reader.connect());
    reader.refresh();
    reader.refresh();
    reader.refresh();
    expect(load).toHaveBeenCalledOnce();
    if (outcome === "success") old.resolve(99);
    else old.reject(new Error("old failure"));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(reader.getSnapshot()).toEqual({ phase: "loading" });
    latest.resolve(1);
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "ready", data: 1 });
  });

  it("retire les données périmées puis permet une nouvelle lecture après une panne, sans rejouer l'écriture", async () => {
    const load = vi.fn().mockResolvedValueOnce(2).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(1);
    const reader = new SnapshotReader(load);
    cleanups.push(reader.connect());
    await settle();
    reader.refresh();
    expect(reader.getSnapshot()).toEqual({ phase: "loading" });
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "unavailable" });
    expect(load).toHaveBeenCalledTimes(2);
    reader.refresh();
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "ready", data: 1 });
  });

  it("vide le cache à la fermeture et ne relance pas une lecture en attente", async () => {
    const pending = deferred<number>();
    const load = vi.fn().mockResolvedValueOnce(2).mockReturnValueOnce(pending.promise);
    const reader = new SnapshotReader(load);
    const disconnect = reader.connect();
    await settle();
    reader.refresh();
    reader.refresh();
    disconnect();
    reader.refresh();
    pending.resolve(1);
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "idle" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("supporte connect/disconnect/connect de StrictMode sans livrer l'ancienne session", async () => {
    const old = deferred<number>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(7);
    const reader = new SnapshotReader(load);
    const observed = vi.fn();
    const unsubscribe = reader.subscribe(observed);
    reader.connect()();
    cleanups.push(reader.connect());
    expect(load).toHaveBeenCalledOnce();
    old.resolve(99);
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "ready", data: 7 });
    unsubscribe();
    const calls = observed.mock.calls.length;
    reader.refresh();
    await settle();
    expect(observed).toHaveBeenCalledTimes(calls);
  });

  it("relit après une mutation réelle du transport et se désabonne à la fermeture", async () => {
    const load = vi.fn().mockResolvedValueOnce({ approvals: 2 }).mockResolvedValueOnce({ approvals: 1 });
    const reader = new SnapshotReader(load);
    const disconnect = reader.connect();
    const unsubscribe = onWorkspaceMutation(reader.refresh);
    await settle();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json({ data: {} })),
    );
    await requestApi("/v1/post-variants/example/approve", { method: "POST" });
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "ready", data: { approvals: 1 } });
    unsubscribe();
    disconnect();
    await requestApi("/v1/post-variants/example/reject", { method: "POST" });
    expect(load).toHaveBeenCalledTimes(2);
    expect(reader.getSnapshot()).toEqual({ phase: "idle" });
  });
});
