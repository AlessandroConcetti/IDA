import { createHash, randomUUID } from "node:crypto";
import {
  type MusicFollowup,
  musicContactParamsSchema,
  musicFollowupCreateSchema,
  musicFollowupListSchema,
  musicFollowupQuerySchema,
  musicFollowupResponseSchema,
  musicFollowupSchema,
  type RequestIdentityContext,
} from "@ida/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DemoDatabase } from "./database.js";
import { musicContactReadTool } from "./music-contacts.js";

export const musicFollowupReadTool = {
  toolKey: "read_music_followups",
  moduleKey: "TASKS",
  permission: "READ",
} as const;
export const musicFollowupWriteTool = {
  toolKey: "create_music_followup",
  moduleKey: "MUSIC",
  permission: "WRITE",
} as const;
const createTaskTool = { toolKey: "create_task", moduleKey: "TASKS", permission: "WRITE" } as const;
type Tool =
  | typeof musicFollowupReadTool
  | typeof musicFollowupWriteTool
  | typeof musicContactReadTool
  | typeof createTaskTool;
type Reader = Pick<DemoDatabase["pglite"], "query">;
type Options = {
  authorize: (request: FastifyRequest, tool: Tool) => RequestIdentityContext;
  revalidate: (request: FastifyRequest, tool: Tool, reader: Reader) => Promise<void>;
};
const fail = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });
const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const select = `SELECT f.id,f.music_contact_id AS "musicContactId",l.artist_project_id AS "artistProjectId",
  p.name AS "projectName",c.organisation,f.time_zone AS "timeZone",f.created_at AS "createdAt",
  t.id AS "taskId",t.title,t.description,t.status,t.due_at AS "dueAt",
  t.created_at AS "taskCreatedAt",t.completed_at AS "completedAt"
  FROM music_contact_followups f
  JOIN music_contact_links l ON l.workspace_id=f.workspace_id AND l.id=f.music_contact_id
  JOIN workspace_contacts c ON c.workspace_id=l.workspace_id AND c.id=l.contact_id
  JOIN artist_projects p ON p.workspace_id=l.workspace_id AND p.id=l.artist_project_id
  JOIN tasks t ON t.workspace_id=f.workspace_id AND t.id=f.task_id`;
type Row = Omit<MusicFollowup, "task" | "createdAt"> & {
  createdAt: Date | string;
  taskId: string;
  title: string;
  description: string | null;
  status: MusicFollowup["task"]["status"];
  dueAt: Date | string | null;
  taskCreatedAt: Date | string;
  completedAt: Date | string | null;
};
function present(row: Row): MusicFollowup {
  return musicFollowupSchema.parse({
    id: row.id,
    musicContactId: row.musicContactId,
    artistProjectId: row.artistProjectId,
    projectName: row.projectName,
    organisation: row.organisation,
    timeZone: row.timeZone,
    createdAt: new Date(row.createdAt).toISOString(),
    task: {
      id: row.taskId,
      title: row.title,
      description: row.description,
      status: row.status,
      dueAt: row.dueAt === null ? null : new Date(row.dueAt).toISOString(),
      createdAt: new Date(row.taskCreatedAt).toISOString(),
      completedAt: row.completedAt === null ? null : new Date(row.completedAt).toISOString(),
    },
  });
}

