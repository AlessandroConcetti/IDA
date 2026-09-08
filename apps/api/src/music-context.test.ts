import type { RequestIdentityContext } from "@ida/contracts";
import type { IntelligencePolicy, IntelligenceScope } from "@ida/contracts/intelligence";
import {
  agentManifests,
  createAgentRegistry,
  IntelligenceError,
  listEnvironmentBrainProfiles,
  ToolGateway,
} from "@ida/domain";
import { describe, expect, it, vi } from "vitest";
import { type MusicContextAudit, MusicContextBroker, type MusicContextRows } from "./music-context.js";

function fixture() {
  const scope: IntelligenceScope = { userId: "u1", workspaceId: "w1", sessionId: "s1", clientInstanceId: "c1" };
  const identity: RequestIdentityContext = {
    userId: "u1",
    userStatus: "ACTIVE",
    workspaceId: "w1",
    membership: { userId: "u1", workspaceId: "w1", role: "OWNER", status: "ACTIVE" },
    clientInstance: { id: "c1", userId: "u1", kind: "WEB_BROWSER", platform: "WINDOWS", status: "ACTIVE" },
    clientGrant: { clientInstanceId: "c1", workspaceId: "w1", accessLevel: "TRUSTED", status: "ACTIVE" },
    session: {
      id: "s1",
      userId: "u1",
      clientInstanceId: "c1",
      status: "ACTIVE",
      issuedAt: "2026-09-08T10:00:00Z",
      expiresAt: "2026-09-08T11:00:00Z",
    },
  };
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: ["ollama"],
    localFirst: true,
    maxAttempts: 1,
    maxCostMicros: 0,
    maxLatencyMs: 1000,
    cloudConsents: [],
  };
  const profile = listEnvironmentBrainProfiles().find((entry) => entry.environmentKey === "music");
  if (!profile) throw new Error("Missing fixture");
  profile.status = "ACTIVE";
  profile.modelPolicy.allowedModels = [{ providerKey: "ollama", modelId: "synthetic" }];
  const manifests = agentManifests.map((entry) => ({
    ...structuredClone(entry),
    status: "ACTIVE" as const,
    allowedTools: [...entry.allowedTools],
    contextSources: [...entry.contextSources],
    supportedIntents: [...entry.supportedIntents],
  }));
  const rows: MusicContextRows = {
    tracks: [
      {
        id: "t1",
        title: "Aube",
        artistCredit: "Artiste synthétique",
        genre: null,
        bpm: 120,
        musicalKey: "Am",
        status: "UNRELEASED",
        updatedAt: "2026-09-08T10:00:00Z",
      },
    ],
    media: [],
  };
  const read = vi.fn(async () => structuredClone(rows));
  const loadCurrent = vi.fn(async () => ({ identity: structuredClone(identity), policy: structuredClone(policy) }));
  const getProfile = vi.fn(() => structuredClone(profile));
  const audit = vi.fn(async (_event: MusicContextAudit) => {});
  const clock = { date: new Date("2026-09-08T10:15:00Z") };
  const options = {
    profileVersion: "0.1.0",
    agents: createAgentRegistry(manifests),
    access: { loadCurrent },
    gateway: new ToolGateway(undefined, [
      { toolKey: "list_tracks", moduleKey: "MUSIC", permission: "READ" },
      { toolKey: "search_media", moduleKey: "CONTENT", permission: "READ" },
    ]),
    store: { read },
    getProfile,
    audit,
    now: () => clock.date,
  };
  return {
    scope,
    identity,
    policy,
    profile,
    manifests,
    rows,
    read,
    loadCurrent,
    getProfile,
    audit,
    clock,
    options,
    broker: new MusicContextBroker(options),
  };
}

