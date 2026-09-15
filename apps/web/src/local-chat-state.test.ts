import { describe, expect, it, vi } from "vitest";
import type { ChatExchange } from "../../../packages/contracts/src/local-chat";
import {
  chronologicalChat,
  PendingLocalChatRequests,
  readLocalChatReply,
  reconcileChatExchange,
} from "./local-chat-state";

const id = "a3ed6d8a-5c42-4e41-8a0b-724218d691bd";
const otherId = "b3ed6d8a-5c42-4e41-8a0b-724218d691bd";
const exchange: ChatExchange = {
  id,
  prompt: "Bonjour",
  answer: "Bonjour à vous.",
  provider: "ollama",
  model: "qwen:local",
  createdAt: "2026-09-14T10:00:00.000Z",
};
const request = { requestId: id, prompt: exchange.prompt };
const data = {
  text: exchange.answer,
  provider: "ollama",
  model: exchange.model,
  locality: "LOCAL",
  experimental: true,
};

describe("local chat client: saved evidence and uncertain retries", () => {
  it("reuses a request ID after uncertainty, including editing then returning to the same prompt", () => {
    const pending = new PendingLocalChatRequests();
    const createId = vi.fn().mockReturnValueOnce(id).mockReturnValueOnce(otherId);
    expect(pending.prepare(" Bonjour ", createId)).toEqual(request);
    expect(pending.prepare("Une autre question", createId).requestId).toBe(otherId);
    expect(pending.prepare("Bonjour", createId)).toEqual(request);
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("allocates a new request only after the previous response is confirmed", () => {
    const pending = new PendingLocalChatRequests();
    pending.prepare("Bonjour", () => id);
    pending.confirm({ ...request, requestId: otherId });
    expect(pending.prepare("Bonjour", () => otherId).requestId).toBe(id);
    pending.confirm(request);
    expect(pending.prepare("Bonjour", () => otherId).requestId).toBe(otherId);
  });

  it("rejects invalid draft IDs and keeps requests limited to the current prompt, not displayed history", () => {
    const pending = new PendingLocalChatRequests();
    expect(() => pending.prepare("Bonjour", () => "invalid-id")).toThrow();
    expect(() => pending.prepare(" ", () => id)).toThrow();
    expect(Object.keys(pending.prepare("Bonjour", () => id)).sort()).toEqual(["prompt", "requestId"]);
  });

  it("never labels a legacy response as persisted", () => {
    expect(readLocalChatReply({ data }, request)).toEqual({ text: data.text, exchange: undefined });
    expect(readLocalChatReply({ data: { ...data, exchange } }, request)).toEqual({ text: data.text, exchange });
  });

  it.each([{ id: otherId }, { prompt: "Autre demande" }, { answer: "Autre réponse" }, { model: "different-model" }])(
    "rejects a saved exchange that does not match the submitted request and answer: %j",
    (changed) => {
      expect(() => readLocalChatReply({ data: { ...data, exchange: { ...exchange, ...changed } } }, request)).toThrow();
    },
  );

  it("sorts oldest first without mutating server data and reconciles repeated saved IDs", () => {
    const later = { ...exchange, id: otherId, createdAt: "2026-09-14T11:00:00.000Z" };
    const items = [later, exchange];
    expect(chronologicalChat(items)).toEqual([exchange, later]);
    expect(items).toEqual([later, exchange]);
    expect(reconcileChatExchange(items, exchange)).toEqual([exchange, later]);
  });

  it("keeps raw model text as text, not executable markup", () => {
    const text = '<img src="x" onerror="steal()">';
    expect(readLocalChatReply({ data: { ...data, text } }, request).text).toBe(text);
  });
});
