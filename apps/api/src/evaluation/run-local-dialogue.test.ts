import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoDatabase } from "../database.js";
import { OllamaLoopbackTransport } from "../ollama-transport.js";
import { localPilot } from "./local-model-pin.js";
import { localDialogueSmokeFlag, localDialogueSmokePrompt, runLocalDialogueSmoke } from "./run-local-dialogue.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function fixture() {
  vi.stubEnv("OLLAMA_NO_CLOUD", "1");
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External requests prohibited"));
  const inventory = vi
    .spyOn(OllamaLoopbackTransport.prototype, "inspectInstalledModels")
    .mockResolvedValue([{ name: localPilot.name, digest: localPilot.digest, size: localPilot.size }]);
  const inference = vi.spyOn(OllamaLoopbackTransport.prototype, "post").mockImplementation(async (path, body) => {
    expect(path).toBe("/api/chat");
    expect(body.model).toBe(localPilot.name);
    expect(body.tools).toEqual([]);
    expect(body.keep_alive).toBe(0);
    expect(body.stream).toBe(false);
    const messages = body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain(localDialogueSmokePrompt);
    return {
      status: 200,
      body: { done: true, done_reason: "stop", message: { role: "assistant", content: "IDA_LOCAL_OK" } },
    };
  });
  const open = vi.spyOn(DemoDatabase, "open");
  const originalClose = DemoDatabase.prototype.close;
  let audit: Record<string, unknown>[] = [];
  let activeLocalSessions = -1;
  const close = vi.spyOn(DemoDatabase.prototype, "close").mockImplementation(async function (this: DemoDatabase) {
    audit = (await this.pglite.query<Record<string, unknown>>("SELECT * FROM intelligence_audit_events ORDER BY id"))
      .rows;
    activeLocalSessions = Number(
      (await this.pglite.query<{ count: string }>("SELECT COUNT(*) FROM local_auth_sessions WHERE status = 'ACTIVE'"))
        .rows[0]?.count,
    );
    return originalClose.call(this);
  });
  const dispose = vi.spyOn(OllamaLoopbackTransport.prototype, "dispose");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  return {
    fetch,
    inventory,
    inference,
    open,
    close,
    dispose,
    log,
    audit: () => audit,
    sessions: () => activeLocalSessions,
  };
}

describe("Synthetic local dialogue smoke: real isolated auth/Core, mocked inference", () => {
  it.each([[], ["--other"], [localDialogueSmokeFlag, "--data-dir=.data"], [localDialogueSmokeFlag, "--cloud"]])(
    "refuses non-exact opt-in before creating resources: %j",
    async (...args) => {
      const f = fixture();
      await expect(runLocalDialogueSmoke(args)).rejects.toMatchObject({ code: "SYNTHETIC_OPT_IN_REQUIRED" });
      expect(f.open).not.toHaveBeenCalled();
      expect(f.inventory).not.toHaveBeenCalled();
      expect(f.inference).not.toHaveBeenCalled();
    },
  );

  it("requires the explicit local-only deployment attestation", async () => {
    const f = fixture();
    vi.stubEnv("OLLAMA_NO_CLOUD", "0");
    await expect(runLocalDialogueSmoke([localDialogueSmokeFlag])).rejects.toMatchObject({
      code: "LOCAL_ONLY_ATTESTATION_REQUIRED",
    });
    expect(f.open).not.toHaveBeenCalled();
    expect(f.inventory).not.toHaveBeenCalled();
  });

  it("authenticates, generates once, writes redacted audit and revokes the isolated session", async () => {
    const f = fixture();
    const report = await runLocalDialogueSmoke([localDialogueSmokeFlag]);
    expect(report).toMatchObject({
      authenticatedRouteSucceeded: true,
      anonymousRejected: true,
      sessionRevoked: true,
      generationRequests: 1,
      savedHistoryVerified: true,
      savedReplayVerified: true,
      expectedMarkerMatched: true,
      browserValidated: false,
      userDataAccessed: false,
    });
    expect(f.open).toHaveBeenCalledOnce();
    expect(f.open).toHaveBeenCalledWith(expect.objectContaining({ dataDir: "memory://", storageDir: "memory://" }));
    expect(f.inference).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.dispose).toHaveBeenCalledTimes(2);
    expect(f.sessions()).toBe(0);
    expect(f.audit().map((row) => [row.kind, row.outcome])).toEqual([
      ["INFERENCE", "ATTEMPT"],
      ["INFERENCE", "SUCCEEDED"],
    ]);
    expect(JSON.stringify(f.audit())).not.toMatch(/IDA_LOCAL_OK|Réponds uniquement|cookie|passphrase|Tu es IDA/u);
    expect(JSON.stringify(report)).not.toMatch(/IDA_LOCAL_OK|Réponds uniquement|cookie|passphrase|text/u);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it("does not make an inference when the pinned model is missing", async () => {
    const f = fixture();
    f.inventory.mockResolvedValue([]);
    await expect(runLocalDialogueSmoke([localDialogueSmokeFlag])).rejects.toMatchObject({
      code: "LOCAL_MODEL_NOT_READY",
    });
    expect(f.inference).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.sessions()).toBe(0);
  });

  it("keeps inference failure real, without retry or substituted answer", async () => {
    const f = fixture();
    f.inference.mockRejectedValue(new Error("PRIVATE_TRANSPORT_DIAGNOSTIC"));
    await expect(runLocalDialogueSmoke([localDialogueSmokeFlag])).rejects.toMatchObject({ code: "LOCAL_REPLY_FAILED" });
    expect(f.inference).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.sessions()).toBe(0);
    expect(JSON.stringify(f.audit())).not.toContain("PRIVATE_TRANSPORT_DIAGNOSTIC");
  });

  it("reports a mismatched synthetic marker without claiming semantic success", async () => {
    const f = fixture();
    f.inference.mockResolvedValue({
      status: 200,
      body: { done: true, done_reason: "stop", message: { role: "assistant", content: "Une autre réponse." } },
    });
    expect((await runLocalDialogueSmoke([localDialogueSmokeFlag])).expectedMarkerMatched).toBe(false);
    expect(f.inference).toHaveBeenCalledOnce();
  });
});
