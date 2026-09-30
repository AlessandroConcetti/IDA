import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceMailDraftResponseSchema } from "@ida/contracts";
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
  purpose: "PRIVATE_EVENT",
  recipientEmail: null,
  subject: "Présentation synthétique",
  body: "Texte privé de recette, jamais envoyé.",
  ...extra,
});
async function contact(extra: Record<string, unknown> = {}) {
  const result = await send("POST", "/v1/music/contacts", {
    idempotencyKey: randomUUID(),
    artistProjectId: "prj_demo_aless",
    organisation: `Recette ${randomUUID()}`,
    kind: "PRIVATE_VENUE",
    sourceUrl: "https://music.example.com/contact",
    ...extra,
  });
  expect(result.statusCode, result.body).toBe(201);
  return result.json().data;
}
const create = (id: string, payload: unknown) => send("POST", `/v1/music/contacts/${id}/mail-drafts`, payload);
const read = (id: string) => send("GET", `/v1/workspace/mail-drafts/${id}`);
const patch = (id: string, payload: unknown) => send("PATCH", `/v1/workspace/mail-drafts/${id}`, payload);
const list = (q = "") => send("GET", `/v1/workspace/mail-drafts${q}`);
const auditCount = async () =>
  (
    await database.pglite.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM activity_logs WHERE action LIKE 'workspace.mail_draft.%'",
    )
  ).rows[0]?.count;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ida-mail-drafts-"));
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

it("persists one shared draft, replays once, and never sends, fetches or advances CRM", async () => {
  const c = await contact();
  const payload = input();
  const count = await auditCount();
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
  const response = await create(c.id, payload);
  expect(response.statusCode, response.body).toBe(201);
  const draft = workspaceMailDraftResponseSchema.parse(response.json()).data;
  expect(draft).toMatchObject({
    musicContactId: c.id,
    artistProjectId: c.artistProjectId,
    recipientEmail: null,
    trackId: null,
    status: "DRAFT",
    revision: 0,
  });
  expect((await read(draft.id)).json().data).toEqual(draft);
  expect((await list(`?musicContactId=${c.id}`)).json().data).toEqual([draft]);
  expect((await create(c.id, payload)).json()).toMatchObject({ data: { id: draft.id }, replayed: true });
  expect((await create(c.id, { ...payload, body: "Different" })).statusCode).toBe(409);
  expect(await auditCount()).toBe((count ?? 0) + 1);
  expect((await send("GET", `/v1/music/contacts/${c.id}`)).json().data.stage).toBe("DISCOVERED");
  const audit = await database.pglite.query("SELECT payload FROM activity_logs WHERE entity_id=$1", [draft.id]);
  expect(JSON.stringify(audit.rows)).not.toContain(payload.body);
  expect(JSON.stringify(audit.rows)).not.toContain(payload.subject);
  expect(network).not.toHaveBeenCalled();
});

it("requires valid scoped inputs, rejects transport effects, headers and oversized text", async () => {
  const c = await contact();
  const base = input();
  for (const payload of [
    { ...base, status: "SENT" },
    { ...base, workspaceId: "wsp_other" },
    { ...base, send: true },
    { ...base, subject: "Hello\r\nBcc: other@example.com" },
    { ...base, recipientEmail: "bad" },
    { ...base, body: " " },
    { ...base, body: "a".repeat(12001) },
    { ...base, listeningUrl: "https://127.0.0.1/listen" },
    { ...base, body: "x\u0000y" },
    { ...base, expectedContactRevision: -1 },
  ]) {
    expect((await create(c.id, payload)).statusCode).toBe(400);
  }
  expect((await send("POST", `/v1/music/contacts/${c.id}/mail-drafts?send=true`, base)).statusCode).toBe(400);
  expect((await create(c.id, { ...base, body: "a".repeat(128 * 1024) })).statusCode).toBe(413);
  expect((await list("?workspaceId=wsp_other")).statusCode).toBe(400);
  expect((await list("?offset=20001")).statusCode).toBe(400);
});

it("round-trips 12000 multibyte characters through draft creation and editing", async () => {
  const c = await contact();
  const body = "漢".repeat(12000);
  const result = await create(c.id, input({ body }));
  expect(result.statusCode, result.body).toBe(201);
  const draft = workspaceMailDraftResponseSchema.parse(result.json()).data;
  expect(draft.body).toBe(body);
  const stored = await read(draft.id);
  expect(stored.statusCode, stored.body).toBe(200);
  expect(workspaceMailDraftResponseSchema.parse(stored.json()).data.body).toBe(body);

  const revisedBody = "字".repeat(12000);
  const edited = await patch(draft.id, { expectedRevision: draft.revision, body: revisedBody });
  expect(edited.statusCode, edited.body).toBe(200);
  expect(workspaceMailDraftResponseSchema.parse(edited.json()).data).toMatchObject({
    body: revisedBody,
    revision: 1,
  });
  const reread = await read(draft.id);
  expect(reread.statusCode, reread.body).toBe(200);
  expect(workspaceMailDraftResponseSchema.parse(reread.json()).data.body).toBe(revisedBody);
});

