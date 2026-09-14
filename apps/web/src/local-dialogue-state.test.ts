import { describe, expect, it } from "vitest";
import { allocationStatusLabel, readLocalDialogueReply, readLocalDialogueStatus } from "./local-dialogue-state";

const meta = { model: "qwen:local", locality: "LOCAL", experimental: true };
describe("Local dialogue: evidence, not false connection", () => {
  it.each(["DISABLED", "BUSY", "MODEL_MISSING", "UNAVAILABLE"])("does not present %s as ready", (state) => {
    const result = readLocalDialogueStatus({ data: { ...meta, state } });
    expect(result.ready).toBe(false);
    expect(result.state).toBe(state);
    expect(result.message.length).toBeGreaterThan(20);
  });
  it("only accepts explicit validated local readiness", () => {
    expect(readLocalDialogueStatus({ data: { ...meta, state: "READY" } }).ready).toBe(true);
    for (const value of [
      null,
      {},
      { data: [] },
      { data: { state: "READY" } },
      { data: { ...meta, state: "CONNECTED" } },
      { data: { ...meta, state: "READY", locality: "CLOUD" } },
      { data: { ...meta, state: "READY", experimental: false } },
    ]) {
      expect(() => readLocalDialogueStatus(value)).toThrow();
    }
  });
  it("keeps plain answer text but refuses missing or nonlocal responses", () => {
    const data = { ...meta, provider: "ollama", text: "<b>Texte non exécuté</b>" };
    expect(readLocalDialogueReply({ data })).toBe(data.text);
    for (const changed of [{ text: " " }, { text: "x".repeat(32769) }, { provider: "cloud" }, { locality: "CLOUD" }]) {
      expect(() => readLocalDialogueReply({ data: { ...data, ...changed } })).toThrow();
    }
  });
  it("does not confuse an ephemeral local allocation with cloud quota or connectivity", () => {
    expect(allocationStatusLabel({ key: "ollama", locality: "LOCAL", status: "NOT_CONFIGURED" })).toBe(
      "Allocation non ouverte",
    );
    expect(allocationStatusLabel({ key: "ollama", locality: "LOCAL", status: "QUOTA_EXCEEDED" })).toBe(
      "Allocation consommée",
    );
    expect(allocationStatusLabel({ key: "cloud", locality: "CLOUD", status: "QUOTA_EXCEEDED" })).toBeUndefined();
    expect(allocationStatusLabel({ key: "other-local", locality: "LOCAL", status: "QUOTA_EXCEEDED" })).toBeUndefined();
    expect(allocationStatusLabel({ key: "ollama", locality: "LOCAL", status: "UNAVAILABLE" })).toBeUndefined();
  });
});
