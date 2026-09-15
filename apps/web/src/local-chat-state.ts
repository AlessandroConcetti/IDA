import {
  type ChatExchange,
  localChatReplyResponseSchema,
  localChatRequestSchema,
} from "../../../packages/contracts/src/local-chat";
import { readLocalDialogueReply } from "./local-dialogue-state";

export type PendingLocalChatRequest = { prompt: string; requestId: string };

/** Ephemeral IDs only: no storage, credentials, timers or network operations. */
export class PendingLocalChatRequests {
  private readonly requests = new Map<string, string>();

  prepare(prompt: string, createId: () => string): PendingLocalChatRequest {
    const text = prompt.trim();
    const requestId = this.requests.get(text) ?? createId();
    localChatRequestSchema.parse({ prompt: text, requestId });
    this.requests.set(text, requestId);
    return { prompt: text, requestId };
  }

  confirm(request: PendingLocalChatRequest): void {
    if (this.requests.get(request.prompt) === request.requestId) this.requests.delete(request.prompt);
  }
}

export function readLocalChatReply(payload: unknown, request: PendingLocalChatRequest) {
  const text = readLocalDialogueReply(payload);
  const { data } = localChatReplyResponseSchema.parse(payload);
  if (data.exchange && (data.exchange.prompt !== request.prompt || data.exchange.id !== request.requestId)) {
    throw new Error("LOCAL_CHAT_EXCHANGE_MISMATCH");
  }
  return { text, exchange: data.exchange };
}

export function chronologicalChat(items: ChatExchange[]): ChatExchange[] {
  return [...items].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
  );
}

export function reconcileChatExchange(items: ChatExchange[], exchange: ChatExchange): ChatExchange[] {
  return chronologicalChat([...items.filter((item) => item.id !== exchange.id), exchange]).slice(-100);
}
