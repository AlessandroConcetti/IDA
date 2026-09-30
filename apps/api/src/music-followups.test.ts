import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { musicFollowupListSchema, musicFollowupResponseSchema } from "@ida/contracts";
import { ToolGateway, ToolPolicyError } from "@ida/domain";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

let app: Awaited<ReturnType<typeof createApp>>;
let database: DemoDatabase;
let directory: string;
const send = (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    ...(payload ? { headers: { "content-type": "application/json" }, payload: JSON.stringify(payload) } : {}),
  });
const input = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  expectedContactRevision: 0,
  title: "Relance manuelle de recette",
  description: "Vérifier personnellement les disponibilités.",
  dueAt: "2026-10-15T08:30:00.000Z",
  timeZone: "Europe/Paris",
  ...extra,
});
async function contact(extra: Record<string, unknown> = {}) {
  const result = await send("POST", "/v1/music/contacts", {
    idempotencyKey: randomUUID(),
    artistProjectId: "prj_demo_aless",
    organisation: `Recette ${randomUUID()}`,
    kind: "PRIVATE_VENUE",
    email: `recette-${randomUUID()}@example.com`,
    sourceUrl: "https://music.example.com/contact",
    ...extra,
  });
  expect(result.statusCode, result.body).toBe(201);
  return result.json().data;
}
const create = (id: string, payload: unknown) => send("POST", `/v1/music/contacts/${id}/followups`, payload);
const list = (q = "") => send("GET", `/v1/music/followups${q}`);
async function counts() {
  return (
    await database.pglite.query<{ tasks: number; links: number; audits: number }>(
      `SELECT (SELECT count(*)::int FROM tasks) AS tasks,
      (SELECT count(*)::int FROM music_contact_followups) AS links,
      (SELECT count(*)::int FROM activity_logs WHERE action IN ('task.created','music.followup.created')) AS audits`,
    )
  ).rows[0];
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ida-music-followups-"));
  database = await DemoDatabase.open({ dataDir: join(directory, "database") });
  const open = vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  app = await createApp({ dataDir: join(directory, "database") });
  open.mockRestore();
});
beforeEach(async () => {
  await database.pglite.query("UPDATE identity_sessions SET status='ACTIVE',revoked_at=NULL WHERE id=$1", [
    demoIdentity.sessionId,
  ]);
  await database.pglite.query(
    "UPDATE client_workspace_grants SET access_level='TRUSTED' WHERE client_instance_id=$1 AND workspace_id=$2",
    [demoIdentity.clientInstanceId, demoContext.workspaceId],
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

it("creates one common TASKS task without copying source contact data or making external calls", async () => {
  const c = await contact();
  const before = await counts();
  const payload = input();
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
  const result = await create(c.id, payload);
  expect(result.statusCode, result.body).toBe(201);
  const response = musicFollowupResponseSchema.parse(result.json());
  const f = response.data;
  expect(response.replayed).toBe(false);
  expect(f).toMatchObject({
    musicContactId: c.id,
    artistProjectId: c.artistProjectId,
    organisation: c.organisation,
    timeZone: payload.timeZone,
    task: {
      title: payload.title,
      description: payload.description,
      dueAt: payload.dueAt,
      status: "TODO",
      completedAt: null,
    },
  });
  expect((await list(`?musicContactId=${c.id}`)).json().data).toEqual([f]);
  const tasks = (await send("GET", "/v1/tasks")).json().data;
  expect(tasks.find((task: { id: string }) => task.id === f.task.id)).toMatchObject({
    id: f.task.id,
    title: f.task.title,
    description: f.task.description,
    status: f.task.status,
    dueAt: f.task.dueAt,
    createdAt: f.task.createdAt,
  });
  expect(JSON.stringify(f.task)).not.toContain(c.email);
  expect(JSON.stringify(f.task)).not.toContain(c.sourceUrl);
  expect((await send("GET", `/v1/music/contacts/${c.id}`)).json().data.stage).toBe("DISCOVERED");
  expect(await counts()).toEqual({
    tasks: (before?.tasks ?? 0) + 1,
    links: (before?.links ?? 0) + 1,
    audits: (before?.audits ?? 0) + 2,
  });
  const audit = await database.pglite.query("SELECT payload FROM activity_logs WHERE entity_id IN ($1,$2)", [
    f.id,
    f.task.id,
  ]);
  expect(audit.rows).toHaveLength(2);
  const serialized = JSON.stringify(audit.rows);
  for (const privateText of [payload.title, payload.description, c.email, c.sourceUrl, c.organisation])
    expect(serialized).not.toContain(privateText);
  expect(network).not.toHaveBeenCalled();
});

it("projects shared completion and every active/final task state without advancing the CRM", async () => {
  const c = await contact();
  const f = musicFollowupResponseSchema.parse((await create(c.id, input())).json()).data;
  expect((await list(`?taskId=${f.task.id}&state=OPEN`)).json().data).toHaveLength(1);
  expect((await list(`?taskId=${f.task.id}&state=CLOSED`)).json().data).toEqual([]);
  await database.pglite.query("UPDATE tasks SET status='IN_PROGRESS' WHERE id=$1", [f.task.id]);
  expect((await list(`?taskId=${f.task.id}&state=OPEN`)).json().data[0].task.status).toBe("IN_PROGRESS");
  const done = await send("POST", `/v1/tasks/${f.task.id}/complete`, {});
  expect(done.statusCode, done.body).toBe(200);
  const closed = musicFollowupListSchema.parse((await list(`?taskId=${f.task.id}&state=CLOSED`)).json()).data[0];
  expect(closed?.task).toMatchObject({ status: "DONE", completedAt: done.json().data.completedAt });
  expect(closed?.task.completedAt).not.toBeNull();
  expect((await list(`?taskId=${f.task.id}&state=OPEN`)).json().data).toEqual([]);
  expect((await send("POST", `/v1/tasks/${f.task.id}/complete`, {})).statusCode).toBe(200);
  expect((await send("GET", `/v1/music/contacts/${c.id}`)).json().data.stage).toBe("DISCOVERED");
  await database.pglite.query("UPDATE tasks SET status='CANCELLED' WHERE id=$1", [f.task.id]);
  expect((await list(`?taskId=${f.task.id}&state=CLOSED`)).json().data[0].task.status).toBe("CANCELLED");
});

it("normalizes idempotency, rejects divergent reuse, and replays a lost response after source revision changes", async () => {
  const c = await contact();
  const payload = input({
    title: "  Rappeler demain  ",
    description: "  Vérifier les disponibilités  ",
    dueAt: "2026-10-15T08:30:00Z",
  });
  const result = await create(c.id, payload);
  expect(result.statusCode, result.body).toBe(201);
  const f = musicFollowupResponseSchema.parse(result.json()).data;
  const before = await counts();
  expect(
    (await send("PATCH", `/v1/music/contacts/${c.id}`, { expectedRevision: 0, organisation: "Organisation révisée" }))
      .statusCode,
  ).toBe(200);
  const retry = await create(c.id, {
    ...payload,
    title: "Rappeler demain",
    description: "Vérifier les disponibilités",
    dueAt: "2026-10-15T08:30:00.000Z",
    expectedContactRevision: 1,
  });
  expect(retry.statusCode, retry.body).toBe(200);
  expect(retry.json()).toMatchObject({
    replayed: true,
    data: { id: f.id, organisation: "Organisation révisée", task: f.task },
  });
  expect((await create(c.id, payload)).json().replayed).toBe(true);
  for (const change of [
    { title: "Autre" },
    { description: "Autre" },
    { dueAt: "2026-10-16T08:30:00Z" },
    { timeZone: "UTC" },
  ]) {
    const conflict = await create(c.id, { ...payload, ...change });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("MUSIC_FOLLOWUP_IDEMPOTENCY_CONFLICT");
  }
  expect(await counts()).toEqual(before);
  expect((await create(c.id, input())).statusCode).toBe(409);
  expect(await counts()).toEqual(before);
  expect((await create(c.id, input({ expectedContactRevision: 1, description: undefined }))).statusCode).toBe(201);
});

it("serializes concurrent identical or conflicting requests into one task and one link", async () => {
  const c = await contact();
  const payload = input();
  const before = await counts();
  const responses = await Promise.all([create(c.id, payload), create(c.id, payload), create(c.id, payload)]);
  expect(responses.map((result) => result.statusCode).sort()).toEqual([200, 200, 201]);
  expect(new Set(responses.map((result) => result.json().data.id)).size).toBe(1);
  expect(new Set(responses.map((result) => result.json().data.task.id)).size).toBe(1);
  expect(await counts()).toEqual({
    tasks: (before?.tasks ?? 0) + 1,
    links: (before?.links ?? 0) + 1,
    audits: (before?.audits ?? 0) + 2,
  });
  const divergent = input();
  const mixed = await Promise.all([
    create(c.id, divergent),
    create(c.id, { ...divergent, title: "Concurrent différent" }),
  ]);
  expect(mixed.map((result) => result.statusCode).sort()).toEqual([201, 409]);
});

it("rejects strict path/body/query violations and excessive body size before storing data", async () => {
  const c = await contact();
  const before = await counts();
  const base = input();
  for (const patch of [
    { title: " " },
    { title: "a".repeat(241) },
    { title: "x\u0000y" },
    { description: " " },
    { description: "a".repeat(4001) },
    { description: "x\u0000y" },
    { dueAt: "2026-02-30T09:00:00Z" },
    { dueAt: "2026-10-15T08:30:00" },
    { dueAt: null },
    { timeZone: "Mars/Olympus" },
    { timeZone: "" },
    { expectedContactRevision: -1 },
    { expectedContactRevision: 0.5 },
    { idempotencyKey: "not-uuid" },
    { status: "DONE" },
    { workspaceId: "wsp_other" },
    { taskId: "task_other" },
    { send: true },
  ]) {
    const result = await create(c.id, { ...base, ...patch });
    expect(result.statusCode, `${JSON.stringify(patch)}: ${result.body}`).toBe(400);
  }
  for (const query of [
    "?state=INVALID",
    "?state=OPEN&state=CLOSED",
    "?offset=-1",
    "?offset=20001",
    "?offset=0.5",
    "?taskId=../x",
    "?musicContactId=no",
    "?workspaceId=wsp_other",
  ]) {
    expect((await list(query)).statusCode, query).toBe(400);
  }
  expect((await create("bad-id", base)).statusCode).toBe(400);
  expect((await send("POST", `/v1/music/contacts/${c.id}/followups?send=true`, base)).statusCode).toBe(400);
  expect((await create(c.id, { ...base, description: "a".repeat(65536) })).statusCode).toBe(413);
  expect(await counts()).toEqual(before);
  const multibyte = await create(c.id, input({ title: "漢".repeat(240), description: "字".repeat(4000) }));
  expect(multibyte.statusCode, multibyte.body).toBe(201);
  expect(multibyte.json().data.task.description).toBe("字".repeat(4000));
});

it("hides foreign contacts and tasks and enforces composite workspace references", async () => {
  const foreignContact = `mct_${randomUUID().replaceAll("-", "")}`;
  const shared = `wct_${randomUUID().replaceAll("-", "")}`;
  const foreignTask = `task_${randomUUID().replaceAll("-", "")}`;
  const foreignLink = `mfu_${randomUUID().replaceAll("-", "")}`;
  await database.pglite.query(
    "INSERT INTO workspace_contacts(id,workspace_id,organisation,identity_key,source_url,creator_user_id) VALUES($1,'wsp_other','Foreign',$2,'https://music.example.com/','usr_other')",
    [shared, "d".repeat(64)],
  );
  await database.pglite.query(
    "INSERT INTO music_contact_links(id,workspace_id,contact_id,artist_project_id,kind,creator_user_id,idempotency_key,content_hash) VALUES($1,'wsp_other',$2,'prj_other_workspace','LABEL','usr_other',$3,$4)",
    [foreignContact, shared, randomUUID(), "e".repeat(64)],
  );
  await database.pglite.query(
    "INSERT INTO tasks(id,workspace_id,title,status) VALUES($1,'wsp_other','Private task','TODO')",
    [foreignTask],
  );
  await database.pglite.query(
    "INSERT INTO music_contact_followups(id,workspace_id,music_contact_id,task_id,time_zone,creator_user_id,idempotency_key,content_hash) VALUES($1,'wsp_other',$2,$3,'UTC','usr_other',$4,$5)",
    [foreignLink, foreignContact, foreignTask, randomUUID(), "f".repeat(64)],
  );
  const before = await counts();
  const foreign = await create(foreignContact, input());
  const absent = await create(`mct_${"0".repeat(32)}`, input());
  expect(foreign.statusCode).toBe(404);
  expect(foreign.json()).toEqual(absent.json());
  expect((await list(`?musicContactId=${foreignContact}`)).json().data).toEqual([]);
  expect((await list(`?taskId=${foreignTask}`)).json().data).toEqual([]);
  expect((await send("POST", `/v1/tasks/${foreignTask}/complete`, {})).statusCode).toBe(404);
  const c = await contact();
  const own = musicFollowupResponseSchema.parse((await create(c.id, input())).json()).data;
  await expect(
    database.pglite.query("UPDATE music_contact_followups SET task_id=$1 WHERE id=$2", [foreignTask, own.id]),
  ).rejects.toThrow();
  await expect(
    database.pglite.query("UPDATE music_contact_followups SET music_contact_id=$1 WHERE id=$2", [
      foreignContact,
      own.id,
    ]),
  ).rejects.toThrow();
  expect(await counts()).toEqual({
    tasks: (before?.tasks ?? 0) + 1,
    links: (before?.links ?? 0) + 1,
    audits: (before?.audits ?? 0) + 2,
  });
});

it("rolls back a shared completion and its audit when the identity is revoked before commit", async () => {
  const c = await contact();
  const f = musicFollowupResponseSchema.parse((await create(c.id, input())).json()).data;
  const resolve = database.resolveRequestIdentityContext.bind(database);
  let checks = 0;
  const revoked = vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
    if (args[3] && ++checks > 1) return null;
    return resolve(...args);
  });
  const result = await send("POST", `/v1/tasks/${f.task.id}/complete`, {});
  expect(result.statusCode, result.body).toBe(401);
  revoked.mockRestore();
  expect((await list(`?taskId=${f.task.id}`)).json().data[0].task.status).toBe("TODO");
  expect(
    (
      await database.pglite.query("SELECT id FROM activity_logs WHERE action='task.completed' AND entity_id=$1", [
        f.task.id,
      ])
    ).rows,
  ).toEqual([]);
  expect((await send("POST", `/v1/tasks/${f.task.id}/complete`, {})).statusCode).toBe(200);
  expect((await list(`?taskId=${f.task.id}`)).json().data[0].task.status).toBe("DONE");
});

it("requires every Music/TASKS grant including replays and respects VIEW_ONLY", async () => {
  const c = await contact();
  const payload = input();
  const f = musicFollowupResponseSchema.parse((await create(c.id, payload)).json()).data;
  const before = await counts();
  const original = ToolGateway.prototype.assertAuthorized;
  for (const key of ["read_music_followups", "read_music_contacts", "create_music_followup", "create_task"]) {
    const guard = vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(function (
      this: ToolGateway,
      tool,
    ) {
      if (tool.toolKey === key) throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Denied");
      return original.call(this, tool);
    });
    if (key === "read_music_followups" || key === "read_music_contacts")
      expect((await list(`?taskId=${f.task.id}`)).statusCode).toBe(403);
    if (key !== "read_music_followups") {
      expect((await create(c.id, input())).statusCode).toBe(403);
      expect((await create(c.id, payload)).statusCode).toBe(403);
    }
    guard.mockRestore();
  }
  expect(await counts()).toEqual(before);
  await database.pglite.query(
    "UPDATE client_workspace_grants SET access_level='VIEW_ONLY' WHERE client_instance_id=$1 AND workspace_id=$2",
    [demoIdentity.clientInstanceId, demoContext.workspaceId],
  );
  expect((await list(`?taskId=${f.task.id}`)).statusCode).toBe(200);
  expect((await create(c.id, input())).statusCode).toBe(403);
  expect((await send("POST", `/v1/tasks/${f.task.id}/complete`, {})).statusCode).toBe(403);
  expect(await counts()).toEqual(before);
});

it("revalidates after data access and rolls back the task, link and both audits on revocation", async () => {
  const c = await contact();
  const payload = input();
  const before = await counts();
  const resolve = database.resolveRequestIdentityContext.bind(database);
  let calls = 0;
  const revoked = vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
    if (args[3] && ++calls > 3) return null;
    return resolve(...args);
  });
  const rejected = await create(c.id, payload);
  expect(rejected.statusCode, rejected.body).toBe(401);
  revoked.mockRestore();
  expect(await counts()).toEqual(before);
  const success = await create(c.id, payload);
  expect(success.statusCode, success.body).toBe(201);
  const after = await counts();
  calls = 0;
  const rerevoked = vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
    if (args[3] && ++calls > 3) return null;
    return resolve(...args);
  });
  expect((await create(c.id, payload)).statusCode).toBe(401);
  rerevoked.mockRestore();
  calls = 0;
  const readRevoked = vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
    if (args[3] && ++calls > 2) return null;
    return resolve(...args);
  });
  expect((await list(`?musicContactId=${c.id}`)).statusCode).toBe(401);
  readRevoked.mockRestore();
  expect(await counts()).toEqual(after);
});

