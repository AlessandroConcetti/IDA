import { describe, expect, it, vi } from "vitest";
import type { DemoDatabase } from "./database.js";
import { createLocalOwnerCredential, LocalAuthService } from "./local-auth.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Fermeture pendant une authentification locale", () => {
  const account = { userId: "usr_test", workspaceId: "wsp_test", clientInstanceId: "cli_test" };
  const now = () => new Date("2026-09-05T12:00:00.000Z");

  it("révoque la session issue d'une transaction tardive et ne retourne aucun token", async () => {
    const passphrase = "Phrase temporaire du scénario de concurrence";
    const credential = await createLocalOwnerCredential(account.userId, passphrase);
    const issuanceStarted = deferred<void>();
    const issuanceFinished = deferred<boolean>();
    const database = {
      getLocalOwnerCredential: vi.fn().mockResolvedValue({ ...credential, failedAttempts: 0, retryAfter: null }),
      createLocalAuthSession: vi.fn().mockImplementation(() => {
        issuanceStarted.resolve();
        return issuanceFinished.promise;
      }),
      revokeLocalAuthSession: vi.fn().mockResolvedValue(true),
      revokeLocalAuthSessionsForClient: vi.fn().mockResolvedValue(undefined),
    };
    const service = new LocalAuthService(database as unknown as DemoDatabase, account, now);
    const unlocking = service.unlock(passphrase);
    await issuanceStarted.promise;
    const locking = service.explicitLock();
    issuanceFinished.resolve(true);
    await expect(unlocking).resolves.toEqual({ kind: "invalid" });
    await locking;
    expect(database.revokeLocalAuthSessionsForClient).toHaveBeenCalledWith(
      account.userId,
      account.clientInstanceId,
      now().toISOString(),
    );
    expect(database.revokeLocalAuthSession).toHaveBeenCalledWith(
      database.createLocalAuthSession.mock.calls[0]?.[0].tokenDigest,
      now().toISOString(),
    );
  });

  it("annule les opérations déjà en attente avant toute dérivation", async () => {
    const database = {
      hasLocalOwnerCredential: vi.fn(),
      getLocalOwnerCredential: vi.fn(),
      revokeLocalAuthSessionsForClient: vi.fn().mockResolvedValue(undefined),
    };
    const service = new LocalAuthService(database as unknown as DemoDatabase, account, now);
    const setup = service.setup("Phrase temporaire de test");
    const unlock = service.unlock("Phrase temporaire de test");
    const lock = service.explicitLock();
    await expect(setup).resolves.toEqual({ kind: "denied" });
    await expect(unlock).resolves.toEqual({ kind: "invalid" });
    await lock;
    expect(database.hasLocalOwnerCredential).not.toHaveBeenCalled();
    expect(database.getLocalOwnerCredential).not.toHaveBeenCalled();
  });
});
