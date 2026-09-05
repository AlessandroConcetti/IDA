import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { digestOpaqueLocalSessionToken, readLocalSessionCookie, serializeLocalSessionCookie } from "./local-auth.js";
import { assertLocalOnlyHost, resolveIdentityMode } from "./runtime-config.js";

function cookiePair(setCookie: string | string[] | undefined): string {
  expect(typeof setCookie).toBe("string");
  return String(setCookie).split(";", 1)[0] ?? "";
}

function rawCookieToken(cookie: string): string {
  return cookie.slice(cookie.indexOf("=") + 1);
}

describe("Verrou local propriétaire", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    for (const directory of temporaryDirectories.splice(0)) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("sérialise un cookie host-only strict et refuse les cookies ambigus", () => {
    const token = "a".repeat(43);
    const secureCookie = serializeLocalSessionCookie(token, true);

    expect(secureCookie).toBe(`__Host-ida_session=${token}; Path=/; HttpOnly; SameSite=Strict; Secure`);
    expect(serializeLocalSessionCookie(token, false)).toBe(
      `ida_local_session=${token}; Path=/v1; HttpOnly; SameSite=Strict`,
    );
    expect(secureCookie).not.toContain("Domain=");
    expect(readLocalSessionCookie(`theme=light; __Host-ida_session=${token}`, true)).toBe(token);
    expect(
      readLocalSessionCookie(`__Host-ida_session=${token}; __Host-ida_session=${"b".repeat(43)}`, true),
    ).toBeNull();
    expect(readLocalSessionCookie(`__Host-ida_session=invalid; __Host-ida_session=${token}`, true)).toBeNull();
    expect(readLocalSessionCookie(`ida_local_session=${token}`, true)).toBeNull();
  });

  it("refuse un mode inconnu et toute écoute réseau du runtime local", async () => {
    expect(resolveIdentityMode(undefined)).toBe("LOCAL_DEMO");
    expect(resolveIdentityMode("LOCAL_LOCK")).toBe("LOCAL_LOCK");
    expect(() => resolveIdentityMode("REMOTE")).toThrow(/LOCAL_DEMO ou LOCAL_LOCK/u);
    await expect(createApp({ identityMode: "REMOTE" as never })).rejects.toThrow(/LOCAL_DEMO ou LOCAL_LOCK/u);
    expect(() => assertLocalOnlyHost("127.0.0.1")).not.toThrow();
    expect(() => assertLocalOnlyHost("::1")).not.toThrow();
    expect(() => assertLocalOnlyHost("0.0.0.0")).toThrow(/boucle locale/u);
    expect(() => assertLocalOnlyHost("192.168.1.20")).toThrow(/boucle locale/u);
  });

  it("couvre setup, unlock, rotation, rate limit, révocation, expiration et permissions", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-local-lock-"));
    const storageDir = await mkdtemp(join(tmpdir(), "ida-local-lock-storage-"));
    temporaryDirectories.push(dataDir, storageDir);
    const passphrase = "Une phrase secrète IDA locale très longue";
    let currentTime = new Date("2026-09-04T10:00:00.000Z");
    const now = () => new Date(currentTime);
    let app = await createApp({ dataDir, storageDir, identityMode: "LOCAL_LOCK", now });
    let database: DemoDatabase | undefined;

    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      const initialStatus = await app.inject({ method: "GET", url: "/v1/auth/status" });
      const lockedMe = await app.inject({ method: "GET", url: "/v1/me" });
      const weakSetup = await app.inject({
        method: "POST",
        url: "/v1/auth/setup",
        payload: { passphrase: "trop courte" },
      });
      const crossSiteSetup = await app.inject({
        method: "POST",
        url: "/v1/auth/setup",
        headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
        payload: { passphrase },
      });

      expect(health.json()).toMatchObject({ status: "ok", mode: "LOCAL_LOCK" });
      expect(initialStatus.json()).toEqual({ data: { mode: "LOCAL_LOCK", state: "UNINITIALIZED" } });
      expect(initialStatus.headers["cache-control"]).toBe("no-store");
      expect(lockedMe.statusCode).toBe(401);
      expect(lockedMe.headers["cache-control"]).toBe("no-store");
      expect(weakSetup.statusCode).toBe(400);
      expect(crossSiteSetup.statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: "/v1/auth/status" })).json()).toEqual({
        data: { mode: "LOCAL_LOCK", state: "UNINITIALIZED" },
      });

      const attackerCookie = `ida_local_session=${"a".repeat(43)}`;
      const [setup, concurrentSetup] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/v1/auth/setup",
          headers: { cookie: attackerCookie },
          payload: { passphrase },
        }),
        app.inject({
          method: "POST",
          url: "/v1/auth/setup",
          payload: { passphrase },
        }),
      ]);
      const firstCookie = cookiePair(setup.headers["set-cookie"]);
      const firstToken = rawCookieToken(firstCookie);

      expect(setup.statusCode).toBe(201);
      expect(setup.headers["cache-control"]).toBe("no-store");
      expect(concurrentSetup.statusCode).toBe(409);
      expect(firstCookie).toMatch(/^ida_local_session=[A-Za-z0-9_-]{43}$/u);
      expect(firstCookie).not.toBe(attackerCookie);
      expect(String(setup.headers["set-cookie"])).toContain("HttpOnly");
      expect(String(setup.headers["set-cookie"])).toContain("SameSite=Strict");
      expect(String(setup.headers["set-cookie"])).toContain("Path=/v1");
      expect(String(setup.headers["set-cookie"])).not.toContain("Domain=");
      expect(setup.body).not.toContain(passphrase);
      expect(setup.body).not.toContain(firstToken);

      const authenticatedStatus = await app.inject({
        method: "GET",
        url: "/v1/auth/status",
        headers: { cookie: firstCookie },
      });
      const authenticatedMe = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: firstCookie } });
      const bearerOnly = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { authorization: `Bearer ${firstToken}` },
      });
      const duplicateSetup = await app.inject({
        method: "POST",
        url: "/v1/auth/setup",
        payload: { passphrase },
      });

      expect(authenticatedStatus.json()).toMatchObject({ data: { mode: "LOCAL_LOCK", state: "UNLOCKED" } });
      expect(authenticatedMe.statusCode).toBe(200);
      expect(authenticatedMe.json()).toMatchObject({
        data: { id: demoContext.userId, authentication: { mode: "LOCAL_LOCK" } },
      });
      expect(authenticatedMe.body).not.toMatch(/sessionId|token|verifier|passphrase/iu);
      expect(bearerOnly.statusCode).toBe(401);
      expect(duplicateSetup.statusCode).toBe(409);

      const foreignHost = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { host: "attacker.example", cookie: firstCookie },
      });
      const crossSiteLock = await app.inject({
        method: "POST",
        url: "/v1/auth/lock",
        headers: { cookie: firstCookie, origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      });
      expect(foreignHost.statusCode).toBe(403);
      expect(crossSiteLock.statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: firstCookie } })).statusCode).toBe(
        200,
      );

      const createdTask = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: { cookie: firstCookie },
        payload: { title: "Tâche créée sous verrou local" },
      });
      expect(createdTask.statusCode).toBe(201);

      const lock = await app.inject({ method: "POST", url: "/v1/auth/lock", headers: { cookie: firstCookie } });
      expect(lock.statusCode).toBe(204);
      expect(String(lock.headers["set-cookie"])).toContain("Max-Age=0");
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: firstCookie } })).statusCode).toBe(
        401,
      );

      const [wrongUnlock, throttledUnlock] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/v1/auth/unlock",
          payload: { passphrase: "Cette phrase secrète est incorrecte" },
        }),
        app.inject({
          method: "POST",
          url: "/v1/auth/unlock",
          payload: { passphrase },
        }),
      ]);

      expect(wrongUnlock.statusCode).toBe(401);
      expect(throttledUnlock.statusCode).toBe(429);
      expect(throttledUnlock.headers["retry-after"]).toBe("1");

      currentTime = new Date(currentTime.getTime() + 1_000);
      const firstUnlock = await app.inject({
        method: "POST",
        url: "/v1/auth/unlock",
        headers: { cookie: attackerCookie },
        payload: { passphrase },
      });
      const rotatedFromLockCookie = cookiePair(firstUnlock.headers["set-cookie"]);
      expect(firstUnlock.statusCode).toBe(200);
      expect(rotatedFromLockCookie).not.toBe(attackerCookie);
      expect(rotatedFromLockCookie).not.toBe(firstCookie);

      const secondUnlock = await app.inject({
        method: "POST",
        url: "/v1/auth/unlock",
        headers: { cookie: rotatedFromLockCookie },
        payload: { passphrase },
      });
      const currentCookie = cookiePair(secondUnlock.headers["set-cookie"]);
      const currentToken = rawCookieToken(currentCookie);

      expect(secondUnlock.statusCode).toBe(200);
      expect(currentCookie).not.toBe(rotatedFromLockCookie);
      expect(
        (await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: rotatedFromLockCookie } })).statusCode,
      ).toBe(401);
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: currentCookie } })).statusCode).toBe(
        200,
      );

      await app.close();
      database = await DemoDatabase.open({ dataDir, seed: false });
      const credential = await database.getLocalOwnerCredential(demoContext.userId);
      const storedSessions = await database.pglite.query<{ tokenDigest: string }>(
        `SELECT token_digest AS "tokenDigest" FROM local_auth_sessions ORDER BY created_at`,
      );
      const securityEvents = await database.pglite.query<{ eventType: string; outcome: string }>(
        `SELECT event_type AS "eventType", outcome FROM identity_security_events ORDER BY created_at, id`,
      );

      expect(credential).not.toBeNull();
      expect(JSON.stringify(credential)).not.toContain(passphrase);
      expect(credential?.salt).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(credential?.verifier).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(storedSessions.rows.every((row) => /^[a-f0-9]{64}$/u.test(row.tokenDigest))).toBe(true);
      expect(storedSessions.rows.map((row) => row.tokenDigest)).toContain(digestOpaqueLocalSessionToken(currentToken));
      expect(JSON.stringify(storedSessions.rows)).not.toContain(currentToken);
      expect(securityEvents.rows).toEqual(
        expect.arrayContaining([
          { eventType: "LOCAL_CREDENTIAL_CREATED", outcome: "SUCCEEDED" },
          { eventType: "LOCAL_UNLOCK", outcome: "DENIED" },
          { eventType: "LOCAL_SESSION_REVOKED", outcome: "SUCCEEDED" },
        ]),
      );
      expect(
        securityEvents.rows.filter((event) => event.eventType === "LOCAL_UNLOCK" && event.outcome === "DENIED"),
      ).toHaveLength(1);

      await database.pglite.query(
        `UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2`,
        [demoIdentity.clientInstanceId, demoContext.workspaceId],
      );
      await database.close();
      database = undefined;

      // Le credential rend le verrou persistant : oublier la variable au
      // redémarrage ne doit jamais restaurer le contexte LOCAL_DEMO.
      app = await createApp({ dataDir, storageDir, seed: false, now });
      expect((await app.inject({ method: "GET", url: "/health" })).json()).toMatchObject({ mode: "LOCAL_LOCK" });
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: currentCookie } })).statusCode).toBe(
        200,
      );
      const deniedTask = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: { cookie: currentCookie },
        payload: { title: "Cette tâche doit être refusée" },
      });
      expect(deniedTask.statusCode).toBe(403);

      await app.close();
      database = await DemoDatabase.open({ dataDir, seed: false });
      await database.pglite.query(`UPDATE client_instances SET status = 'REVOKED', revoked_at = $2 WHERE id = $1`, [
        demoIdentity.clientInstanceId,
        currentTime.toISOString(),
      ]);
      await database.close();
      database = undefined;

      // Une tentative explicite de downgrade ne contourne pas davantage le
      // credential persistant.
      app = await createApp({ dataDir, storageDir, identityMode: "LOCAL_DEMO", seed: false, now });
      const deniedUnlockOnRevokedDevice = await app.inject({
        method: "POST",
        url: "/v1/auth/unlock",
        payload: { passphrase },
      });
      const revokedDeviceStatus = await app.inject({
        method: "GET",
        url: "/v1/auth/status",
        headers: { cookie: currentCookie },
      });
      expect(deniedUnlockOnRevokedDevice.statusCode).toBe(401);
      expect(deniedUnlockOnRevokedDevice.headers["set-cookie"]).toBeUndefined();
      expect(revokedDeviceStatus.json()).toEqual({ data: { mode: "LOCAL_LOCK", state: "LOCKED" } });

      await app.close();
      database = await DemoDatabase.open({ dataDir, seed: false });
      await database.pglite.query(`UPDATE client_instances SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1`, [
        demoIdentity.clientInstanceId,
      ]);
      await database.close();
      database = undefined;

      app = await createApp({ dataDir, storageDir, identityMode: "LOCAL_LOCK", seed: false, now });
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: currentCookie } })).statusCode).toBe(
        401,
      );
      const unlockAfterDeviceRecovery = await app.inject({
        method: "POST",
        url: "/v1/auth/unlock",
        payload: { passphrase },
      });
      const expiryTestCookie = cookiePair(unlockAfterDeviceRecovery.headers["set-cookie"]);
      expect(unlockAfterDeviceRecovery.statusCode).toBe(200);

      currentTime = new Date(currentTime.getTime() + 29 * 60 * 1_000);
      const statusNearIdleExpiry = await app.inject({
        method: "GET",
        url: "/v1/auth/status",
        headers: { cookie: expiryTestCookie },
      });
      expect(statusNearIdleExpiry.json()).toMatchObject({
        data: { mode: "LOCAL_LOCK", state: "UNLOCKED" },
      });

      currentTime = new Date(currentTime.getTime() + 2 * 60 * 1_000);
      const expired = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: expiryTestCookie } });
      const expiredStatus = await app.inject({
        method: "GET",
        url: "/v1/auth/status",
        headers: { cookie: expiryTestCookie },
      });

      expect(expired.statusCode).toBe(401);
      expect(expiredStatus.json()).toEqual({ data: { mode: "LOCAL_LOCK", state: "LOCKED" } });
      const idempotentLock = await app.inject({
        method: "POST",
        url: "/v1/auth/lock",
        headers: { cookie: expiryTestCookie },
      });
      expect(idempotentLock.statusCode).toBe(204);
      expect(String(idempotentLock.headers["set-cookie"])).toContain("Max-Age=0");
    } finally {
      await app.close();
      await database?.close().catch(() => undefined);
    }
  }, 30_000);
});
