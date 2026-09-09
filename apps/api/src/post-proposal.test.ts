import { randomUUID } from "node:crypto";
import {
  approvalQueueItemSchema,
  manualPostProposalCreateSchema,
  manualPostProposalReceiptSchema,
} from "@ida/contracts";
import { ToolGateway, ToolPolicyError } from "@ida/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

const now = () => new Date("2026-09-09T10:00:00Z");
let database: DemoDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const fields = () => ({
  requestId: randomUUID(),
  mediaId: "med_studio_light",
  postTitle: "Test synthétique",
  platform: "INSTAGRAM",
  caption: "Un extrait de studio.",
  objective: "Présenter le morceau.",
  hashtags: ["#Studio"],
  cta: "Votre avis ?",
});
const send = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/v1/post-proposals",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });
beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://", now });
  vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  app = await createApp({ dataDir: "memory://", now });
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await database.pglite.query(
    "UPDATE identity_sessions SET status = 'ACTIVE', revoked_at = NULL, expires_at = $2 WHERE id = $1",
    [demoIdentity.sessionId, demoIdentity.expiresAt],
  );
  await database.pglite.query("UPDATE client_instances SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1", [
    demoIdentity.clientInstanceId,
  ]);
  await database.pglite.query(
    "UPDATE client_workspace_grants SET status = 'ACTIVE', access_level = 'TRUSTED' WHERE client_instance_id = $1",
    [demoIdentity.clientInstanceId],
  );
  await database.pglite.query(
    "UPDATE memberships SET role = 'OWNER', status = 'ACTIVE' WHERE workspace_id = $1 AND user_id = $2",
    [demoContext.workspaceId, demoContext.userId],
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => app.close());