it("rolls back shared task creation when linking or final policy checks fail", async () => {
  const c = await contact();
  const before = await counts();
  const createTask = database.createTaskInTransaction.bind(database);
  const fault = vi.spyOn(database, "createTaskInTransaction").mockImplementation(async (...args) => {
    await createTask(...args);
    throw new Error("Failure after common task insertion");
  });
  expect((await create(c.id, input())).statusCode).toBe(500);
  fault.mockRestore();
  expect(await counts()).toEqual(before);
  let inserted = false;
  const observe = vi.spyOn(database, "createTaskInTransaction").mockImplementation(async (...args) => {
    const task = await createTask(...args);
    inserted = true;
    return task;
  });
  const original = ToolGateway.prototype.assertAuthorized;
  const revoked = vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(function (
    this: ToolGateway,
    tool,
  ) {
    if (inserted && tool.toolKey === "create_task") throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Revoked");
    return original.call(this, tool);
  });
  expect((await create(c.id, input())).statusCode).toBe(403);
  revoked.mockRestore();
  observe.mockRestore();
  expect(await counts()).toEqual(before);
});

it("paginates deterministically and retains the same task/link/completion through a real database restart", async () => {
  const c = await contact();
  const payload = input();
  const original = musicFollowupResponseSchema.parse((await create(c.id, payload)).json()).data;
  for (let i = 0; i < 25; i++)
    expect((await create(c.id, input({ title: `Autre relance ${i}` }))).statusCode).toBe(201);
  const first = musicFollowupListSchema.parse((await list(`?musicContactId=${c.id}`)).json());
  expect(first.data).toHaveLength(25);
  expect(first.nextOffset).toBe(25);
  const second = musicFollowupListSchema.parse((await list(`?musicContactId=${c.id}&offset=25`)).json());
  expect(second.data).toHaveLength(1);
  expect(second.nextOffset).toBeNull();
  expect(second.data[0]?.id).toBe(original.id);
  expect(new Set([...first.data, ...second.data].map((f) => f.id)).size).toBe(26);
  expect((await list(`?musicContactId=${c.id}&offset=20000`)).json()).toEqual({ data: [], nextOffset: null });
  expect((await send("POST", `/v1/tasks/${original.task.id}/complete`, {})).statusCode).toBe(200);
  const saved = (await list(`?taskId=${original.task.id}`)).json();
  const before = await counts();
  await app.close();
  database = await DemoDatabase.open({ dataDir: join(directory, "database") });
  const open = vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  app = await createApp({ dataDir: join(directory, "database") });
  open.mockRestore();
  expect((await list(`?taskId=${original.task.id}`)).json()).toEqual(saved);
  const tasks = (await send("GET", "/v1/tasks")).json().data;
  expect(tasks.find((task: { id: string }) => task.id === original.task.id)).toMatchObject(saved.data[0].task);
  const retry = await create(c.id, payload);
  expect(retry.statusCode, retry.body).toBe(200);
  expect(retry.json()).toEqual({ data: saved.data[0], replayed: true });
  expect(await counts()).toEqual(before);
}, 60000);
