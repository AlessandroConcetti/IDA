import { IntelligenceError, type IntelligencePort } from "@ida/domain";
import { describe, expect, it, vi } from "vitest";
import { OllamaLoopbackTransport } from "../ollama-transport.js";
import {
  musicEvaluationCases,
  musicEvaluationScope,
  runMusicEvaluation,
  scoreMusicEvaluation,
} from "./music-librarian.js";
import { localPilot, runLocalModelEvaluation } from "./run-local-model.js";

function answer(caseId: string) {
  const item = musicEvaluationCases().find((entry) => entry.id === caseId);
  if (!item) throw new Error("Missing fixture");
  return { ...item.expected, answer: "Réponse synthétique à relire.", actions: [] };
}
describe("Explicit synthetic Music Librarian evaluation, no network", () => {
  it("requires the exact explicit CLI opt-in", async () => {
    expect(localPilot.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(localPilot)).toBe(true);
    await expect(runLocalModelEvaluation([])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(runLocalModelEvaluation(["--run-synthetic-local-evaluation", "--cloud"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("composes six bounded synthetic calls with a deadline margin and a shared quota", async () => {
    const prompts = musicEvaluationCases();
    const inspect = vi
      .spyOn(OllamaLoopbackTransport.prototype, "inspectInstalledModels")
      .mockResolvedValue([{ name: localPilot.name, digest: localPilot.digest, size: localPilot.size }]);
    const post = vi.spyOn(OllamaLoopbackTransport.prototype, "post").mockImplementation(async (_path, body) => {
      const content = (body.messages as { content: string }[])[0]?.content;
      const test = prompts.find((entry) => entry.prompt === content);
      if (!test) throw new Error("Unexpected non-synthetic request");
      return {
        status: 200,
        body: {
          done: true,
          done_reason: "stop",
          message: { role: "assistant", content: JSON.stringify(answer(test.id)) },
        },
      };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now++);
    try {
      await runLocalModelEvaluation(["--run-synthetic-local-evaluation"]);
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledTimes(6);
      const summary = log.mock.calls.map(([line]) => JSON.parse(String(line))).find((line) => line.type === "SUMMARY");
      expect(summary).toMatchObject({
        automaticCriteriaPassed: 6,
        total: 6,
        remainingCalls: 0,
        auditEvents: 12,
        humanReviewRequired: true,
        automaticProductionActivation: false,
      });
    } finally {
      inspect.mockRestore();
      post.mockRestore();
      log.mockRestore();
      clock.mockRestore();
    }
  });
  it("provides six versionable isolated fixtures with stable prompt hashes", () => {
    const first = musicEvaluationCases();
    expect(first).toHaveLength(6);
    expect(first.every((item) => item.promptHash.match(/^[a-f0-9]{64}$/) && item.prompt.length < 5000)).toBe(true);
    expect(musicEvaluationCases()).toEqual(first);
    first[0]?.expected.trackIds.push("mutated");
    expect(musicEvaluationCases()[0]?.expected.trackIds).toEqual(["t2"]);
  });
  it.each(musicEvaluationCases())("accepts the exact structured decision for $id", (item) => {
    expect(scoreMusicEvaluation(item.id, JSON.stringify(answer(item.id)))).toEqual({ passed: true, failures: [] });
  });
  it.each([
    { status: "EXECUTED" },
    { reason: "CONFIRMED" },
    { actions: [{ name: "publish_post" }] },
    { extra: "field" },
    { trackIds: ["t2", "t2"] },
    { answer: "" },
    { answer: "x".repeat(1201) },
    { trackIds: "t2" },
    { assetIds: [42] },
  ])("rejects invalid structured output: %j", (patch) => {
    expect(scoreMusicEvaluation("track_exact", JSON.stringify({ ...answer("track_exact"), ...patch }))).toEqual({
      passed: false,
      failures: ["INVALID_SCHEMA"],
    });
  });
  it.each(["null", "[]", "not JSON", "```json\n{}\n```", "x".repeat(8193)])(
    "does not repair malformed output",
    (text) => {
      expect(scoreMusicEvaluation("track_exact", text).passed).toBe(false);
    },
  );
  it.each([
    [{ trackIds: ["t1"] }, "WRONG_REFERENCES"],
    [{ status: "UNKNOWN" }, "WRONG_DECISION"],
    [{ missingFields: ["releaseDate"] }, "WRONG_MISSING_FIELDS"],
    [{ answer: "CANARY_IMPORT_9031" }, "IMPORTED_INSTRUCTION_FOLLOWED"],
    [{ answer: "https://example.invalid/invented" }, "INVENTED_LINK"],
  ])("detects each structured criterion independently", (patch, expected) => {
    expect(scoreMusicEvaluation("track_exact", JSON.stringify({ ...answer("track_exact"), ...patch }))).toEqual({
      passed: false,
      failures: [expected],
    });
  });
  it("rejects unknown fixture identifiers", () => {
    expect(() => scoreMusicEvaluation("other", "{}")).toThrow("IDA intelligence: INVALID_REQUEST");
  });
  it("uses only the common IntelligencePort with synthetic scope, limited tokens and sequential requests", async () => {
    let active = 0;
    let index = 0;
    const fixtures = musicEvaluationCases();
    const port = {
      generate: vi.fn<IntelligencePort["generate"]>(async (request) => {
        expect(active++).toBe(0);
        expect(request.scope).toEqual(musicEvaluationScope);
        expect(request.dataClasses).toEqual(["PUBLIC"]);
        expect(request.maxOutputTokens).toBe(512);
        expect(request.prompt).toBe(fixtures[index]?.prompt);
        const current = fixtures[index++];
        await Promise.resolve();
        active--;
        return { text: JSON.stringify(answer(current?.id ?? "")) };
      }),
    };
    const report = vi.fn();
    const results = await runMusicEvaluation(port, report);
    expect(results).toHaveLength(6);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(report).toHaveBeenCalledTimes(6);
    expect(port.generate).toHaveBeenCalledTimes(6);
  });
  it("reports errors without their raw provider body and never retries a case", async () => {
    const port = { generate: vi.fn<IntelligencePort["generate"]>().mockRejectedValue(new Error("SYNTHETIC_PRIVATE")) };
    const results = await runMusicEvaluation(port, () => {});
    expect(port.generate).toHaveBeenCalledTimes(6);
    expect(results.every((result) => result.errorCode === "INVALID_RESPONSE" && !result.passed)).toBe(true);
    expect(JSON.stringify(results)).not.toContain("SYNTHETIC_PRIVATE");
  });
  it("stops on cancellation without calling remaining cases", async () => {
    const controller = new AbortController();
    const port = {
      generate: vi.fn<IntelligencePort["generate"]>(async () => {
        controller.abort();
        throw new IntelligenceError("CANCELLED");
      }),
    };
    await expect(runMusicEvaluation(port, () => {}, controller.signal)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(port.generate).toHaveBeenCalledTimes(1);
    await expect(runMusicEvaluation(port, () => {}, controller.signal)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(port.generate).toHaveBeenCalledTimes(1);
  });
});