async function counts() {
  return (
    await database.pglite.query(`SELECT
    (SELECT count(*) FROM posts) AS posts, (SELECT count(*) FROM post_variants) AS variants,
    (SELECT count(*) FROM post_variant_media) AS links, (SELECT count(*) FROM approvals) AS approvals,
    (SELECT count(*) FROM activity_logs) AS audit`)
  ).rows;
}
async function sideEffects() {
  return (
    await database.pglite.query(`SELECT
    (SELECT json_agg(row_to_json(m)) FROM media_assets m) AS media,
    (SELECT json_agg(row_to_json(s)) FROM internal_post_schedules s) AS schedules,
    (SELECT json_agg(row_to_json(s)) FROM scheduled_posts s) AS deliveries,
    (SELECT json_agg(row_to_json(m)) FROM memories m) AS memories`)
  ).rows;
}
describe("Préparation manuelle — du média à la validation", () => {
  it("crée une proposition exacte puis utilise l'approbation existante sans publication", async () => {
    const before = await sideEffects();
    const payload = fields();
    const response = await send(payload);
    expect(response.statusCode).toBe(201);
    const receipt = manualPostProposalReceiptSchema.parse(response.json().data);
    expect(receipt.replayed).toBe(false);
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const item = approvalQueueItemSchema
      .array()
      .parse(queue.json().data)
      .find((item) => item.variantId === receipt.variantId);
    expect(item).toMatchObject({
      postTitle: payload.postTitle,
      caption: payload.caption,
      objective: payload.objective,
      hashtags: payload.hashtags,
      cta: payload.cta,
      timezone: "Europe/Paris",
      approvalState: "REQUESTED",
      deliveryState: "NOT_CONFIGURED",
      media: [{ id: payload.mediaId, filename: "studio-lumiere-noire-take-04.mp4", type: "VIDEO", status: "UNUSED" }],
    });
    expect(item?.plannedAt).toBeUndefined();
    const approved = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${receipt.variantId}/approve`,
      payload: { approvalId: receipt.approvalId, expectedPayloadHash: item?.payloadHash },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.approvalState).toBe("APPROVED");
    expect(await sideEffects()).toEqual(before);
    const retry = await send(payload);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual({ ...receipt, replayed: true });
    expect(
      (await database.listApprovalQueue(demoContext.workspaceId)).some((item) => item.variantId === receipt.variantId),
    ).toBe(false);
  });
  it("déduplique les retries concurrents, refuse une clé réutilisée avec un autre texte", async () => {
    const payload = fields();
    const [a, b] = await Promise.all([send(payload), send(payload)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().data.variantId).toBe(b.json().data.variantId);
    const before = await counts();
    expect((await send({ ...payload, caption: "Autre texte" })).statusCode).toBe(409);
    expect(await counts()).toEqual(before);
    const audit = await database.pglite.query<{ payload: unknown }>(
      "SELECT payload FROM activity_logs WHERE entity_id = $1",
      [a.json().data.variantId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(Object.keys(audit.rows[0]?.payload as object).sort()).toEqual([
      "approvalId",
      "payloadHash",
      "requestHash",
      "source",
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(payload.caption);
  });
  it.each(["workspaceId", "actorUserId", "approvalState", "payloadHash", "plannedAt", "rationale", "mediaIds"])(
    "refuse le champ client non autorisé %s avant création",
    async (key) => {
      const before = await counts();
      expect((await send({ ...fields(), [key]: "forged" })).statusCode).toBe(400);
      expect(await counts()).toEqual(before);
    },
  );
  it.each(["med_other_workspace", "med_unknown"])("ne révèle pas le média absent ou étranger %s", async (mediaId) => {
    const before = await counts();
    const result = await send({ ...fields(), mediaId });
    expect(result.statusCode).toBe(404);
    expect(result.json().error.code).toBe("PROPOSAL_MEDIA_NOT_FOUND");
    expect(await counts()).toEqual(before);
  });
  it.each([
    { caption: " " },
    { objective: "x".repeat(2001) },
    { mediaId: "../med" },
    { requestId: "not-uuid" },
    { platform: "UNKNOWN" },
    { hashtags: Array(31).fill("#Tag") },
  ])("valide le corps borné : %j", async (invalid) => {
    expect((await send({ ...fields(), ...invalid })).statusCode).toBe(400);
  });
  it("refuse les médias archivés, l'audio et une plateforme inactive", async () => {
    const before = await counts();
    const original = await database.findMedia(demoContext.workspaceId, "med_artwork");
    try {
      await database.pglite.query("UPDATE media_assets SET status = 'ARCHIVED' WHERE id = 'med_artwork'");
      expect((await send({ ...fields(), mediaId: "med_artwork" })).statusCode).toBe(409);
      await database.pglite.query(
        "UPDATE media_assets SET status = 'UNUSED', media_type = 'AUDIO' WHERE id = 'med_artwork'",
      );
      expect((await send({ ...fields(), mediaId: "med_artwork" })).statusCode).toBe(409);
      await database.pglite.query("UPDATE social_platforms SET is_active = FALSE WHERE key = 'INSTAGRAM'");
      expect((await send(fields())).statusCode).toBe(409);
      expect(await counts()).toEqual(before);
    } finally {
      await database.pglite.query("UPDATE media_assets SET status = $1, media_type = $2 WHERE id = 'med_artwork'", [
        original?.status,
        original?.mediaType,
      ]);
      await database.pglite.query("UPDATE social_platforms SET is_active = TRUE WHERE key = 'INSTAGRAM'");
    }
  });
  it("conserve l'interdiction WRITE d'un appareil VIEW_ONLY", async () => {
    const before = await counts();
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1",
      [demoIdentity.clientInstanceId],
    );
    expect((await send(fields())).statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });
  it("un EDITOR peut proposer mais ne peut pas approuver", async () => {
    await database.pglite.query("UPDATE memberships SET role = 'EDITOR' WHERE workspace_id = $1 AND user_id = $2", [
      demoContext.workspaceId,
      demoContext.userId,
    ]);
    const response = await send(fields());
    expect(response.statusCode).toBe(201);
    const receipt = response.json().data;
    const item = (await database.listApprovalQueue(demoContext.workspaceId)).find(
      (item) => item.variantId === receipt.variantId,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/post-variants/${receipt.variantId}/approve`,
          payload: { approvalId: receipt.approvalId, expectedPayloadHash: item?.payloadHash },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("ne contourne pas le Tool Gateway", async () => {
    const before = await counts();
    vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(() => {
      throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Refus synthétique");
    });
    expect((await send(fields())).statusCode).toBe(403);
    expect(await counts()).toEqual(before);
  });
  it("annule toute l'écriture si l'identité est révoquée avant le commit", async () => {
    const before = await counts();
    const resolve = database.resolveRequestIdentityContext.bind(database);
    let checks = 0;
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      const identity = await resolve(...args);
      if (args[3] && ++checks === 3 && identity)
        return { ...identity, clientInstance: { ...identity.clientInstance, status: "REVOKED" } };
      return identity;
    });
    expect((await send(fields())).statusCode).toBe(403);
    expect(checks).toBe(3);
    expect(await counts()).toEqual(before);
  });
  it("isole la même clé entre workspaces et acteurs", async () => {
    const input = manualPostProposalCreateSchema.parse(fields());
    const own = await database.createManualPostProposal(
      demoContext.workspaceId,
      demoContext.userId,
      input,
      async () => {},
    );
    const other = await database.createManualPostProposal(
      "wsp_other",
      "usr_other",
      { ...input, mediaId: "med_other_workspace" },
      async () => {},
    );
    expect(own.kind).toBe("created");
    expect(other.kind).toBe("created");
    if (!("receipt" in own) || !("receipt" in other)) throw new Error("Missing receipt");
    expect(other.receipt.postId).not.toBe(own.receipt.postId);
    expect(
      (await database.listApprovalQueue(demoContext.workspaceId)).some((item) => item.postId === other.receipt.postId),
    ).toBe(false);
  });
  it("n'effectue aucun appel réseau pendant la préparation", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network denied"));
    expect((await send(fields())).statusCode).toBe(201);
    expect(fetch).not.toHaveBeenCalled();
  });
});
