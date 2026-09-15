import { randomUUID } from "node:crypto";
import { intelligenceScopeSchema } from "@ida/contracts/intelligence";
import {
  type ChatExchange,
  chatExchangeSchema,
  localChatHistoryLimit,
  localChatRetentionDays,
} from "@ida/contracts/local-chat";
import type { DemoDatabase } from "./database.js";

const scopeSchema = intelligenceScopeSchema.pick({ workspaceId: true, userId: true }).strip();
const saveSchema = chatExchangeSchema.omit({ createdAt: true });
export type LocalChatOwnerScope = { workspaceId: string; userId: string };
export type LocalChatReader = Pick<DemoDatabase["pglite"], "query">;
export type LocalChatRevalidate = (reader: LocalChatReader) => Promise<void>;
type ExchangeInput = Omit<ChatExchange, "createdAt">;

export class LocalChatStoreError extends Error {
  constructor(readonly code: "LOCAL_CHAT_STORE_UNAVAILABLE" | "LOCAL_CHAT_CONFLICT" = "LOCAL_CHAT_STORE_UNAVAILABLE") {
    super(code);
  }
}

const projection = `id, prompt, answer, provider, model, created_at AS "createdAt"`;
function exchange(row: Record<string, unknown>): ChatExchange {
  return chatExchangeSchema.parse({
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  });
}

/** Private completed pairs only. History is never a Memory Manager preference or model context. */
export class LocalChatStore {
  constructor(
    private readonly database: DemoDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async initialize(): Promise<void> {
    try {
      await this.database.pglite.transaction(async (tx) => {
        await tx.exec(`
          CREATE TABLE IF NOT EXISTS local_chat_exchanges (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            user_id TEXT NOT NULL REFERENCES users(id),
            id UUID NOT NULL,
            prompt TEXT NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 3000),
            answer TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 32768),
            provider TEXT NOT NULL CHECK (provider = 'ollama'),
            model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 160),
            created_at TIMESTAMPTZ NOT NULL,
            stored_order BIGINT GENERATED ALWAYS AS IDENTITY,
            PRIMARY KEY (workspace_id, user_id, id)
          );
          CREATE INDEX IF NOT EXISTS idx_local_chat_owner_recent
            ON local_chat_exchanges (workspace_id, user_id, created_at DESC, stored_order DESC);
        `);
        await this.purge(tx);
      });
    } catch {
      throw new LocalChatStoreError();
    }
  }

  async find(scope: LocalChatOwnerScope, id: string, revalidate: LocalChatRevalidate): Promise<ChatExchange | null> {
    return this.authorized(scope, revalidate, async (tx, owner) => {
      const parsedId = chatExchangeSchema.shape.id.parse(id);
      const result = await tx.query<Record<string, unknown>>(
        `SELECT ${projection} FROM local_chat_exchanges
         WHERE workspace_id = $1 AND user_id = $2 AND id = $3 AND created_at > $4`,
        [owner.workspaceId, owner.userId, parsedId, this.cutoff()],
      );
      return result.rows[0] ? exchange(result.rows[0]) : null;
    });
  }

  async list(scope: LocalChatOwnerScope, revalidate: LocalChatRevalidate): Promise<ChatExchange[]> {
    return this.authorized(scope, revalidate, async (tx, owner) => {
      const result = await tx.query<Record<string, unknown>>(
        `SELECT ${projection} FROM local_chat_exchanges
         WHERE workspace_id = $1 AND user_id = $2 AND created_at > $3
         ORDER BY created_at DESC, stored_order DESC LIMIT $4`,
        [owner.workspaceId, owner.userId, this.cutoff(), localChatHistoryLimit],
      );
      return result.rows.map(exchange);
    });
  }

  async save(scope: LocalChatOwnerScope, input: ExchangeInput, revalidate: LocalChatRevalidate): Promise<ChatExchange> {
    let value: ExchangeInput;
    try {
      // Copy before the first await, including the authority check.
      value = saveSchema.parse(input);
    } catch {
      throw new LocalChatStoreError();
    }
    return this.authorized(scope, revalidate, async (tx, owner) => {
      const createdAt = this.now().toISOString();
      await this.purge(tx, owner);
      const existing = await tx.query<Record<string, unknown>>(
        `SELECT ${projection} FROM local_chat_exchanges WHERE workspace_id = $1 AND user_id = $2 AND id = $3`,
        [owner.workspaceId, owner.userId, value.id],
      );
      if (existing.rows[0]) {
        const saved = exchange(existing.rows[0]);
        if (Object.entries(value).some(([key, field]) => saved[key as keyof ExchangeInput] !== field))
          throw new LocalChatStoreError("LOCAL_CHAT_CONFLICT");
        return saved;
      }
      await tx.query(
        `INSERT INTO local_chat_exchanges (workspace_id, user_id, id, prompt, answer, provider, model, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [owner.workspaceId, owner.userId, value.id, value.prompt, value.answer, value.provider, value.model, createdAt],
      );
      await tx.query(
        `INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload, created_at)
         VALUES ($1, $2, $3, 'chat.exchange.saved', 'chat_exchange', $4, '{}'::json, $5)`,
        [randomUUID(), owner.workspaceId, owner.userId, value.id, createdAt],
      );
      await this.purge(tx, owner);
      return chatExchangeSchema.parse({ ...value, createdAt });
    });
  }

  private cutoff(): string {
    return new Date(this.now().getTime() - localChatRetentionDays * 86_400_000).toISOString();
  }

  private async purge(tx: LocalChatReader, owner?: LocalChatOwnerScope): Promise<void> {
    await tx.query(
      `DELETE FROM local_chat_exchanges WHERE created_at <= $1${owner ? " AND workspace_id = $2 AND user_id = $3" : ""}`,
      owner ? [this.cutoff(), owner.workspaceId, owner.userId] : [this.cutoff()],
    );
    await tx.query(
      `DELETE FROM local_chat_exchanges WHERE (workspace_id, user_id, id) IN (
        SELECT workspace_id, user_id, id FROM (
          SELECT workspace_id, user_id, id,
            ROW_NUMBER() OVER (PARTITION BY workspace_id, user_id ORDER BY created_at DESC, stored_order DESC) AS position
          FROM local_chat_exchanges ${owner ? "WHERE workspace_id = $2 AND user_id = $3" : ""}
        ) ranked WHERE position > $1
      )`,
      owner ? [localChatHistoryLimit, owner.workspaceId, owner.userId] : [localChatHistoryLimit],
    );
  }

  private async authorized<T>(
    scope: LocalChatOwnerScope,
    revalidate: LocalChatRevalidate,
    work: (tx: LocalChatReader, owner: LocalChatOwnerScope) => Promise<T>,
  ): Promise<T> {
    let authorityError: unknown;
    let authorityFailed = false;
    const check = async (tx: LocalChatReader) => {
      try {
        await revalidate(tx);
      } catch (error) {
        authorityFailed = true;
        authorityError = error;
        throw error;
      }
    };
    try {
      const owner = scopeSchema.parse(scope);
      return await this.database.pglite.transaction(async (tx) => {
        await check(tx);
        const result = await work(tx, owner);
        await check(tx);
        return result;
      });
    } catch (error) {
      if (authorityFailed) throw authorityError;
      if (error instanceof LocalChatStoreError) throw error;
      throw new LocalChatStoreError();
    }
  }
}