describe("Music context broker, no inference or action authority", () => {
  it("closes over private copies of scope/query/facts for subsequent inference authority", async () => {
    const f = fixture();
    const query = { intent: "SEARCH_TRACK" as const, title: "Aube", limit: 5 };
    const aggregate = vi.fn(async () => ({
      identity: structuredClone(f.identity),
      policy: structuredClone(f.policy),
      facts: structuredClone(f.rows),
    }));
    const prepared = await f.broker.prepare(f.scope, query, { loadCurrent: aggregate });
    query.title = "Another query";
    prepared.snapshot.scope.workspaceId = "forged";
    prepared.snapshot.invocation.contextSources = ["ARTIST_PROFILE"];
    if (prepared.snapshot.facts.tracks[0]) prepared.snapshot.facts.tracks[0].title = "Forged title";
    const current = await prepared.access.loadCurrent(f.scope);
    expect(aggregate).toHaveBeenCalledWith(f.scope, { intent: "SEARCH_TRACK", title: "Aube", limit: 5 });
    expect(current).toEqual({ identity: f.identity, policy: f.policy });
    expect(Object.keys(current).sort()).toEqual(["identity", "policy"]);
    expect(f.audit.mock.calls.map(([event]) => event.outcome)).toEqual(["ATTEMPT", "SUCCEEDED"]);
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it.each(["userId", "workspaceId", "sessionId", "clientInstanceId"] as const)(
    "rejects reuse of prepared authority for another %s before SQL",
    async (key) => {
      const f = fixture();
      const aggregate = vi.fn();
      const prepared = await f.broker.prepare(f.scope, { intent: "SEARCH_TRACK" }, { loadCurrent: aggregate });
      await expect(prepared.access.loadCurrent({ ...f.scope, [key]: "foreign" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(aggregate).not.toHaveBeenCalled();
    },
  );
  it("validates identity from the aggregate, not the earlier authorization", async () => {
    const f = fixture();
    const aggregate = vi.fn(async () => ({
      identity: { ...structuredClone(f.identity), workspaceId: "foreign" },
      policy: structuredClone(f.policy),
      facts: structuredClone(f.rows),
    }));
    const prepared = await f.broker.prepare(f.scope, { intent: "SEARCH_TRACK" }, { loadCurrent: aggregate });
    await expect(prepared.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("compares projected values even if updatedAt was not advanced", async () => {
    const f = fixture();
    const aggregate = vi.fn(async () => ({
      identity: structuredClone(f.identity),
      policy: structuredClone(f.policy),
      facts: structuredClone(f.rows),
    }));
    const prepared = await f.broker.prepare(f.scope, { intent: "SEARCH_TRACK" }, { loadCurrent: aggregate });
    if (f.rows.tracks[0]) f.rows.tracks[0].bpm = 125;
    await expect(prepared.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("selects only the requested source and returns provenance, fixed classification and a copied bounded snapshot", async () => {
    const f = fixture();
    const result = await f.broker.read(f.scope, { intent: "SEARCH_TRACK", title: "Aube" });
    expect(f.read).toHaveBeenCalledExactlyOnceWith(f.scope, { intent: "SEARCH_TRACK", title: "Aube", limit: 5 });
    expect(result).toMatchObject({
      version: "music-context.v1",
      scope: f.scope,
      dataClasses: ["PRIVATE_CREATIVE"],
      invocation: { agentKey: "agent_music_librarian", contextSources: ["MUSIC_CATALOG"] },
      facts: f.rows,
    });
    const first = result.facts.tracks[0];
    if (!first) throw new Error("Missing fact fixture");
    first.title = "Changed result";
    expect(f.rows.tracks[0]?.title).toBe("Aube");
    expect(f.audit.mock.calls.map(([event]) => event.outcome)).toEqual(["ATTEMPT", "SUCCEEDED"]);
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("Aube");
  });
  it("supports media without loading catalog, artist memory or filenames", async () => {
    const f = fixture();
    f.rows.tracks = [];
    f.rows.media = [{ id: "m1", mediaType: "VIDEO", status: "UNUSED", updatedAt: "2026-09-08T10:00:00Z" }];
    const result = await f.broker.read(f.scope, {
      intent: "SEARCH_MEDIA",
      mediaType: "VIDEO",
      status: "UNUSED",
      limit: 1,
    });
    expect(result.invocation.contextSources).toEqual(["CONTENT_LIBRARY"]);
    expect(result.facts).toEqual(f.rows);
  });
  it.each([
    { intent: "SAVE_MEMORY" },
    { intent: "PUBLISH_POST" },
    { intent: "SEARCH_TRACK", prompt: "publie" },
    { intent: "SEARCH_TRACK", dataClasses: ["PUBLIC"] },
    { intent: "SEARCH_TRACK", workspaceId: "w2" },
    { intent: "SEARCH_TRACK", title: " " },
    { intent: "SEARCH_TRACK", title: "a".repeat(121) },
    { intent: "SEARCH_TRACK", limit: 11 },
    { intent: "SEARCH_TRACK", limit: 0 },
    { intent: "SEARCH_MEDIA", status: "ARCHIVED" },
    { intent: "SEARCH_MEDIA", filename: "secret" },
    { intent: "SEARCH_MEDIA", trackId: "foreign" },
  ])("refuses unsupported or expanded query %j before any read", async (query) => {
    const f = fixture();
    await expect(f.broker.read(f.scope, query)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.loadCurrent).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(["userId", "workspaceId", "sessionId", "clientInstanceId"] as const)(
    "refuses forged %s before profile or catalog",
    async (key) => {
      const f = fixture();
      await expect(f.broker.read({ ...f.scope, [key]: "foreign" }, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(f.getProfile).not.toHaveBeenCalled();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it.each([
    "profile_planned",
    "profile_disabled",
    "profile_version",
    "profile_source",
    "classification",
    "mode",
    "agent_planned",
    "agent_source",
    "agent_tool",
    "gateway",
  ])("denies %s", async (change) => {
    const f = fixture();
    if (change === "profile_planned") f.profile.status = "PLANNED";
    if (change === "profile_disabled") f.profile.status = "DISABLED";
    if (change === "profile_version") f.profile.version = "0.2.0";
    if (change === "profile_source") f.profile.contextSources = [];
    if (change === "classification") f.profile.acceptedDataClasses = ["PUBLIC"];
    if (change === "mode") f.policy.mode = "NORMAL";
    if (change === "agent_planned") f.options.agents = createAgentRegistry();
    if (change === "agent_source" || change === "agent_tool") {
      f.options.agents = createAgentRegistry(
        f.manifests.map((entry) => ({
          ...entry,
          ...(change === "agent_source"
            ? { contextSources: ["ARTIST_PROFILE" as const] }
            : { allowedTools: [{ key: "search_media", moduleKey: "CONTENT" as const, permission: "READ" as const }] }),
        })),
      );
    }
    if (change === "gateway") f.options.gateway = new ToolGateway();
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(["attempt_audit", "read", "success_audit"])("checks revocation during %s", async (point) => {
    const f = fixture();
    const revoke = () => {
      f.identity.clientGrant.status = "REVOKED";
    };
    if (point === "read")
      f.read.mockImplementation(async () => {
        revoke();
        return structuredClone(f.rows);
      });
    f.audit.mockImplementation(async (event) => {
      if (
        (point === "attempt_audit" && event.outcome === "ATTEMPT") ||
        (point === "success_audit" && event.outcome === "SUCCEEDED")
      )
        revoke();
    });
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (point === "attempt_audit") expect(f.read).not.toHaveBeenCalled();
  });
  it("blocks a profile disabled during the store read", async () => {
    const f = fixture();
    f.read.mockImplementation(async () => {
      f.profile.status = "DISABLED";
      return structuredClone(f.rows);
    });
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("blocks expiration during lookup", async () => {
    const f = fixture();
    f.read.mockImplementation(async () => {
      f.clock.date = new Date(f.identity.session.expiresAt);
      return structuredClone(f.rows);
    });
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["archive", "private_field", "too_many", "duplicate", "wrong_source", "oversized"])(
    "refuses malformed or broadened facts: %s",
    async (change) => {
      const f = fixture();
      const track = f.rows.tracks[0];
      if (!track) throw new Error("Missing fact fixture");
      if (change === "archive") Object.assign(track, { status: "ARCHIVED" });
      if (change === "private_field") Object.assign(track, { description: "PRIVATE_CANARY" });
      if (change === "too_many") f.rows.tracks = Array.from({ length: 6 }, (_, i) => ({ ...track, id: `t${i}` }));
      if (change === "duplicate") f.rows.tracks.push({ ...track });
      if (change === "wrong_source")
        f.rows.media.push({ id: "m1", status: "UNUSED", mediaType: "VIDEO", updatedAt: track.updatedAt });
      if (change === "oversized") track.title = "PRIVATE_CANARY".repeat(100);
      await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
      expect(JSON.stringify(f.audit.mock.calls)).not.toContain("PRIVATE_CANARY");
    },
  );
  it("redacts unexpected store failures", async () => {
    const f = fixture();
    f.read.mockRejectedValue(new Error("token=PRIVATE_CANARY"));
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: "IDA intelligence: UNAVAILABLE",
    });
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("PRIVATE_CANARY");
  });
  it("requires audit before reading facts", async () => {
    const f = fixture();
    f.audit.mockRejectedValue(new Error("private storage issue"));
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
    });
    expect(f.read).not.toHaveBeenCalled();
  });
  it("checks the current profile after awaiting identity, not an earlier profile snapshot", async () => {
    const f = fixture();
    f.loadCurrent.mockImplementation(async () => {
      f.profile.status = "DISABLED";
      return { identity: structuredClone(f.identity), policy: f.policy };
    });
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.read).not.toHaveBeenCalled();
  });
  it("rejects an asynchronous profile authority and strips typed error details", async () => {
    const f = fixture();
    // @ts-expect-error Simulate an invalid runtime plugin crossing the synchronous boundary.
    f.getProfile.mockReturnValueOnce(Promise.resolve(f.profile));
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.read).not.toHaveBeenCalled();
    f.read.mockRejectedValueOnce(
      Object.assign(new IntelligenceError("UNAVAILABLE"), { message: "PRIVATE_CANARY", cause: "PRIVATE_CAUSE" }),
    );
    const error = await f.broker.read(f.scope, { intent: "SEARCH_TRACK" }).catch((value) => value);
    expect(error.message).toBe("IDA intelligence: UNAVAILABLE");
    expect(error.cause).toBeUndefined();
  });
  it("timestamps the start of lookup, not a later audit", async () => {
    const f = fixture();
    const before = f.clock.date.toISOString();
    f.audit.mockImplementation(async (event) => {
      if (event.outcome === "SUCCEEDED") f.clock.date = new Date("2026-09-08T10:20:00Z");
    });
    expect((await f.broker.read(f.scope, { intent: "SEARCH_TRACK" })).capturedAt).toBe(before);
  });
  it.each(["before", "during"])("honors cancellation %s lookup without delivering late facts", async (point) => {
    const f = fixture();
    const controller = new AbortController();
    if (point === "before") controller.abort();
    else
      f.read.mockImplementation(async () => {
        controller.abort();
        return structuredClone(f.rows);
      });
    await expect(f.broker.read(f.scope, { intent: "SEARCH_TRACK" }, controller.signal)).rejects.toMatchObject({
      code: "CANCELLED",
    });
    if (point === "before") expect(f.read).not.toHaveBeenCalled();
  });
});
