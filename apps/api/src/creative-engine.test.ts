import { randomUUID } from "node:crypto";
import { creativeDetailResponseSchema } from "@ida/contracts/creative-engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

const now = () => new Date("2026-09-13T10:00:00Z");
let database: DemoDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
let projectId: string;
const path = (id = projectId) => `/v1/creative/projects/${id}`;
const send = (kind: string, payload: unknown, id = projectId) =>
  app.inject({
    method: "POST",
    url: `${path(id)}/${kind}`,
    payload: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
const plan = {
  title: "Plan documentaire",
  steps: ["Décrire le besoin"],
  acceptanceCriteria: ["Revue humaine du dossier"],
};

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
    title: `Fabrique · Essai ${randomUUID()}`,
  });
  projectId = task.id;
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

async function counts() {
  return (
    await database.pglite.query(`SELECT
    (SELECT count(*) FROM creative_dossier_records) AS records,
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

describe("Creative Engine — dossiers documentaires uniquement", () => {
  it("persiste les quatre familles et une revue sans accorder de permission ni terminer la tâche", async () => {
    const before = await unrelated();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Aucun accès réseau autorisé dans cet essai"));
    expect(
      (
        await send("references", {
          title: "Source saisie",
          notes: "Observation privée",
          url: "https://example.org/reference",
        })
      ).statusCode,
    ).toBe(201);
    const planned = await send("plans", plan);
    expect(planned.statusCode).toBe(201);
    expect((await send("notes", { content: "Note explicite, pas une mémoire personnelle." })).statusCode).toBe(201);
    expect(
      (
        await send("reviews", {
          planId: planned.json().data.id,
          decision: "REVIEWED",
          note: "Document relu, aucune exécution autorisée.",
        })
      ).statusCode,
    ).toBe(201);
    const response = await app.inject({ method: "GET", url: path() });
    expect(response.statusCode).toBe(200);
    const detail = creativeDetailResponseSchema.parse(response.json()).data;
    expect(detail.project.status).toBe("TODO");
    for (const kind of ["references", "plans", "notes", "reviews"] as const) expect(detail[kind]).toHaveLength(1);
    expect(await unrelated()).toEqual(before);
    expect(network).not.toHaveBeenCalled();
    const audit = await database.pglite.query(
      "SELECT payload FROM activity_logs WHERE entity_id=$1 AND action='creative.dossier.recorded'",
      [projectId],
    );
    expect(audit.rows).toHaveLength(4);
    expect(JSON.stringify(audit.rows)).not.toContain("Observation privée");
    expect(JSON.stringify(audit.rows)).not.toContain("example.org");
  });

  it("déduplique les retries concurrents sans dupliquer l'audit ni changer le timestamp", async () => {
    const payload = { content: "Une seule note enregistrée." };
    const responses = await Promise.all([send("notes", payload), send("notes", payload)]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0].json().data).toEqual(responses[1].json().data);
    const retry = await send("notes", payload);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual(responses[0].json().data);
    const audit = await database.pglite.query(
      "SELECT id FROM activity_logs WHERE entity_id=$1 AND action='creative.dossier.recorded'",
      [projectId],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("masque une tâche étrangère ou hors Fabrique et ne crée aucune association", async () => {
    await database.pglite.query("UPDATE tasks SET title='Fabrique · Dossier étranger' WHERE id='task_other_workspace'");
    const before = await counts();
    for (const id of ["task_other_workspace", "task_caption_review", "task_absent"]) {
      expect((await app.inject({ method: "GET", url: path(id) })).statusCode).toBe(404);
      expect((await send("notes", { content: "Ne doit pas être enregistrée." }, id)).statusCode).toBe(404);
    }
    expect(await counts()).toEqual(before);
    const listing = await app.inject({ method: "GET", url: "/v1/creative/projects" });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().data.some((item: { id: string }) => item.id === "task_other_workspace")).toBe(false);
  });

  it("refuse la revue d'un plan d'un autre dossier, même dans le même workspace", async () => {
    const other = await database.createTask(demoContext.workspaceId, demoContext.userId, {
      title: "Fabrique · Autre dossier",
    });
    const planned = await send("plans", plan, other.id);
    expect(planned.statusCode).toBe(201);
    const before = await counts();
    expect(
      (await send("reviews", { planId: planned.json().data.id, decision: "REVIEWED", note: "Mauvaise association" }))
        .statusCode,
    ).toBe(404);
    expect(await counts()).toEqual(before);
  });

  it("refuse les champs d'identité, permissions, URL dangereuses et données hors limites", async () => {
    const before = await counts();
    const cases: [string, unknown][] = [
      ["notes", { content: "x", workspaceId: "wsp_other" }],
      ["notes", { content: "x", actorUserId: "usr_other" }],
      ["notes", { content: "x", execute: true }],
      ["notes", { content: "x".repeat(2001) }],
      ["plans", { ...plan, steps: Array.from({ length: 13 }, () => "Étape") }],
      ["references", { title: "Référence", notes: "Note", url: "javascript:alert(1)" }],
      ["references", { title: "Référence", notes: "Note", url: "https://user:pass@example.org/" }],
      ["reviews", { planId: "cr_absent", decision: "APPROVED", note: "Non" }],
    ];
    for (const [kind, payload] of cases) expect((await send(kind, payload)).statusCode).toBe(400);
    expect((await send("notes", { content: "x".repeat(17_000) })).statusCode).toBe(413);
    expect(await counts()).toEqual(before);
  });

  it("autorise la lecture VIEW_ONLY mais refuse toute famille d'écriture sans effet de bord", async () => {
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level='VIEW_ONLY' WHERE client_instance_id=$1 AND workspace_id=$2",
      [demoIdentity.clientInstanceId, demoContext.workspaceId],
    );
    const before = await counts();
    expect((await app.inject({ method: "GET", url: path() })).statusCode).toBe(200);
    for (const [kind, payload] of [
      ["references", { title: "Source", notes: "Note" }],
      ["plans", plan],
      ["notes", { content: "Note" }],
      ["reviews", { planId: "cr_absent", decision: "REVIEWED", note: "Note" }],
    ] as const)
      expect((await send(kind, payload)).statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });

  it("ferme la lecture et l'écriture après révocation de la session", async () => {
    await database.pglite.query(
      "UPDATE identity_sessions SET status='REVOKED', revoked_at=CURRENT_TIMESTAMP WHERE id=$1",
      [demoIdentity.sessionId],
    );
    const before = await counts();
    expect((await app.inject({ method: "GET", url: path() })).statusCode).toBe(401);
    expect((await send("notes", { content: "Refusée" })).statusCode).toBe(401);
    expect(await counts()).toEqual(before);
  });

  it("annule donnée et audit si la revalidation échoue à la fin de transaction", async () => {
    const original = database.resolveRequestIdentityContext.bind(database);
    let transactionChecks = 0;
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      if (args[3] && ++transactionChecks >= 2) return null;
      return original(...args);
    });
    const before = await counts();
    expect((await send("notes", { content: "Ne doit pas survivre à la révocation" })).statusCode).toBe(401);
    expect(transactionChecks).toBeGreaterThanOrEqual(2);
    expect(await counts()).toEqual(before);
  });

  it("borne le dossier à 200 éléments sans supprimer le contenu existant", async () => {
    await database.pglite.query(
      `INSERT INTO creative_dossier_records (id, workspace_id, project_id, actor_user_id, kind, payload, content_hash)
      SELECT 'cr_' || md5($1 || n::text), $2, $1, $3, 'notes', jsonb_build_object('content', 'Note ' || n), lpad(n::text,64,'0')
      FROM generate_series(1,200) n`,
      [projectId, demoContext.workspaceId, demoContext.userId],
    );
    const before = await counts();
    expect((await send("notes", { content: "Au-delà du plafond" })).statusCode).toBe(409);
    expect(await counts()).toEqual(before);
    const response = await app.inject({ method: "GET", url: path() });
    expect(response.statusCode).toBe(200);
    expect(creativeDetailResponseSchema.parse(response.json()).data.notes).toHaveLength(200);
  });
});
