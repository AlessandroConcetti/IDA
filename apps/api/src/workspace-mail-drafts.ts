import { createHash, randomUUID } from "node:crypto";
import {
  musicContactParamsSchema,
  musicMailDraftCreateSchema,
  type RequestIdentityContext,
  type WorkspaceMailDraft,
  workspaceMailDraftListSchema,
  workspaceMailDraftParamsSchema,
  workspaceMailDraftPatchSchema,
  workspaceMailDraftQuerySchema,
  workspaceMailDraftResponseSchema,
  workspaceMailDraftSchema,
} from "@ida/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DemoDatabase } from "./database.js";
import { musicContactReadTool } from "./music-contacts.js";

// Workspace has no separate ModuleKey yet. IDA owns the shared internal mail-draft tool.
export const mailDraftReadTool = {
  toolKey: "read_workspace_mail_drafts",
  moduleKey: "IDA",
  permission: "READ",
} as const;
export const mailDraftWriteTool = {
  toolKey: "write_workspace_mail_drafts",
  moduleKey: "IDA",
  permission: "WRITE",
} as const;
type Tool = typeof mailDraftReadTool | typeof mailDraftWriteTool | typeof musicContactReadTool;
type Reader = Pick<DemoDatabase["pglite"], "query">;
type Options = {
  authorize: (request: FastifyRequest, tool: Tool) => RequestIdentityContext;
  revalidate: (request: FastifyRequest, tool: Tool, reader: Reader) => Promise<void>;
};
const fail = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });
const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const columns = {
  subject: "subject",
  body: "body",
  recipientEmail: "recipient_email",
  listeningUrl: "listening_url",
  status: "status",
} as const;
const keys = Object.keys(columns) as (keyof typeof columns)[];
const select = `SELECT d.id,d.music_contact_id AS "musicContactId",l.artist_project_id AS "artistProjectId",
  p.name AS "projectName",c.organisation,c.source_url AS "contactSourceUrl",c.email AS "currentContactEmail",
  d.purpose,d.track_id AS "trackId",t.title AS "trackTitle",d.listening_url AS "listeningUrl",
  d.recipient_email AS "recipientEmail",d.subject,d.body,d.status,d.revision,
  d.created_at AS "createdAt",d.updated_at AS "updatedAt"
  FROM workspace_mail_drafts d JOIN music_contact_links l ON l.workspace_id=d.workspace_id AND l.id=d.music_contact_id
  JOIN workspace_contacts c ON c.workspace_id=l.workspace_id AND c.id=l.contact_id
  JOIN artist_projects p ON p.workspace_id=l.workspace_id AND p.id=l.artist_project_id
  LEFT JOIN tracks t ON t.workspace_id=d.workspace_id AND t.id=d.track_id`;
