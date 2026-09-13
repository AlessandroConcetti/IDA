import { createHash, randomUUID } from "node:crypto";
import type { RequestIdentityContext } from "@ida/contracts";
import {
  type CreativeKind,
  type CreativeProjectDetail,
  creativeInputSchemas,
  creativeProjectDetailSchema,
  creativeProjectParamsSchema,
  creativeProjectSchema,
  creativeRecordSchemas,
} from "@ida/contracts/creative-engine";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DemoDatabase } from "./database.js";

export const creativeReadTool = { toolKey: "read_creative_dossier", moduleKey: "TASKS", permission: "READ" } as const;
export const creativeWriteTool = {
  toolKey: "write_creative_dossier",
  moduleKey: "TASKS",
  permission: "WRITE",
} as const;
type Tool = typeof creativeReadTool | typeof creativeWriteTool;
type Reader = Pick<DemoDatabase["pglite"], "query">;
type Options = {
  authorize: (request: FastifyRequest, tool: Tool) => RequestIdentityContext;
  revalidate: (request: FastifyRequest, tool: Tool, reader: Reader) => Promise<void>;
};
function failure(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode, code: "CREATIVE_DOSSIER_ERROR" });
}

/** Données documentaires uniquement : aucun accès fichier, provider, URL ou exécution. */
export async function registerCreativeEngine(app: FastifyInstance, database: DemoDatabase, options: Options) {
  await database.pglite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_creative_workspace_key ON tasks(workspace_id, id);
    CREATE TABLE IF NOT EXISTS creative_dossier_records (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK (kind IN ('references', 'plans', 'notes', 'reviews')),
      payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (workspace_id, project_id, actor_user_id, kind, content_hash),
      FOREIGN KEY (workspace_id, project_id) REFERENCES tasks(workspace_id, id)
    );
    CREATE INDEX IF NOT EXISTS creative_dossier_project ON creative_dossier_records(workspace_id, project_id);
  `);
  async function project(reader: Reader, workspaceId: string, projectId: string, write = false) {
    const result = await reader.query(
      `SELECT id, title, description, status FROM tasks WHERE id = $1 AND workspace_id = $2 AND title LIKE 'Fabrique · %' ${write ? "FOR UPDATE" : "FOR SHARE"}`,
      [projectId, workspaceId],
    );
    if (!result.rows[0]) throw failure(404, "Dossier introuvable dans cet espace.");
    return creativeProjectSchema.parse(result.rows[0]);
  }
  function parseRecord(kind: CreativeKind, row: Record<string, unknown>) {
    const payload = row.payload as Record<string, unknown>;
    return creativeRecordSchemas[kind].parse({
      ...payload,
      ...(kind === "references" ? { url: payload.url ?? null } : {}),
      id: row.id,
      projectId: row.project_id,
      createdAt: new Date(row.created_at as string).toISOString(),
    });
  }
  app.get("/v1/creative/projects", async (request) => {
    const identity = options.authorize(request, creativeReadTool);
    return database.pglite.transaction(async (tx) => {
      await options.revalidate(request, creativeReadTool, tx);
      const rows = await tx.query(
        "SELECT id, title, description, status FROM tasks WHERE workspace_id = $1 AND title LIKE 'Fabrique · %' ORDER BY created_at DESC, id LIMIT 201",
        [identity.workspaceId],
      );
      if (rows.rows.length > 200)
        throw failure(409, "Plus de 200 dossiers : utilisez les tâches IDA pour accéder à la collection complète.");
      await options.revalidate(request, creativeReadTool, tx);
      return { data: rows.rows.map((row) => creativeProjectSchema.parse(row)) };
    });
  });
  app.get("/v1/creative/projects/:projectId", async (request) => {
    const identity = options.authorize(request, creativeReadTool);
    const params = creativeProjectParamsSchema.safeParse(request.params);
    if (!params.success) throw failure(400, "Identifiant de dossier invalide.");
    return database.pglite.transaction(async (tx) => {
      await options.revalidate(request, creativeReadTool, tx);
      const selected = await project(tx, identity.workspaceId, params.data.projectId);
      const rows = await tx.query<Record<string, unknown>>(
        "SELECT * FROM creative_dossier_records WHERE workspace_id = $1 AND project_id = $2 ORDER BY created_at, id LIMIT 201",
        [identity.workspaceId, selected.id],
      );
      if (rows.rows.length > 200) throw failure(409, "Ce dossier dépasse la limite de lecture.");
      const detail: CreativeProjectDetail = { project: selected, references: [], plans: [], notes: [], reviews: [] };
      for (const row of rows.rows) {
        const kind = row.kind as CreativeKind;
        // La validation globale vérifie chaque collection et la forme de ses entrées.
        (detail[kind] as unknown[]).push(parseRecord(kind, row));
      }
      await options.revalidate(request, creativeReadTool, tx);
      return { data: creativeProjectDetailSchema.parse(detail) };
    });
  });
  for (const kind of ["references", "plans", "notes", "reviews"] as const) {
    app.post(`/v1/creative/projects/:projectId/${kind}`, { bodyLimit: 16_384 }, async (request, reply) => {
      const identity = options.authorize(request, creativeWriteTool);
      const params = creativeProjectParamsSchema.safeParse(request.params);
      const parsed = creativeInputSchemas[kind].safeParse(request.body);
      if (!params.success || !parsed.success)
        throw failure(
          400,
          "Vérifiez les champs et leurs limites. Les données d’identité ou d’exécution ne sont pas acceptées.",
        );
      const projectId = params.data.projectId;
      const payload = parsed.data;
      const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      const result = await database.pglite.transaction(async (tx) => {
        await options.revalidate(request, creativeWriteTool, tx);
        await project(tx, identity.workspaceId, projectId, true);
        const existing = await tx.query<Record<string, unknown>>(
          "SELECT * FROM creative_dossier_records WHERE workspace_id=$1 AND project_id=$2 AND actor_user_id=$3 AND kind=$4 AND content_hash=$5",
          [identity.workspaceId, projectId, identity.userId, kind, hash],
        );
        if (existing.rows[0]) {
          await options.revalidate(request, creativeWriteTool, tx);
          return { created: false, data: parseRecord(kind, existing.rows[0]) };
        }
        if (kind === "reviews" && "planId" in payload) {
          const target = await tx.query(
            "SELECT id FROM creative_dossier_records WHERE id=$1 AND project_id=$2 AND workspace_id=$3 AND kind='plans'",
            [payload.planId, projectId, identity.workspaceId],
          );
          if (!target.rows[0]) throw failure(404, "Plan introuvable dans ce dossier.");
        }
        const count = await tx.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM creative_dossier_records WHERE workspace_id=$1 AND project_id=$2",
          [identity.workspaceId, projectId],
        );
        if ((count.rows[0]?.count ?? 200) >= 200)
          throw failure(409, "Limite de 200 éléments atteinte pour ce dossier. Aucun élément n’a été effacé.");
        const id = `cr_${randomUUID().replaceAll("-", "")}`;
        const inserted = await tx.query(
          "INSERT INTO creative_dossier_records(id,workspace_id,project_id,actor_user_id,kind,payload,content_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *",
          [id, identity.workspaceId, projectId, identity.userId, kind, JSON.stringify(payload), hash],
        );
        await tx.query(
          "INSERT INTO activity_logs(id,workspace_id,actor_user_id,action,entity_type,entity_id,payload) VALUES($1,$2,$3,'creative.dossier.recorded','TASK',$4,$5::json)",
          [
            `act_${randomUUID().replaceAll("-", "")}`,
            identity.workspaceId,
            identity.userId,
            projectId,
            JSON.stringify({
              recordId: id,
              kind,
              toolKey: creativeWriteTool.toolKey,
              sessionId: identity.session.id,
              clientInstanceId: identity.clientInstance.id,
            }),
          ],
        );
        await options.revalidate(request, creativeWriteTool, tx);
        return { created: true, data: parseRecord(kind, inserted.rows[0] as Record<string, unknown>) };
      });
      return reply.code(result.created ? 201 : 200).send({ data: result.data });
    });
  }
}
