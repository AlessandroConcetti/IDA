import { z } from "zod";

export const localChatRetentionDays = 30;
export const localChatHistoryLimit = 100;
const prompt = z.string().trim().min(1).max(3000);
const answer = z.string().min(1).max(32768);
const model = z.string().min(1).max(160);
const requestId = z.string().uuid().toLowerCase();

export const localChatRequestSchema = z.object({ prompt, requestId: requestId.optional() }).strict();

export const chatExchangeSchema = z
  .object({
    id: requestId,
    prompt,
    answer,
    provider: z.literal("ollama"),
    model,
    createdAt: z.string().datetime(),
  })
  .strict();
export type ChatExchange = z.infer<typeof chatExchangeSchema>;

export const localChatHistoryResponseSchema = z
  .object({
    data: z
      .object({
        items: z.array(chatExchangeSchema).max(localChatHistoryLimit),
        retentionDays: z.literal(localChatRetentionDays),
      })
      .strict(),
  })
  .strict();

export const localChatReplyResponseSchema = z
  .object({
    data: z
      .object({
        text: answer,
        provider: z.literal("ollama"),
        model,
        locality: z.literal("LOCAL"),
        experimental: z.literal(true),
        exchange: chatExchangeSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    ({ data }) =>
      !data.exchange ||
      (data.exchange.answer === data.text &&
        data.exchange.model === data.model &&
        data.exchange.provider === data.provider),
    "Inconsistent saved exchange",
  );

export type LocalChatRequest = z.infer<typeof localChatRequestSchema>;