it("retains a source track title containing a line break in the shared draft", async () => {
  const c = await contact();
  const title = "Titre\navec retour";
  const createdTrack = await send("POST", "/v1/tracks", {
    artistProjectId: c.artistProjectId,
    title,
    artistCredit: "Artiste de recette",
    status: "DEMO",
  });
  expect(createdTrack.statusCode, createdTrack.body).toBe(201);
  const track = createdTrack.json().data;
  expect(track.title).toBe(title);
  const source = await send("GET", `/v1/tracks/${track.id}`);
  expect(source.statusCode, source.body).toBe(200);
  expect(source.json().data.title).toBe(title);

  const result = await create(c.id, input({ purpose: "LABEL_DEMO", trackId: track.id }));
  expect(result.statusCode, result.body).toBe(201);
  const draft = workspaceMailDraftResponseSchema.parse(result.json()).data;
  expect(draft).toMatchObject({ trackId: track.id, trackTitle: title });
  const stored = await read(draft.id);
  expect(stored.statusCode, stored.body).toBe(200);
  expect(workspaceMailDraftResponseSchema.parse(stored.json()).data.trackTitle).toBe(title);
  const page = await list(`?musicContactId=${c.id}`);
  expect(page.statusCode, page.body).toBe(200);
  expect(page.json().data).toEqual([draft]);
});

it("links only a track in the contact project and checks stale contact revision", async () => {
  const c = await contact();
  const tracks = (await send("GET", "/v1/tracks")).json().data;
  const track = tracks.find((item: { artistProjectId: string }) => item.artistProjectId === c.artistProjectId);
  expect(track).toBeTruthy();
  const result = await create(
    c.id,
    input({ purpose: "LABEL_DEMO", trackId: track.id, listeningUrl: "https://music.example.com/listen" }),
  );
  expect(result.statusCode, result.body).toBe(201);
  expect(result.json().data.trackTitle).toBe(track.title);
  expect((await create(c.id, input({ trackId: "trk_absent" }))).statusCode).toBe(404);
  await database.pglite.query(
    "INSERT INTO artist_projects(id,workspace_id,name,status) VALUES('prj_mail_second',$1,'Second projet de recette','ACTIVE')",
    [demoContext.workspaceId],
  );
  const secondContact = await contact({ artistProjectId: "prj_mail_second" });
  expect((await create(secondContact.id, input({ trackId: track.id }))).statusCode).toBe(404);
  expect(
    (await send("PATCH", `/v1/music/contacts/${c.id}`, { expectedRevision: 0, city: "Marseille" })).statusCode,
  ).toBe(200);
  expect((await create(c.id, input())).statusCode).toBe(409);
  expect((await create(c.id, input({ expectedContactRevision: 1 }))).statusCode).toBe(201);
});

it("edits the same record from both views, detects conflicts and permits exact retry/archive/restore", async () => {
  const c = await contact({ email: "contact@example.com" });
  const d = (await create(c.id, input({ recipientEmail: c.email }))).json().data;
  const results = await Promise.all([
    patch(d.id, { expectedRevision: 0, body: "Version A" }),
    patch(d.id, { expectedRevision: 0, body: "Version B" }),
  ]);
  expect(results.map((value) => value.statusCode).sort()).toEqual([200, 409]);
  const current = (await read(d.id)).json().data;
  const count = await auditCount();
  expect((await patch(d.id, { expectedRevision: 0, body: current.body })).statusCode).toBe(200);
  expect(await auditCount()).toBe(count);
  expect((await patch(d.id, { expectedRevision: 1, status: "ARCHIVED", recipientEmail: null })).statusCode).toBe(200);
  expect((await list(`?musicContactId=${c.id}&status=DRAFT`)).json().data).toEqual([]);
  expect((await list(`?musicContactId=${c.id}&status=ARCHIVED`)).json().data).toHaveLength(1);
  expect((await patch(d.id, { expectedRevision: 2, status: "DRAFT" })).statusCode).toBe(200);
  expect((await patch(d.id, { expectedRevision: 3, status: "SENT" })).statusCode).toBe(400);
  expect((await patch(d.id, { expectedRevision: 3, body: "" })).statusCode).toBe(400);
  expect((await patch(d.id, { expectedRevision: 3 })).statusCode).toBe(400);
});

it("shows current source identity without silently rewriting the recipient or body", async () => {
  const c = await contact({ email: "old@example.com" });
  const payload = input({ recipientEmail: c.email });
  const d = (await create(c.id, payload)).json().data;
  expect(
    (
      await send("PATCH", `/v1/music/contacts/${c.id}`, {
        expectedRevision: 0,
        email: "new@example.com",
        organisation: "Organisation révisée",
      })
    ).statusCode,
  ).toBe(200);
  expect((await read(d.id)).json().data).toMatchObject({
    organisation: "Organisation révisée",
    currentContactEmail: "new@example.com",
    recipientEmail: "old@example.com",
    body: payload.body,
    revision: 0,
  });
  // The lost-response retry still returns the existing record even if its source changed meanwhile.
  expect((await create(c.id, payload)).json()).toMatchObject({ replayed: true, data: { id: d.id } });
});