/** Music owns only this reference. The shared TASKS engine owns task content and completion. */
export async function registerMusicFollowups(app: FastifyInstance, database: DemoDatabase, options: Options) {
  await database.pglite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS music_contact_links_followup_scope ON music_contact_links(workspace_id,id);
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_followup_scope ON tasks(workspace_id,id);
    CREATE TABLE IF NOT EXISTS music_contact_followups (
      id TEXT PRIMARY KEY CHECK(id ~ '^mfu_[a-f0-9]{32}$'),workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      music_contact_id TEXT NOT NULL,task_id TEXT NOT NULL,time_zone TEXT NOT NULL,
      creator_user_id TEXT NOT NULL REFERENCES users(id),idempotency_key UUID NOT NULL,content_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY(workspace_id,music_contact_id) REFERENCES music_contact_links(workspace_id,id),
      FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id),
      UNIQUE(workspace_id,creator_user_id,idempotency_key),UNIQUE(workspace_id,task_id)
    );
    CREATE INDEX IF NOT EXISTS music_contact_followups_page ON music_contact_followups(workspace_id,created_at,id);
    CREATE INDEX IF NOT EXISTS music_contact_followups_contact_page ON music_contact_followups(workspace_id,music_contact_id,created_at,id);
  `);
  function toolsFor(tool: typeof musicFollowupReadTool | typeof musicFollowupWriteTool): Tool[] {
    return tool === musicFollowupWriteTool
      ? [tool, createTaskTool, musicContactReadTool]
      : [tool, musicContactReadTool];
  }
  function identity(request: FastifyRequest, tool: typeof musicFollowupReadTool | typeof musicFollowupWriteTool) {
    const who = options.authorize(request, tool);
    for (const required of toolsFor(tool).slice(1)) options.authorize(request, required);
    return who;
  }
  async function check(
    request: FastifyRequest,
    tool: typeof musicFollowupReadTool | typeof musicFollowupWriteTool,
    reader: Reader,
  ) {
    for (const required of toolsFor(tool)) await options.revalidate(request, required, reader);
    if (request.raw.aborted)
      throw fail(408, "MUSIC_FOLLOWUP_CANCELLED", "Demande interrompue. Actualise les relances avant de réessayer.");
  }
  async function read(reader: Reader, workspaceId: string, followupId: string) {
    const row = (await reader.query<Row>(`${select} WHERE f.workspace_id=$1 AND f.id=$2`, [workspaceId, followupId]))
      .rows[0];
    if (!row) throw fail(404, "MUSIC_FOLLOWUP_NOT_FOUND", "Relance introuvable dans cet espace.");
    return present(row);
  }
  app.get("/v1/music/followups", async (request) => {
    const who = identity(request, musicFollowupReadTool);
    const parsed = musicFollowupQuerySchema.safeParse(request.query);
    if (!parsed.success) throw fail(400, "MUSIC_FOLLOWUP_INPUT", "Vérifie les filtres et la page de relances.");
    const input = parsed.data;
    return database.pglite.transaction(async (tx) => {
      await check(request, musicFollowupReadTool, tx);
      const rows = (
        await tx.query<Row>(
          `${select} WHERE f.workspace_id=$1
        AND ($2::text IS NULL OR f.music_contact_id=$2) AND ($3::text IS NULL OR f.task_id=$3)
        AND ($4::text='ALL' OR ($4='OPEN' AND t.status IN ('TODO','IN_PROGRESS'))
          OR ($4='CLOSED' AND t.status IN ('DONE','CANCELLED')))
        ORDER BY f.created_at DESC,f.id LIMIT 26 OFFSET $5`,
          [who.workspaceId, input.musicContactId ?? null, input.taskId ?? null, input.state, input.offset],
        )
      ).rows;
      const result = musicFollowupListSchema.parse({
        data: rows.slice(0, 25).map(present),
        nextOffset: rows.length > 25 ? input.offset + 25 : null,
      });
      await check(request, musicFollowupReadTool, tx);
      return result;
    });
  });
  app.post("/v1/music/contacts/:contactId/followups", { bodyLimit: 65536 }, async (request, reply) => {
    const who = identity(request, musicFollowupWriteTool);
    const parsed = musicFollowupCreateSchema.safeParse(request.body);
    const params = musicContactParamsSchema.safeParse(request.params);
    if (!parsed.success || !params.success || Object.keys(request.query as object).length)
      throw fail(400, "MUSIC_FOLLOWUP_INPUT", "Vérifie le contact, le titre, l’échéance et le fuseau de la relance.");
    const input = parsed.data;
    const values = {
      contactId: params.data.contactId,
      title: input.title,
      description: input.description ?? null,
      dueAt: new Date(input.dueAt).toISOString(),
      timeZone: input.timeZone,
    };
    const hash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
    const result = await database.pglite.transaction(async (tx) => {
      await check(request, musicFollowupWriteTool, tx);
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [who.workspaceId]);
      const previous = (
        await tx.query<{ id: string; content_hash: string }>(
          "SELECT id,content_hash FROM music_contact_followups WHERE workspace_id=$1 AND creator_user_id=$2 AND idempotency_key=$3",
          [who.workspaceId, who.userId, input.idempotencyKey],
        )
      ).rows[0];
      if (previous) {
        if (previous.content_hash !== hash)
          throw fail(
            409,
            "MUSIC_FOLLOWUP_IDEMPOTENCY_CONFLICT",
            "Cette demande existe avec un autre contenu. Ouvre la relance enregistrée avant de recommencer.",
          );
        const data = await read(tx, who.workspaceId, previous.id);
        await check(request, musicFollowupWriteTool, tx);
        return { data, replayed: true };
      }
      const contact = (
        await tx.query<{ artist_project_id: string; revision: number }>(
          "SELECT artist_project_id,revision FROM music_contact_links WHERE workspace_id=$1 AND id=$2",
          [who.workspaceId, values.contactId],
        )
      ).rows[0];
      if (!contact) throw fail(404, "MUSIC_FOLLOWUP_CONTACT_NOT_FOUND", "Contact musical introuvable dans cet espace.");
      if (contact.revision !== input.expectedContactRevision)
        throw fail(
          409,
          "MUSIC_FOLLOWUP_CONTACT_CHANGED",
          "Le contact a changé. Relis sa fiche avant de créer la relance.",
        );
      const task = await database.createTaskInTransaction(tx, who.workspaceId, who.userId, {
        title: values.title,
        ...(values.description === null ? {} : { description: values.description }),
        dueAt: values.dueAt,
      });
      const followupId = newId("mfu");
      await tx.query(
        `INSERT INTO music_contact_followups(id,workspace_id,music_contact_id,task_id,time_zone,creator_user_id,idempotency_key,content_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          followupId,
          who.workspaceId,
          values.contactId,
          task.id,
          values.timeZone,
          who.userId,
          input.idempotencyKey,
          hash,
        ],
      );
      await tx.query(
        `INSERT INTO activity_logs(id,workspace_id,actor_user_id,action,entity_type,entity_id,payload)
        VALUES($1,$2,$3,'music.followup.created','MUSIC_FOLLOWUP',$4,$5::json)`,
        [
          newId("act"),
          who.workspaceId,
          who.userId,
          followupId,
          JSON.stringify({
            musicContactId: values.contactId,
            artistProjectId: contact.artist_project_id,
            taskId: task.id,
          }),
        ],
      );
      const data = await read(tx, who.workspaceId, followupId);
      await check(request, musicFollowupWriteTool, tx);
      return { data, replayed: false };
    });
    return reply.code(result.replayed ? 200 : 201).send(musicFollowupResponseSchema.parse(result));
  });
}
