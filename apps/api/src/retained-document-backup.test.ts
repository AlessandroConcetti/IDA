import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import type { DemoDatabase } from "./database.js";
import {
  countRetainedVaultKeyReferences,
  planRetainedVaultRestore,
  RetainedKeyReferenceCountError,
  RetainedVaultRestorePlanError,
} from "./retained-document-backup.js";

const domain = "HEALTH" as const;
const workspaceId = "wsp_synthetic";
const ownerUserId = "usr_synthetic";
const at = "2026-09-27T10:00:00.000Z";
const backupRecord = (resourceId: string, overrides: Record<string, unknown> = {}) => ({
  domain,
  workspaceId,
  ownerUserId,
  resourceId,
  revision: 1,
  state: "STORED",
  sealed: {
    format: "IDA_RETAINED_DOCUMENT_V1",
    keyId: "00000000-0000-4000-8000-000000000001",
    nonce: "AAAAAAAAAAAAAAAA",
    tag: "AAAAAAAAAAAAAAAAAAAAAAAA",
    ciphertext: "AAAA",
  },
  createdAt: at,
  updatedAt: at,
  ...overrides,
});
const tombstone = (resourceId: string, overrides: Record<string, unknown> = {}) => ({
  domain,
  workspaceId,
  ownerUserId,
  resourceId,
  deletedRevision: 2,
  deletedAt: at,
  ...overrides,
});
const backup = (records: unknown[], tombstones: unknown[] = []) => ({
  format: "IDA_RETAINED_VAULT_BACKUP_V1",
  domain,
  exportedAt: at,
  records,
  tombstones,
});
const ledger = (entries: unknown[]) => ({ source: "CURRENT_DATABASE", domain, observedAt: at, entries });

describe("retained vault backup restore plan", () => {
  it("requires a current tombstone source and filters deleted encrypted rows before restore", () => {
    const deletedId = "00000000-0000-4000-8000-000000000010";
    const retainedId = "00000000-0000-4000-8000-000000000011";
    const plan = planRetainedVaultRestore(
      backup([backupRecord(deletedId), backupRecord(retainedId)], [tombstone(deletedId)]),
      ledger([tombstone(deletedId, { deletedRevision: 3 })]),
    );

    expect(plan.records.map((record) => record.resourceId)).toEqual([retainedId]);
    expect(plan.tombstones).toEqual([tombstone(deletedId, { deletedRevision: 3 })]);
    expect(JSON.stringify(plan)).not.toContain("plaintext");
  });

  it("fails closed when the current ledger is omitted or belongs to another vault", () => {
    expect(() => planRetainedVaultRestore(backup([]), undefined)).toThrowError(
      new RetainedVaultRestorePlanError("LEDGER_REQUIRED"),
    );
    expect(() => planRetainedVaultRestore(backup([]), { ...ledger([]), domain: "FINANCE" })).toThrowError(
      new RetainedVaultRestorePlanError("BACKUP_INVALID"),
    );
    expect(() =>
      planRetainedVaultRestore(backup([]), { ...ledger([]), observedAt: "2026-09-26T10:00:00.000Z" }),
    ).toThrowError(new RetainedVaultRestorePlanError("BACKUP_INVALID"));
  });

  it("refuses re-binding a tombstoned UUID to a different owner or workspace", () => {
    const id = "00000000-0000-4000-8000-000000000012";
    expect(() =>
      planRetainedVaultRestore(backup([backupRecord(id)]), ledger([tombstone(id, { workspaceId: "wsp_other" })])),
    ).toThrowError(new RetainedVaultRestorePlanError("TOMBSTONE_SCOPE_CONFLICT"));
  });

  it("rejects malformed or duplicated backup records", () => {
    const id = "00000000-0000-4000-8000-000000000013";
    expect(() => planRetainedVaultRestore(backup([backupRecord(id), backupRecord(id)]), ledger([]))).toThrowError(
      new RetainedVaultRestorePlanError("BACKUP_INVALID"),
    );
    expect(() =>
      planRetainedVaultRestore(backup([{ ...backupRecord(id), state: "UNKNOWN" }]), ledger([])),
    ).toThrowError(new RetainedVaultRestorePlanError("BACKUP_INVALID"));
  });
});

describe("retained vault key reference snapshot", () => {
  const currentKeyId = "00000000-0000-4000-8000-000000000001";
  const stagedKeyId = "00000000-0000-4000-8000-000000000002";
  const unknownKeyId = "00000000-0000-4000-8000-000000000003";

  async function createDatabase() {
    const pglite = new PGlite("memory://");
    await pglite.exec(`
      CREATE TABLE care_retained_documents (sealed JSONB NOT NULL, state TEXT NOT NULL);
      CREATE TABLE finance_retained_documents (sealed JSONB NOT NULL, state TEXT NOT NULL);
    `);
    return { pglite, database: { pglite } as unknown as DemoDatabase };
  }

  it("counts all retained rows, including revoked ones, without mixing vault domains", async () => {
    const { pglite, database } = await createDatabase();
    try {
      await pglite.query(
        `INSERT INTO care_retained_documents (sealed, state) VALUES
          ($1::jsonb, 'STORED'), ($1::jsonb, 'ACCESS_REVOKED'), ($2::jsonb, 'STORED')`,
        [JSON.stringify({ keyId: currentKeyId }), JSON.stringify({ keyId: stagedKeyId })],
      );
      await pglite.query("INSERT INTO finance_retained_documents (sealed, state) VALUES ($1::jsonb, 'STORED')", [
        JSON.stringify({ keyId: currentKeyId }),
      ]);

      await expect(countRetainedVaultKeyReferences(database, "HEALTH", [currentKeyId, stagedKeyId])).resolves.toEqual(
        new Map([
          [currentKeyId, 2],
          [stagedKeyId, 1],
        ]),
      );
      await expect(countRetainedVaultKeyReferences(database, "FINANCE", [currentKeyId, stagedKeyId])).resolves.toEqual(
        new Map([
          [currentKeyId, 1],
          [stagedKeyId, 0],
        ]),
      );
    } finally {
      await pglite.close();
    }
  });

  it("fails closed on incomplete, unknown, or malformed key references", async () => {
    const { pglite, database } = await createDatabase();
    try {
      await expect(countRetainedVaultKeyReferences(database, "HEALTH", [currentKeyId, currentKeyId])).rejects.toThrow(
        new RetainedKeyReferenceCountError("KEY_IDS_INVALID"),
      );
      await expect(countRetainedVaultKeyReferences(database, "HEALTH", [currentKeyId])).resolves.toEqual(
        new Map([[currentKeyId, 0]]),
      );
      await pglite.query("INSERT INTO care_retained_documents (sealed, state) VALUES ($1::jsonb, 'STORED')", [
        JSON.stringify({ keyId: unknownKeyId }),
      ]);
      await expect(countRetainedVaultKeyReferences(database, "HEALTH", [currentKeyId])).rejects.toThrow(
        new RetainedKeyReferenceCountError("KEY_REFERENCES_INVALID"),
      );
      await pglite.query("DELETE FROM care_retained_documents");
      await pglite.query("INSERT INTO care_retained_documents (sealed, state) VALUES ($1::jsonb, 'STORED')", [
        JSON.stringify({ format: "IDA_RETAINED_DOCUMENT_V1" }),
      ]);
      await expect(countRetainedVaultKeyReferences(database, "HEALTH", [currentKeyId])).rejects.toThrow(
        new RetainedKeyReferenceCountError("KEY_REFERENCES_INVALID"),
      );
    } finally {
      await pglite.close();
    }
  });
});
