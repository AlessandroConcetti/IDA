import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  chatExchangeSchema,
  localChatHistoryResponseSchema,
  localChatReplyResponseSchema,
  localChatRequestSchema,
} from "@ida/contracts/local-chat";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoDatabase } from "./database.js";
import { demoContext } from "./demo-context.js";
import { type LocalChatRevalidate, LocalChatStore, LocalChatStoreError } from "./local-chat-store.js";

let database: DemoDatabase;
let instant = new Date("2026-09-14T12:00:00.000Z");
let store: LocalChatStore;
const owner = { workspaceId: demoContext.workspaceId, userId: demoContext.userId };
const colleague = { workspaceId: demoContext.workspaceId, userId: "usr_chat_other" };
const otherWorkspace = { workspaceId: "wsp_chat_other", userId: demoContext.userId };
const noRestriction: LocalChatRevalidate = async () => {};
async function removeIsolatedFixture(dir: string, root: string) {
  const target = await realpath(dir);
  if (dirname(target) !== root || !basename(target).startsWith("ida-chat-store-"))
    throw new Error("Unsafe test cleanup");
  await rm(target, { recursive: true, force: true });
}
const pair = () => ({
  id: randomUUID(),
  prompt: "Question synthétique",
  answer: "Réponse synthétique",
  provider: "ollama" as const,
  model: "synthetic-model",
});

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://" });
  await database.pglite.query(
    "INSERT INTO users (id,email,display_name,timezone) VALUES ('usr_chat_other','other@synthetic.invalid','Other','UTC')",
  );
  await database.pglite.query(
    "INSERT INTO workspaces (id,name,timezone,locale,owner_user_id) VALUES ('wsp_chat_other','Other','UTC','fr',$1)",
    [demoContext.userId],
  );
  store = new LocalChatStore(database, () => instant);
  await store.initialize();
});
beforeEach(async () => {
  instant = new Date("2026-09-14T12:00:00.000Z");
  await database.pglite.exec(
    "DELETE FROM local_chat_exchanges; DELETE FROM activity_logs WHERE action = 'chat.exchange.saved'",
  );
});
afterAll(async () => database.close());

const count = async () =>
  Number((await database.pglite.query<{ n: number }>("SELECT COUNT(*) AS n FROM local_chat_exchanges")).rows[0]?.n);
const audit = async () =>
  (
    await database.pglite.query<Record<string, unknown>>(
      "SELECT * FROM activity_logs WHERE action = 'chat.exchange.saved'",
    )
  ).rows;

