import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";

async function removeTestDirectory(root: string) {
  const temporaryPath = relative(resolve(tmpdir()), resolve(root));
  if (isAbsolute(temporaryPath) || temporaryPath.startsWith("..") || !temporaryPath.startsWith("ida-seed-dates-")) {
    throw new Error("Chemin temporaire hors périmètre.");
  }
  await rm(root, { recursive: true, force: true });
}

it("date une nouvelle démo et conserve dates, hashes et décisions au redémarrage", async () => {
  const root = await mkdtemp(join(tmpdir(), "ida-seed-dates-"));
  const dataDir = join(root, "data");
  const storageDir = join(root, "media");
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let database: DemoDatabase | undefined;
  let currentNow = new Date("2026-09-06T16:00:00.000Z");
  const now = () => new Date(currentNow);
  try {
    const seedClock = vi.fn(now);
    database = await DemoDatabase.open({ dataDir, now: seedClock });
    expect(seedClock).toHaveBeenCalledOnce();
    await database.close();
    database = undefined;
    app = await createApp({ dataDir, storageDir, now });
    const queue = (await app.inject({ method: "GET", url: "/v1/approvals/queue" })).json().data;
    expect(queue.map((item: { plannedAt: string }) => item.plannedAt)).toEqual([
      "2026-09-08T18:00:00.000Z",
      "2026-09-10T17:30:00.000Z",
    ]);
    const proposal = queue[0];
    const payload = { approvalId: proposal.approvalId, expectedPayloadHash: proposal.payloadHash };
    expect(
      (await app.inject({ method: "POST", url: `/v1/post-variants/${proposal.variantId}/approve`, payload }))
        .statusCode,
    ).toBe(200);
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal.variantId}/internal-schedules`,
      payload,
    });
    expect(scheduled.statusCode).toBe(201);
    const schedule = scheduled.json().data;
    expect(schedule).toMatchObject({
      scheduledAt: proposal.plannedAt,
      payloadHash: proposal.payloadHash,
      deliveryState: "NOT_CONFIGURED",
    });
    const summary = (await app.inject({ method: "GET", url: "/v1/dashboard/summary" })).json().data;
    expect(summary).toMatchObject({ pendingApprovals: 1, activeInternalSchedules: 1, upcomingReleases: 1 });
    // Dimanche : le créneau de mardi est dans le mois, pas dans la semaine courante.
    const month = (await app.inject({ method: "GET", url: "/v1/calendar?view=MONTH" })).json().data;
    expect(month.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: schedule.id, state: "SCHEDULED_INTERNAL" })]),
    );
    await app.close();
    app = undefined;

    database = await DemoDatabase.open({ dataDir, seed: false });
    const readState = (openedDatabase: DemoDatabase) =>
      openedDatabase.pglite.query(`
      SELECT v.id, v.planned_at, v.payload_hash, v.approval_state,
        a.payload_hash AS approval_hash, a.state AS approval_state_saved,
        a.decided_at, r.release_date, t.release_date AS track_release_date
      FROM post_variants v JOIN approvals a ON a.post_variant_id = v.id
      JOIN releases r ON r.id = 'rel_lumiere_noire'
      JOIN tracks t ON t.id = 'trk_lumiere_noire'
      WHERE v.id IN ('variant_lumiere_instagram', 'variant_lumiere_tiktok') ORDER BY v.id
    `);
    const before = await readState(database);
    await database.close();
    currentNow = new Date("2026-11-01T12:00:00.000Z");
    database = await DemoDatabase.open({ dataDir, now });
    expect((await readState(database)).rows).toEqual(before.rows);
    await database.close();
    database = undefined;
    app = await createApp({ dataDir, storageDir, now });
    const pendingAfter = (await app.inject({ method: "GET", url: "/v1/approvals/queue" })).json().data;
    expect(pendingAfter).toEqual([queue[1]]);
    const cancelled = await app.inject({ method: "POST", url: `/v1/internal-post-schedules/${schedule.id}/cancel` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data).toMatchObject({
      id: schedule.id,
      scheduledAt: proposal.plannedAt,
      state: "CANCELLED",
    });
    const rescheduled = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal.variantId}/internal-schedules`,
      payload,
    });
    expect(rescheduled.statusCode).toBe(409);
    expect(rescheduled.json()).toMatchObject({ error: { code: "SCHEDULE_TIME_UNAVAILABLE" } });
    const finalSummary = (await app.inject({ method: "GET", url: "/v1/dashboard/summary" })).json().data;
    expect(finalSummary).toMatchObject({ pendingApprovals: 1, activeInternalSchedules: 0 });
  } finally {
    await app?.close();
    await database?.close();
    await removeTestDirectory(root);
  }
}, 30_000);