it("protects foreign workspace IDs, records and source contacts", async () => {
  const foreignContact = `mct_${randomUUID().replaceAll("-", "")}`;
  const shared = `wct_${randomUUID().replaceAll("-", "")}`;
  const foreignDraft = `wmd_${randomUUID().replaceAll("-", "")}`;
  await database.pglite.query(
    "INSERT INTO workspace_contacts(id,workspace_id,organisation,identity_key,source_url,creator_user_id) VALUES($1,'wsp_other','Foreign',$2,'https://music.example.com/','usr_other')",
    [shared, "d".repeat(64)],
  );
  await database.pglite.query(
    "INSERT INTO music_contact_links(id,workspace_id,contact_id,artist_project_id,kind,creator_user_id,idempotency_key,content_hash) VALUES($1,'wsp_other',$2,'prj_other_workspace','LABEL','usr_other',$3,$4)",
    [foreignContact, shared, randomUUID(), "e".repeat(64)],
  );
  await database.pglite.query(
    "INSERT INTO workspace_mail_drafts(id,workspace_id,music_contact_id,purpose,subject,body,creator_user_id,idempotency_key,content_hash) VALUES($1,'wsp_other',$2,'GIG','Private','Private','usr_other',$3,$4)",
    [foreignDraft, foreignContact, randomUUID(), "f".repeat(64)],
  );
  expect((await create(foreignContact, input())).statusCode).toBe(404);
  expect((await read(foreignDraft)).json()).toEqual((await read(`wmd_${"0".repeat(32)}`)).json());
  expect((await patch(foreignDraft, { expectedRevision: 0, body: "No" })).statusCode).toBe(404);
  expect((await list(`?musicContactId=${foreignContact}`)).json().data).toEqual([]);
});

it("requires both shared-draft and Music grants, rolls back on revocation, honors VIEW_ONLY", async () => {
  const c = await contact();
  const d = (await create(c.id, input())).json().data;
  const original = ToolGateway.prototype.assertAuthorized;
  for (const key of ["read_music_contacts", "read_workspace_mail_drafts", "write_workspace_mail_drafts"]) {
    const guard = vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(function (
      this: ToolGateway,
      tool,
    ) {
      if (tool.toolKey === key) throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Denied");
      return original.call(this, tool);
    });
    if (key !== "write_workspace_mail_drafts") expect((await read(d.id)).statusCode).toBe(403);
    if (key !== "read_workspace_mail_drafts") {
      expect((await create(c.id, input())).statusCode).toBe(403);
      expect((await patch(d.id, { expectedRevision: 0, subject: "No" })).statusCode).toBe(403);
    }
    guard.mockRestore();
  }
  const resolve = database.resolveRequestIdentityContext.bind(database);
  for (const operation of [() => create(c.id, input()), () => patch(d.id, { expectedRevision: 0, body: "Rollback" })]) {
    let calls = 0;
    const before = await auditCount();
    const revoke = vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      if (args[3] && ++calls > 2) return null;
      return resolve(...args);
    });
    expect((await operation()).statusCode).toBe(401);
    revoke.mockRestore();
    expect(await auditCount()).toBe(before);
  }
  expect((await read(d.id)).json().data.revision).toBe(0);
  await database.pglite.query(
    "UPDATE client_workspace_grants SET access_level='VIEW_ONLY' WHERE client_instance_id=$1 AND workspace_id=$2",
    [demoIdentity.clientInstanceId, demoContext.workspaceId],
  );
  expect((await read(d.id)).statusCode).toBe(200);
  expect((await create(c.id, input())).statusCode).toBe(403);
  expect((await patch(d.id, { expectedRevision: 0, body: "No" })).statusCode).toBe(403);
});

it("paginates a contact's drafts and retains the shared record across real runtime/database restart", async () => {
  const c = await contact();
  const payload = input();
  const d = (await create(c.id, payload)).json().data;
  for (let i = 0; i < 25; i++) expect((await create(c.id, input({ subject: `Autre ${i}` }))).statusCode).toBe(201);
  const first = (await list(`?musicContactId=${c.id}`)).json();
  expect(first.data).toHaveLength(25);
  expect(first.nextOffset).toBe(25);
  const second = (await list(`?musicContactId=${c.id}&offset=25`)).json();
  expect(second.data).toHaveLength(1);
  expect(second.nextOffset).toBeNull();
  expect((await patch(d.id, { expectedRevision: 0, body: "Texte conservé après redémarrage" })).statusCode).toBe(200);
  const saved = (await read(d.id)).json();
  const count = await auditCount();
  await app.close();
  database = await DemoDatabase.open({ dataDir: join(directory, "database") });
  const open = vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  app = await createApp({ dataDir: join(directory, "database") });
  open.mockRestore();
  expect((await read(d.id)).json()).toEqual(saved);
  expect((await create(c.id, payload)).json()).toMatchObject({ data: saved.data, replayed: true });
  expect(await auditCount()).toBe(count);
}, 60000);
