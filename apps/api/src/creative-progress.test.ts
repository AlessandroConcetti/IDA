import { randomUUID } from "node:crypto";
import { creativeDetailResponseSchema, creativeProgressResponseSchema } from "@ida/contracts/creative-engine";
import { ToolGateway, ToolPolicyError } from "@ida/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

const now = () => new Date("2026-09-14T10:00:00Z");
let database: DemoDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
let projectId: string;
let planId: string;
const path = (id = projectId) => `/v1/creative/projects/${id}`;
const send = (payload: unknown, id = projectId) =>
  app.inject({
    method: "POST",
    url: `${path(id)}/progress`,
    payload: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
const fields = (overrides: Record<string, unknown> = {}) => ({
  planId,
  stepIndex: 0,
  completed: true,
  expectedRevision: 0,
  ...overrides,
});
async function createPlan(id = projectId) {
  const response = await app.inject({
    method: "POST",
    url: `${path(id)}/plans`,
    payload: {
      title: "Plan manuel à deux étapes",
      steps: ["Rédiger le besoin", "Relire les critères"],
      acceptanceCriteria: ["Dossier relu par son auteur"],
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.id as string;
}
async function detail() {
  const response = await app.inject({ method: "GET", url: path() });
  expect(response.statusCode).toBe(200);
  return creativeDetailResponseSchema.parse(response.json()).data;
}
async function counts() {
  return (
    await database.pglite.query(`SELECT
      (SELECT count(*) FROM creative_plan_progress) AS progress,
      (SELECT count(*) FROM activity_logs WHERE action='creative.dossier.recorded') AS audit`)
  ).rows;
}
async function unrelated() {
  return (
    await database.pglite.query(`SELECT
      (SELECT json_agg(row_to_json(r)) FROM approvals r) AS approvals,
      (SELECT json_agg(row_to_json(r)) FROM command_runs r) AS commands,
      (SELECT json_agg(row_to_json(r)) FROM memories r) AS memories,
      (SELECT json_agg(row_to_json(r)) FROM scheduled_posts r) AS deliveries,
      (SELECT json_agg(row_to_json(r)) FROM tasks r) AS tasks`)
  ).rows;
}

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://", now });
  vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  app = await createApp({ dataDir: "memory://", now });
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await database.pglite.query("UPDATE identity_sessions SET status='ACTIVE', revoked_at=NULL WHERE id=$1", [
    demoIdentity.sessionId,
  ]);
  await database.pglite.query(
    "UPDATE client_workspace_grants SET access_level='TRUSTED' WHERE client_instance_id=$1 AND workspace_id=$2",
    [demoIdentity.clientInstanceId, demoContext.workspaceId],
  );
  const task = await database.createTask(demoContext.workspaceId, demoContext.userId, {
    title: `Fabrique · Suivi manuel ${randomUUID()}`,
  });
  projectId = task.id;
  planId = await createPlan();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

describe("Creative Engine — progression déclarative, jamais une exécution", () => {
  it("persiste les déclarations, journalise sans note et ne termine ni tâche ni approbation", async () => {
    const before = await unrelated();
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Réseau interdit dans cet essai"));
    const gateway = vi.spyOn(ToolGateway.prototype, "assertAuthorized");
    const first = await send(fields({ note: "  Observation privée du rédacteur  " }));
    expect(first.statusCode).toBe(201);
    expect(creativeProgressResponseSchema.parse(first.json()).data).toMatchObject({
      projectId,
      planId,
      stepIndex: 0,
      completed: true,
      note: "Observation privée du rédacteur",
      revision: 1,
    });
    expect((await send(fields({ stepIndex: 1, expectedRevision: 1 }))).statusCode).toBe(201);
    const stored = await detail();
    expect(stored.progress.map((event) => event.revision)).toEqual([1, 2]);
    expect(stored.progress[1]?.note).toBeNull();
    expect(stored.project.status).toBe("TODO");
    expect(stored.reviews).toEqual([]);
    expect(await unrelated()).toEqual(before);
    expect(network).not.toHaveBeenCalled();
    expect(gateway).toHaveBeenCalledWith({
      toolKey: "write_creative_dossier",
      moduleKey: "TASKS",
      permission: "WRITE",
    });
    const audit = await database.pglite.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM activity_logs WHERE entity_id=$1 AND action='creative.dossier.recorded' AND payload->>'kind'='progress'",
      [projectId],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]?.payload).toMatchObject({ kind: "progress", toolKey: "write_creative_dossier", planId });
    expect(audit.rows.every((row) => !Object.hasOwn(row.payload, "note"))).toBe(true);
    expect(JSON.stringify(audit.rows)).not.toContain("Observation privée");
  });

  it("déduplique une déclaration identique envoyée simultanément", async () => {
    const responses = await Promise.all([send(fields()), send(fields())]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0]?.json().data).toEqual(responses[1]?.json().data);
    expect((await detail()).progress).toHaveLength(1);
    const audit = await database.pglite.query(
      "SELECT id FROM activity_logs WHERE entity_id=$1 AND payload->>'kind'='progress'",
      [projectId],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("arbitre deux modifications concurrentes avec une révision globale au plan", async () => {
    const responses = await Promise.all([send(fields()), send(fields({ stepIndex: 1 }))]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const stored = await detail();
    expect(stored.progress).toHaveLength(1);
    const nextIndex = stored.progress[0]?.stepIndex === 0 ? 1 : 0;
    expect((await send(fields({ stepIndex: nextIndex, expectedRevision: 1 }))).statusCode).toBe(201);
    expect((await detail()).progress.map((event) => event.revision)).toEqual([1, 2]);
  });

  it("conserve le même reçu d'un ancien retry après réouverture d'une étape", async () => {
    const original = await send(fields({ note: "Fait manuellement" }));
    expect(original.statusCode).toBe(201);
    expect((await send(fields({ completed: false, expectedRevision: 1, note: "À reprendre" }))).statusCode).toBe(201);
    const before = await counts();
    const retry = await send(fields({ note: " Fait manuellement " }));
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual(original.json().data);
    expect(await counts()).toEqual(before);
    const reopened = await detail();
    expect(reopened.progress.map((event) => [event.revision, event.completed])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(reopened.progress[1]?.note).toBe("À reprendre");
  });

  it("refuse une version future ou un ancien contenu différent sans écraser l'historique", async () => {
    expect((await send(fields())).statusCode).toBe(201);
    const before = await counts();
    for (const payload of [
      fields({ expectedRevision: 3 }),
      fields({ expectedRevision: 0, completed: false }),
      fields({ expectedRevision: 0, note: "Autre déclaration" }),
    ])
      expect((await send(payload)).statusCode).toBe(409);
    expect(await counts()).toEqual(before);
    expect((await detail()).progress).toHaveLength(1);
  });

  it("isole dossiers, workspaces et plans, y compris les identifiants valides d'autres ressources", async () => {
    const other = await database.createTask(demoContext.workspaceId, demoContext.userId, {
      title: "Fabrique · Autre dossier de suivi",
    });
    const otherPlan = await createPlan(other.id);
    await database.pglite.query("UPDATE tasks SET title='Fabrique · Étranger' WHERE id='task_other_workspace'");
    const foreignPlan = `cr_${randomUUID().replaceAll("-", "")}`;
    await database.pglite.query(
      `INSERT INTO creative_dossier_records(id,workspace_id,project_id,actor_user_id,kind,payload,content_hash)
      SELECT $1,'wsp_other','task_other_workspace','usr_other','plans',payload,content_hash
      FROM creative_dossier_records WHERE id=$2`,
      [foreignPlan, planId],
    );
    const before = await counts();
    for (const id of ["task_other_workspace", "task_caption_review", "task_absent"])
      expect((await send(fields(), id)).statusCode).toBe(404);
    for (const invalidPlan of [otherPlan, foreignPlan, "cr_absent"])
      expect((await send(fields({ planId: invalidPlan }))).statusCode).toBe(404);
    expect((await send(fields(), other.id)).statusCode).toBe(404);
    expect(await counts()).toEqual(before);
    expect((await detail()).progress).toEqual([]);
  });

  it("refuse les indices hors plan, champs d'identité et données hors contrat", async () => {
    const before = await counts();
    for (const payload of [
      fields({ stepIndex: 2 }),
      fields({ stepIndex: -1 }),
      fields({ stepIndex: 12 }),
      fields({ stepIndex: 0.5 }),
      fields({ expectedRevision: -1 }),
      fields({ expectedRevision: 501 }),
      fields({ expectedRevision: 0.5 }),
      fields({ completed: "true" }),
      fields({ note: " " }),
      fields({ note: "x".repeat(301) }),
      fields({ workspaceId: "wsp_other" }),
      fields({ actorUserId: "usr_other" }),
      fields({ execute: true }),
      fields({ approved: true }),
    ])
      expect((await send(payload)).statusCode).toBe(400);
    expect((await send(fields({ note: "x".repeat(5000) }))).statusCode).toBe(413);
    expect(await counts()).toEqual(before);
  });

  it("autorise une lecture VIEW_ONLY mais refuse la nouvelle déclaration et le retry", async () => {
    expect((await send(fields())).statusCode).toBe(201);
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level='VIEW_ONLY' WHERE client_instance_id=$1 AND workspace_id=$2",
      [demoIdentity.clientInstanceId, demoContext.workspaceId],
    );
    const before = await counts();
    expect((await detail()).progress).toHaveLength(1);
    expect((await send(fields())).statusCode).toBe(403);
    expect((await send(fields({ expectedRevision: 1, completed: false }))).statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });

  it("ne contourne pas le refus du Tool Gateway", async () => {
    const before = await counts();
    vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(() => {
      throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Refus synthétique de cet essai");
    });
    expect((await send(fields())).statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });

  it("refuse lecture et retry après révocation de session", async () => {
    expect((await send(fields())).statusCode).toBe(201);
    await database.pglite.query(
      "UPDATE identity_sessions SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP WHERE id=$1",
      [demoIdentity.sessionId],
    );
    const before = await counts();
    expect((await app.inject({ method: "GET", url: path() })).statusCode).toBe(401);
    expect((await send(fields())).statusCode).toBe(401);
    expect(await counts()).toEqual(before);
  });

  it("annule l'événement et son audit si la revalidation finale échoue", async () => {
    const original = database.resolveRequestIdentityContext.bind(database);
    let transactionChecks = 0;
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      if (args[3] && ++transactionChecks >= 2) return null;
      return original(...args);
    });
    const before = await counts();
    expect((await send(fields())).statusCode).toBe(401);
    expect(transactionChecks).toBeGreaterThanOrEqual(2);
    expect(await counts()).toEqual(before);
  });

  it("borne séparément les 500 événements et les 200 documents sans tronquer ni empêcher un retry", async () => {
    await database.pglite.query(
      `INSERT INTO creative_dossier_records(id,workspace_id,project_id,actor_user_id,kind,payload,content_hash)
      SELECT 'cr_' || md5($1 || n::text),$2,$1,$3,'notes',jsonb_build_object('content','Note ' || n),lpad(n::text,64,'0')
      FROM generate_series(1,199) n`,
      [projectId, demoContext.workspaceId, demoContext.userId],
    );
    await database.pglite.query(
      `INSERT INTO creative_plan_progress(id,workspace_id,project_id,plan_id,actor_user_id,step_index,completed,note,revision,content_hash)
      SELECT 'cp_' || md5($1 || n::text),$2,$1,$3,$4,0,n%2=1,NULL,n,lpad(n::text,64,'0')
      FROM generate_series(1,499) n`,
      [projectId, demoContext.workspaceId, planId, demoContext.userId],
    );
    const last = fields({ expectedRevision: 499, completed: false });
    expect((await send(last)).statusCode).toBe(201);
    const before = await counts();
    expect((await send(fields({ expectedRevision: 500 }))).statusCode).toBe(409);
    expect((await send(last)).statusCode).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: `${path()}/notes`, payload: { content: "Document supplémentaire" } }))
        .statusCode,
    ).toBe(409);
    expect(await counts()).toEqual(before);
    const stored = await detail();
    expect(stored.progress).toHaveLength(500);
    expect(stored.plans).toHaveLength(1);
    expect(stored.notes).toHaveLength(199);
    expect(stored.progress.at(-1)?.revision).toBe(500);
  });
});