type Row = Omit<WorkspaceMailDraft, "createdAt" | "updatedAt"> & { createdAt: string | Date; updatedAt: string | Date };
const present = (row: Row) =>
  workspaceMailDraftSchema.parse({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

/** One shared, internal draft. No transport, token, provider, external draft or send operation. */
export async function registerWorkspaceMailDrafts(app: FastifyInstance, database: DemoDatabase, options: Options) {
  await database.pglite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS music_contact_links_mail_scope ON music_contact_links(workspace_id,id);
    CREATE UNIQUE INDEX IF NOT EXISTS tracks_mail_scope ON tracks(workspace_id,id);
    CREATE TABLE IF NOT EXISTS workspace_mail_drafts (
      id TEXT PRIMARY KEY CHECK(id ~ '^wmd_[a-f0-9]{32}$'),workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      music_contact_id TEXT NOT NULL,track_id TEXT,
      purpose TEXT NOT NULL CHECK(purpose IN ('LABEL_DEMO','GIG','PRIVATE_EVENT')),
      recipient_email TEXT,listening_url TEXT,subject TEXT NOT NULL,body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ARCHIVED')),
      revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
      creator_user_id TEXT NOT NULL REFERENCES users(id),idempotency_key UUID NOT NULL,content_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY(workspace_id,music_contact_id) REFERENCES music_contact_links(workspace_id,id),
      FOREIGN KEY(workspace_id,track_id) REFERENCES tracks(workspace_id,id),
      UNIQUE(workspace_id,creator_user_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS workspace_mail_drafts_page ON workspace_mail_drafts(workspace_id,created_at,id);
  `);
  async function check(request: FastifyRequest, tool: Tool, reader: Reader) {
    await options.revalidate(request, tool, reader);
    // This first shared projection contains Music context. It must not bypass its source-domain grant.
    await options.revalidate(request, musicContactReadTool, reader);
    if (request.raw.aborted)
      throw fail(408, "MAIL_DRAFT_CANCELLED", "Demande interrompue. Actualise avant de réessayer.");
  }
  function identity(request: FastifyRequest, tool: Tool) {
    options.authorize(request, musicContactReadTool);
    return options.authorize(request, tool);
  }
  function noQuery(request: FastifyRequest) {
    if (Object.keys(request.query as object).length)
      throw fail(400, "MAIL_DRAFT_INPUT", "Aucun filtre attendu pour cette action.");
  }
  function id(request: FastifyRequest) {
    const parsed = workspaceMailDraftParamsSchema.safeParse(request.params);
    if (!parsed.success) throw fail(400, "MAIL_DRAFT_INPUT", "Identifiant de brouillon invalide.");
    return parsed.data.draftId;
  }
  async function read(reader: Reader, workspaceId: string, draftId: string) {
    const row = (await reader.query<Row>(`${select} WHERE d.workspace_id=$1 AND d.id=$2`, [workspaceId, draftId]))
      .rows[0];
    if (!row) throw fail(404, "MAIL_DRAFT_NOT_FOUND", "Brouillon introuvable dans cet espace.");
    return present(row);
  }
  async function audit(reader: Reader, who: RequestIdentityContext, draftId: string, action: string, payload: object) {
    await reader.query(
      `INSERT INTO activity_logs(id,workspace_id,actor_user_id,action,entity_type,entity_id,payload)
      VALUES($1,$2,$3,$4,'WORKSPACE_MAIL_DRAFT',$5,$6::json)`,
      [newId("act"), who.workspaceId, who.userId, action, draftId, JSON.stringify(payload)],
    );
  }
  app.get("/v1/workspace/mail-drafts", async (request) => {
    const who = identity(request, mailDraftReadTool);
    const parsed = workspaceMailDraftQuerySchema.safeParse(request.query);
    if (!parsed.success) throw fail(400, "MAIL_DRAFT_INPUT", "Filtres de brouillons invalides.");
    const input = parsed.data;
    return database.pglite.transaction(async (tx) => {
      await check(request, mailDraftReadTool, tx);
      const rows = (
        await tx.query<Row>(
          `${select} WHERE d.workspace_id=$1
        AND ($2::text IS NULL OR d.music_contact_id=$2) AND ($3::text IS NULL OR d.status=$3)
        ORDER BY d.created_at DESC,d.id LIMIT 26 OFFSET $4`,
          [who.workspaceId, input.musicContactId ?? null, input.status ?? null, input.offset],
        )
      ).rows;
      const data = workspaceMailDraftListSchema.parse({
        data: rows.slice(0, 25).map(present),
        nextOffset: rows.length > 25 ? input.offset + 25 : null,
      });
      await check(request, mailDraftReadTool, tx);
      return data;
    });
  });
  app.get("/v1/workspace/mail-drafts/:draftId", async (request) => {
    const who = identity(request, mailDraftReadTool);
    const draftId = id(request);
    noQuery(request);
    return database.pglite.transaction(async (tx) => {
      await check(request, mailDraftReadTool, tx);
      const data = await read(tx, who.workspaceId, draftId);
      await check(request, mailDraftReadTool, tx);
      return workspaceMailDraftResponseSchema.parse({ data });
    });
  });
  app.post("/v1/music/contacts/:contactId/mail-drafts", { bodyLimit: 131072 }, async (request, reply) => {
    const who = identity(request, mailDraftWriteTool);
    noQuery(request);
    const parsed = musicMailDraftCreateSchema.safeParse(request.body);
    const params = musicContactParamsSchema.safeParse(request.params);
    if (!parsed.success || !params.success)
      throw fail(400, "MAIL_DRAFT_INPUT", "Vérifie le contact, l’objet, le texte et les références du brouillon.");
    const input = parsed.data;
    const contactId = params.data.contactId;
    const values = {
      contactId,
      purpose: input.purpose,
      trackId: input.trackId ?? null,
      listeningUrl: input.listeningUrl ?? null,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
    };
    const hash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
    const result = await database.pglite.transaction(async (tx) => {
      await check(request, mailDraftWriteTool, tx);
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [who.workspaceId]);
      const previous = (
        await tx.query<{ id: string; content_hash: string }>(
          "SELECT id,content_hash FROM workspace_mail_drafts WHERE workspace_id=$1 AND creator_user_id=$2 AND idempotency_key=$3",
          [who.workspaceId, who.userId, input.idempotencyKey],
        )
      ).rows[0];
      if (previous) {
        if (hash !== previous.content_hash)
          throw fail(
            409,
            "MAIL_DRAFT_IDEMPOTENCY_CONFLICT",
            "Cette demande existe avec un autre contenu. Ouvre le brouillon enregistré avant de recommencer.",
          );
        const data = await read(tx, who.workspaceId, previous.id);
        await check(request, mailDraftWriteTool, tx);
        return { data, replayed: true };
      }
      const contact = (
        await tx.query<{ artist_project_id: string; revision: number }>(
          "SELECT artist_project_id,revision FROM music_contact_links WHERE workspace_id=$1 AND id=$2",
          [who.workspaceId, contactId],
        )
      ).rows[0];
      if (!contact) throw fail(404, "MAIL_DRAFT_CONTACT_NOT_FOUND", "Contact musical introuvable dans cet espace.");
      if (contact.revision !== input.expectedContactRevision)
        throw fail(
          409,
          "MAIL_DRAFT_CONTACT_CHANGED",
          "Le contact a changé. Relis sa fiche avant de créer le brouillon.",
        );
      if (values.trackId) {
        const track = await tx.query("SELECT id FROM tracks WHERE workspace_id=$1 AND id=$2 AND artist_project_id=$3", [
          who.workspaceId,
          values.trackId,
          contact.artist_project_id,
        ]);
        if (!track.rows.length)
          throw fail(404, "MAIL_DRAFT_TRACK_NOT_FOUND", "Morceau introuvable pour ce projet musical.");
      }
      const draftId = newId("wmd");
      await tx.query(
        `INSERT INTO workspace_mail_drafts(id,workspace_id,music_contact_id,track_id,purpose,recipient_email,listening_url,subject,body,creator_user_id,idempotency_key,content_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          draftId,
          who.workspaceId,
          contactId,
          values.trackId,
          values.purpose,
          values.recipientEmail,
          values.listeningUrl,
          values.subject,
          values.body,
          who.userId,
          input.idempotencyKey,
          hash,
        ],
      );
      await audit(tx, who, draftId, "workspace.mail_draft.created", {
        musicContactId: contactId,
        artistProjectId: contact.artist_project_id,
        purpose: values.purpose,
        trackId: values.trackId,
      });
      const data = await read(tx, who.workspaceId, draftId);
      await check(request, mailDraftWriteTool, tx);
      return { data, replayed: false };
    });
    return reply.code(result.replayed ? 200 : 201).send(workspaceMailDraftResponseSchema.parse(result));
  });
  app.patch("/v1/workspace/mail-drafts/:draftId", { bodyLimit: 131072 }, async (request) => {
    const who = identity(request, mailDraftWriteTool);
    const draftId = id(request);
    noQuery(request);
    const parsed = workspaceMailDraftPatchSchema.safeParse(request.body);
    if (!parsed.success)
      throw fail(400, "MAIL_DRAFT_INPUT", "Vérifie l’objet, le texte, l’adresse et la révision du brouillon.");
    const input = parsed.data;
    return database.pglite.transaction(async (tx) => {
      await check(request, mailDraftWriteTool, tx);
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [who.workspaceId]);
      const current = await read(tx, who.workspaceId, draftId);
      const changed = keys.filter((key) => Object.hasOwn(input, key) && input[key] !== current[key]);
      if (changed.length && current.revision !== input.expectedRevision)
        throw fail(
          409,
          "MAIL_DRAFT_REVISION_CONFLICT",
          "Ce brouillon a changé. Copie tes modifications puis recharge-le avant de les réappliquer.",
        );
      if (changed.length) {
        const values: unknown[] = [who.workspaceId, draftId];
        const assignments = changed.map((key) => {
          values.push(input[key]);
          return `${columns[key]}=$${values.length}`;
        });
        await tx.query(
          `UPDATE workspace_mail_drafts SET ${assignments.join(",")},revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
          values,
        );
        await audit(tx, who, draftId, "workspace.mail_draft.updated", {
          fields: changed,
          revision: current.revision + 1,
          fromStatus: current.status,
          toStatus: input.status ?? current.status,
        });
      }
      const data = await read(tx, who.workspaceId, draftId);
      await check(request, mailDraftWriteTool, tx);
      return workspaceMailDraftResponseSchema.parse({ data });
    });
  });
}
