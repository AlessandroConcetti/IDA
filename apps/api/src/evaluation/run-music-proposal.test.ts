import { readFile } from "node:fs/promises";
import { agentManifests, IntelligenceError, listEnvironmentBrainProfiles } from "@ida/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoDatabase } from "../database.js";
import { OllamaLoopbackTransport } from "../ollama-transport.js";
import { localPilot } from "./local-model-pin.js";
import { musicProposalCases } from "./music-proposal-cases.js";
import { proposalPilotProviderKey, runMusicProposalScenarios } from "./music-proposal-scenario.js";
import { runLocalMusicProposalEvaluation } from "./run-music-proposal.js";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const inspect = vi
    .spyOn(OllamaLoopbackTransport.prototype, "inspectInstalledModels")
    .mockResolvedValue([{ name: localPilot.name, digest: localPilot.digest, size: localPilot.size }]);
  const seenPrompts: string[] = [];
  let index = 0;
  const post = vi.spyOn(OllamaLoopbackTransport.prototype, "post").mockImplementation(async (path, body) => {
    expect(path).toBe("/api/chat");
    expect(body.model).toBe(localPilot.name);
    expect(body.tools).toEqual([]);
    expect(body.options).toEqual({ num_predict: 256 });
    expect(body.keep_alive).toBe(0);
    const content = (body.messages as { content: string }[])[0]?.content ?? "";
    seenPrompts.push(content);
    const payload = JSON.parse(content.split("\n").at(-1) ?? "{}");
    const current = musicProposalCases()[index++];
    if (!current) throw new Error("More than three calls");
    const refs = new Map<string, string>(
      payload.facts.map((row: { title: string; artistCredit: string; ref: string }) => [
        JSON.stringify([row.title, row.artistCredit]),
        row.ref,
      ]),
    );
    const ids =
      current.allowedGroupOrders[0]?.flatMap((group) => current.tracks.filter((row) => row.group === group)) ?? [];
    const orderedRefs = ids.map((row) => refs.get(JSON.stringify([row.title, row.artistCredit])));
    return {
      status: 200,
      body: {
        done: true,
        done_reason: "stop",
        message: { role: "assistant", content: JSON.stringify({ orderedRefs }) },
      },
    };
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const dispose = vi.spyOn(OllamaLoopbackTransport.prototype, "dispose");
  const open = vi.spyOn(DemoDatabase, "open");
  return { inspect, post, log, dispose, open, seenPrompts };
}

describe("Explicit local music proposal evaluation, mocked transport and real isolated DB", () => {
  it.each([
    [],
    ["--run-synthetic-music-proposal", "--cloud"],
    ["--other"],
    ["--run-synthetic-music-proposal", "--data-dir=private"],
  ])("requires an exact opt-in before any resources: %j", async (...args) => {
    const f = setup();
    await expect(runLocalMusicProposalEvaluation(args)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.inspect).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    expect(f.open).not.toHaveBeenCalled();
  });
  it("exercises the composed pipeline with three calls, protected facts and separate deterministic controls", async () => {
    const f = setup();
    const profiles = listEnvironmentBrainProfiles();
    const agents = structuredClone(agentManifests);
    const close = vi.spyOn(DemoDatabase.prototype, "close");
    const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const summary = await runLocalMusicProposalEvaluation(["--run-synthetic-music-proposal"]);
    expect(summary).toMatchObject({
      total: 3,
      successfulRankings: 3,
      providerAttempts: 3,
      modelResponsesDelivered: 3,
      excludedDataAbsent: true,
      businessUnchanged: true,
      deterministicControls: true,
      remainingCalls: 0,
      auditEvents: 30,
      automaticProductionActivation: false,
      humanReviewRequired: true,
    });
    expect(summary.promptHashes).toHaveLength(3);
    expect(summary.promptHashes.every((hash) => /^[a-f0-9]{64}$/u.test(hash))).toBe(true);
    expect(f.open).toHaveBeenCalledExactlyOnceWith({ dataDir: "memory://", seed: false });
    expect(f.post).toHaveBeenCalledTimes(3);
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(listEnvironmentBrainProfiles()).toEqual(profiles);
    expect(agentManifests).toEqual(agents);
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(listeners);
    expect(f.seenPrompts[1]).toContain('"ref":"R10"');
    for (const prompt of f.seenPrompts)
      expect(prompt).not.toMatch(/PRIVATE_DESCRIPTION_3187|FOREIGN_WORKSPACE_6204|eval_user|session_|updatedAt/);
    const events = f.log.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(
      events.filter((event) => event.type === "CASE").every((event) => event.referencesValid && event.groupingCorrect),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(
      /PRIVATE_DESCRIPTION_3187|FOREIGN_WORKSPACE_6204|token_digest|CANARY_RANK_8417/,
    );
  });
  it.each(["absent", "digest", "size"])("refuses %s before database and inference", async (change) => {
    const f = setup();
    f.inspect.mockResolvedValue(
      change === "absent"
        ? []
        : [
            {
              name: localPilot.name,
              digest: change === "digest" ? "a".repeat(64) : localPilot.digest,
              size: change === "size" ? 1 : localPilot.size,
            },
          ],
    );
    await expect(runLocalMusicProposalEvaluation(["--run-synthetic-music-proposal"])).rejects.toMatchObject({
      code: "NO_COMPATIBLE_MODEL",
    });
    expect(f.open).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });
  it("keeps safe refusals separate from successful rankings, with no retries or JSON repair", async () => {
    const f = setup();
    f.post.mockResolvedValue({
      status: 200,
      body: {
        done: true,
        done_reason: "stop",
        message: { role: "assistant", content: '```json\n{"orderedRefs":["R1"]}\n```' },
      },
    });
    const summary = await runLocalMusicProposalEvaluation(["--run-synthetic-music-proposal"]);
    expect(summary).toMatchObject({
      successfulRankings: 0,
      modelResponsesDelivered: 0,
      providerAttempts: 3,
      remainingCalls: 0,
      businessUnchanged: true,
    });
    expect(f.post).toHaveBeenCalledTimes(3);
    const cases = f.log.mock.calls.map(([line]) => JSON.parse(String(line))).filter((event) => event.type === "CASE");
    expect(cases).toHaveLength(3);
    expect(
      cases.every(
        (event) => event.errorCode === "INVALID_RESPONSE" && !event.referencesValid && !event.groupingCorrect,
      ),
    ).toBe(true);
  });
  it("does not mistake correct JSON and reference sets for correct grouping", async () => {
    const f = setup();
    f.post.mockImplementation(async (_path, body) => {
      const content = (body.messages as { content: string }[])[0]?.content ?? "";
      const payload = JSON.parse(content.split("\n").at(-1) ?? "{}");
      return {
        status: 200,
        body: {
          done: true,
          done_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({ orderedRefs: payload.facts.map((row: { ref: string }) => row.ref).reverse() }),
          },
        },
      };
    });
    const summary = await runLocalMusicProposalEvaluation(["--run-synthetic-music-proposal"]);
    expect(summary).toMatchObject({ modelResponsesDelivered: 3, successfulRankings: 0, businessUnchanged: true });
    const cases = f.log.mock.calls.map(([line]) => JSON.parse(String(line))).filter((event) => event.type === "CASE");
    expect(
      cases.every(
        (event) => event.referencesValid && event.factsPreserved && event.safeAnswer && !event.groupingCorrect,
      ),
    ).toBe(true);
  });
  it("redacts provider exceptions, does not request fallback and releases all resources", async () => {
    const f = setup();
    f.post.mockRejectedValue(new Error("PRIVATE_PROVIDER_BODY"));
    const close = vi.spyOn(DemoDatabase.prototype, "close");
    const summary = await runLocalMusicProposalEvaluation(["--run-synthetic-music-proposal"]);
    expect(summary.successfulRankings).toBe(0);
    expect(f.post).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(f.log.mock.calls)).not.toContain("PRIVATE_PROVIDER_BODY");
    expect(f.dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("cancels the remaining cases and closes its isolated database", async () => {
    const controller = new AbortController();
    const close = vi.spyOn(DemoDatabase.prototype, "close");
    const adapter = {
      providerKey: proposalPilotProviderKey,
      locality: "LOCAL" as const,
      generate: vi.fn(async () => {
        controller.abort();
        throw new IntelligenceError("CANCELLED");
      }),
    };
    await expect(runMusicProposalScenarios(adapter, () => {}, controller.signal)).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(adapter.generate).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("does not start the database or model for a cloud adapter or an already cancelled run", async () => {
    const open = vi.spyOn(DemoDatabase, "open");
    const generate = vi.fn();
    await expect(
      runMusicProposalScenarios({ providerKey: proposalPilotProviderKey, locality: "CLOUD", generate }, () => {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      runMusicProposalScenarios(
        { providerKey: proposalPilotProviderKey, locality: "LOCAL", generate },
        () => {},
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(open).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("keeps the pilot out of the application bootstrap", async () => {
    const app = await readFile(new URL("../app.ts", import.meta.url), "utf8");
    expect(app).not.toMatch(/run-music-proposal|music-proposal-scenario/);
    const runner = await readFile(new URL("./run-music-proposal.ts", import.meta.url), "utf8");
    expect(runner).toContain("process.argv[1] === fileURLToPath(import.meta.url)");
    expect(runner).not.toMatch(/child_process|process\.env|execFile|spawn\(/);
  });
});