describe("Local chat completed pair store", () => {
  it("saves a complete pair and content-free audit atomically, then lists newest first", async () => {
    const first = pair();
    const saved = await store.save(owner, first, noRestriction);
    instant = new Date(instant.getTime() + 1000);
    const second = await store.save(owner, pair(), noRestriction);
    expect(saved).toEqual({ ...first, createdAt: "2026-09-14T12:00:00.000Z" });
    expect(await store.list(owner, noRestriction)).toEqual([second, saved]);
    expect(await store.find(owner, first.id, noRestriction)).toEqual(saved);
    const rows = await audit();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      workspace_id: owner.workspaceId,
      actor_user_id: owner.userId,
      action: "chat.exchange.saved",
      entity_type: "chat_exchange",
      payload: {},
    });
    expect(JSON.stringify(rows)).not.toMatch(/Question synthétique|Réponse synthétique|prompt|answer/u);
  });

  it("isolates by both workspace and user, including colliding request IDs", async () => {
    const input = pair();
    const mine = await store.save(owner, input, noRestriction);
    expect(await store.find(colleague, input.id, noRestriction)).toBeNull();
    expect(await store.find(otherWorkspace, input.id, noRestriction)).toBeNull();
    expect(await store.list(colleague, noRestriction)).toEqual([]);
    const theirs = await store.save(colleague, { ...input, answer: "Other answer" }, noRestriction);
    const elsewhere = await store.save(otherWorkspace, { ...input, answer: "Elsewhere answer" }, noRestriction);
    expect(await store.list(owner, noRestriction)).toEqual([mine]);
    expect(await store.list(colleague, noRestriction)).toEqual([theirs]);
    expect(await store.list(otherWorkspace, noRestriction)).toEqual([elsewhere]);
  });

  it("is idempotent for the same complete pair but refuses a changed duplicate", async () => {
    const input = pair();
    const first = await store.save(owner, input, noRestriction);
    instant = new Date(instant.getTime() + 1000);
    expect(await store.save(owner, input, noRestriction)).toEqual(first);
    await expect(store.save(owner, { ...input, answer: "Changed" }, noRestriction)).rejects.toMatchObject({
      code: "LOCAL_CHAT_CONFLICT",
    });
    expect(await count()).toBe(1);
    expect(await audit()).toHaveLength(1);
  });

  it("normalizes UUID case and serializes concurrent duplicates without duplicate audit", async () => {
    const input = pair();
    const [first, second] = await Promise.all([
      store.save(owner, input, noRestriction),
      store.save(owner, { ...input, id: input.id.toUpperCase() }, noRestriction),
    ]);
    expect(first).toEqual(second);
    expect(await store.find(owner, input.id.toUpperCase(), noRestriction)).toEqual(first);
    expect(await count()).toBe(1);
    expect(await audit()).toHaveLength(1);
  });

  it("rolls back the pair if its audit insert fails", async () => {
    await database.pglite.exec(`
      CREATE FUNCTION reject_synthetic_chat_audit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'Synthetic audit unavailable'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_synthetic_chat_audit BEFORE INSERT ON activity_logs
      FOR EACH ROW WHEN (NEW.action = 'chat.exchange.saved') EXECUTE FUNCTION reject_synthetic_chat_audit();
    `);
    try {
      await expect(store.save(owner, pair(), noRestriction)).rejects.toMatchObject({
        code: "LOCAL_CHAT_STORE_UNAVAILABLE",
      });
      expect(await count()).toBe(0);
    } finally {
      await database.pglite.exec(
        "DROP TRIGGER reject_synthetic_chat_audit ON activity_logs; DROP FUNCTION reject_synthetic_chat_audit()",
      );
    }
  });

  it.each(["save", "find", "list"] as const)(
    "revalidates before and after %s using one transaction reader",
    async (method) => {
      const input = pair();
      const check = vi.fn(noRestriction);
      if (method === "save") await store.save(owner, input, check);
      else if (method === "find") await store.find(owner, input.id, check);
      else await store.list(owner, check);
      expect(check).toHaveBeenCalledTimes(2);
      expect(check.mock.calls[0]?.[0]).toBe(check.mock.calls[1]?.[0]);
      expect(check.mock.calls[0]?.[0]).not.toBe(database.pglite);
    },
  );

  it("rolls back the pair and its audit when authority is revoked before delivery", async () => {
    const forbidden = new Error("SYNTHETIC_REVOKED");
    const check = vi.fn(noRestriction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(forbidden);
    await expect(store.save(owner, pair(), check)).rejects.toBe(forbidden);
    expect(await count()).toBe(0);
    expect(await audit()).toHaveLength(0);
  });

  it.each(["find", "list"] as const)("returns no %s result if post-read authority check fails", async (method) => {
    const saved = await store.save(owner, pair(), noRestriction);
    const forbidden = new Error("SYNTHETIC_REVOKED");
    const check = vi.fn(noRestriction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(forbidden);
    await expect(method === "find" ? store.find(owner, saved.id, check) : store.list(owner, check)).rejects.toBe(
      forbidden,
    );
  });

  it("rejects malformed and incomplete pairs without storing a prompt alone", async () => {
    for (const input of [
      { ...pair(), answer: "" },
      { ...pair(), prompt: " " },
      { ...pair(), answer: "x".repeat(32769) },
      { ...pair(), secret: "rejected" },
    ]) {
      await expect(store.save(owner, input, noRestriction)).rejects.toBeInstanceOf(LocalChatStoreError);
    }
    expect(await count()).toBe(0);
    expect(await audit()).toHaveLength(0);
  });

  it("copies the input before awaiting revalidation", async () => {
    const input = pair();
    const original = { ...input };
    const check: LocalChatRevalidate = async () => {
      input.prompt = "Mutated";
    };
    expect(await store.save(owner, input, check)).toMatchObject(original);
  });

  it("hides expired history on reads without mutating it, and purges on save", async () => {
    const old = await store.save(owner, pair(), noRestriction);
    instant = new Date("2026-10-14T12:00:00.000Z");
    expect(await store.find(owner, old.id, noRestriction)).toBeNull();
    expect(await store.list(owner, noRestriction)).toEqual([]);
    expect(await count()).toBe(1);
    const fresh = await store.save(owner, pair(), noRestriction);
    expect(await store.list(owner, noRestriction)).toEqual([fresh]);
    expect(await count()).toBe(1);
  });

  it("retains at most 100 pairs per owner, preserving newest insertion when timestamps tie", async () => {
    const peer = await store.save(colleague, pair(), noRestriction);
    const ids: string[] = [];
    for (let index = 0; index < 102; index++) ids.push((await store.save(owner, pair(), noRestriction)).id);
    const history = await store.list(owner, noRestriction);
    expect(history.map((row) => row.id)).toEqual(ids.slice(2).reverse());
    expect(await store.find(owner, ids[0] as string, noRestriction)).toBeNull();
    expect(await store.list(colleague, noRestriction)).toEqual([peer]);
  });

  it("purges expired data on initialization and keeps initialization repeatable", async () => {
    await store.save(owner, pair(), noRestriction);
    instant = new Date("2026-10-15T12:00:00.000Z");
    await store.initialize();
    await store.initialize();
    expect(await count()).toBe(0);
  });

  it("returns generic errors for database/FK failures, not SQL or content", async () => {
    const failure = await store.save({ ...owner, userId: "missing" }, pair(), noRestriction).catch((error) => error);
    expect(failure).toBeInstanceOf(LocalChatStoreError);
    expect(failure.message).toBe("LOCAL_CHAT_STORE_UNAVAILABLE");
    expect(await count()).toBe(0);
  });

  it("survives reopening an isolated disk database, without accessing the real workspace database", async () => {
    const root = await realpath(tmpdir());
    const dir = await mkdtemp(join(root, "ida-chat-store-"));
    let disk: DemoDatabase | undefined;
    try {
      disk = await DemoDatabase.open({ dataDir: dir });
      let diskStore = new LocalChatStore(disk, () => instant);
      await diskStore.initialize();
      const saved = await diskStore.save(owner, pair(), noRestriction);
      await disk.close();
      disk = await DemoDatabase.open({ dataDir: dir, seed: false });
      diskStore = new LocalChatStore(disk, () => instant);
      await diskStore.initialize();
      expect(await diskStore.list(owner, noRestriction)).toEqual([saved]);
    } finally {
      await disk?.close();
      await removeIsolatedFixture(dir, root);
    }
  });
});

describe("Local chat strict wire contracts", () => {
  it("trims the prompt and rejects caller-controlled scope, provider and empty text", () => {
    expect(localChatRequestSchema.parse({ prompt: "  bonjour  " })).toEqual({ prompt: "bonjour" });
    expect(localChatRequestSchema.safeParse({ prompt: " ", requestId: randomUUID() }).success).toBe(false);
    expect(localChatRequestSchema.safeParse({ prompt: "ok", workspaceId: "other" }).success).toBe(false);
    expect(localChatRequestSchema.safeParse({ prompt: "ok", provider: "cloud" }).success).toBe(false);
  });
  it("requires UTC dates and matching saved answers, and bounds history", () => {
    const saved = { ...pair(), createdAt: "2026-09-14T12:00:00.000Z" };
    const data = {
      text: saved.answer,
      provider: "ollama",
      model: saved.model,
      locality: "LOCAL",
      experimental: true,
      exchange: saved,
    };
    expect(localChatReplyResponseSchema.safeParse({ data }).success).toBe(true);
    expect(localChatReplyResponseSchema.safeParse({ data: { ...data, text: "Mismatch" } }).success).toBe(false);
    expect(chatExchangeSchema.safeParse({ ...saved, createdAt: "2026-09-14T14:00:00+02:00" }).success).toBe(false);
    expect(
      localChatHistoryResponseSchema.safeParse({ data: { items: Array(101).fill(saved), retentionDays: 30 } }).success,
    ).toBe(false);
  });
});
