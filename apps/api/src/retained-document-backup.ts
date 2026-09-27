import { z } from "zod";
import type { DemoDatabase } from "./database.js";

const retainedKeyIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(64)
  .refine((ids) => new Set(ids).size === ids.length);

const domainSchema = z.enum(["HEALTH", "FINANCE"]);
const opaqueIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/u);
const timestampSchema = z.string().datetime({ offset: true });
const envelopeSchema = z
  .object({
    format: z.literal("IDA_RETAINED_DOCUMENT_V1"),
    keyId: z.string().uuid(),
    nonce: z.string().length(16),
    tag: z.string().length(24),
    ciphertext: z
      .string()
      .min(4)
      .max(Math.ceil((2 * 1024 * 1024) / 3) * 4),
  })
  .strict();

const tombstoneSchema = z
  .object({
    domain: domainSchema,
    workspaceId: opaqueIdSchema,
    ownerUserId: opaqueIdSchema,
    resourceId: z.string().uuid(),
    deletedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    deletedAt: timestampSchema,
  })
  .strict();

const backupRecordSchema = z
  .object({
    domain: domainSchema,
    workspaceId: opaqueIdSchema,
    ownerUserId: opaqueIdSchema,
    resourceId: z.string().uuid(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    state: z.enum(["STORED", "ACCESS_REVOKED"]),
    sealed: envelopeSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const backupSchema = z
  .object({
    format: z.literal("IDA_RETAINED_VAULT_BACKUP_V1"),
    domain: domainSchema,
    exportedAt: timestampSchema,
    records: z.array(backupRecordSchema).max(100_000),
    tombstones: z.array(tombstoneSchema).max(100_000),
  })
  .strict();

const currentLedgerSchema = z
  .object({
    source: z.enum(["CURRENT_DATABASE", "RECOVERY_LEDGER"]),
    domain: domainSchema,
    observedAt: timestampSchema,
    entries: z.array(tombstoneSchema).max(100_000),
  })
  .strict();

export type RetainedVaultTombstone = z.infer<typeof tombstoneSchema>;
export type RetainedVaultBackupRecord = z.infer<typeof backupRecordSchema>;
export type RetainedVaultBackup = z.infer<typeof backupSchema>;
export type CurrentRetainedVaultLedger = z.infer<typeof currentLedgerSchema>;

export class RetainedKeyReferenceCountError extends Error {
  constructor(readonly code: "KEY_IDS_INVALID" | "KEY_REFERENCES_INVALID" | "KEY_REFERENCE_COUNT_UNAVAILABLE") {
    super(code);
  }
}

/** Count every retained envelope for one vault from a consistent read-only snapshot. */
export async function countRetainedVaultKeyReferences(
  database: DemoDatabase,
  domain: "HEALTH" | "FINANCE",
  keyIdsInput: unknown,
): Promise<ReadonlyMap<string, number>> {
  let keyIds: string[];
  try {
    keyIds = retainedKeyIdsSchema.parse(keyIdsInput);
  } catch {
    throw new RetainedKeyReferenceCountError("KEY_IDS_INVALID");
  }
  const table = domain === "HEALTH" ? "care_retained_documents" : "finance_retained_documents";
  const counts = new Map(keyIds.map((keyId) => [keyId, 0]));
  try {
    await database.pglite.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await tx.query<{ key_id: string | null; reference_count: string }>(
        `SELECT sealed->>'keyId' AS key_id, COUNT(*)::text AS reference_count
         FROM ${table}
         GROUP BY sealed->>'keyId'`,
      );
      for (const row of result.rows) {
        if (!row.key_id || !counts.has(row.key_id)) throw new RetainedKeyReferenceCountError("KEY_REFERENCES_INVALID");
        const count = Number(row.reference_count);
        if (!Number.isSafeInteger(count) || count < 0)
          throw new RetainedKeyReferenceCountError("KEY_REFERENCES_INVALID");
        counts.set(row.key_id, count);
      }
    });
    return counts;
  } catch (error) {
    if (error instanceof RetainedKeyReferenceCountError) throw error;
    throw new RetainedKeyReferenceCountError("KEY_REFERENCE_COUNT_UNAVAILABLE");
  }
}

type VaultDatabaseRecord = {
  resource_id: string;
  workspace_id: string;
  owner_user_id: string;
  revision: number;
  state: "STORED" | "ACCESS_REVOKED";
  sealed: unknown;
  created_at: string;
  updated_at: string;
};
type VaultDatabaseTombstone = {
  resource_id: string;
  workspace_id: string;
  owner_user_id: string;
  deleted_revision: number;
  deleted_at: string;
};

const timestampSql = `to_char($COLUMN$ AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Capture the encrypted CARE or Finance rows/tombstones from one read-only DB snapshot. */
export async function captureRetainedVaultBackupSnapshot(
  database: DemoDatabase,
  domain: "HEALTH" | "FINANCE",
): Promise<RetainedVaultBackup> {
  const table = domain === "HEALTH" ? "care_retained_documents" : "finance_retained_documents";
  const tombstoneTable = `${table}_tombstones`;
  try {
    return await database.pglite.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const captured = await tx.query<{ exported_at: string }>(
        `SELECT ${timestampSql.replace("$COLUMN$", "transaction_timestamp()")} AS exported_at`,
      );
      const exportedAt = captured.rows[0]?.exported_at;
      if (!exportedAt) throw new Error("CAPTURE_TIME_UNAVAILABLE");
      const documents = await tx.query<VaultDatabaseRecord>(
        `SELECT id::text AS resource_id, workspace_id, owner_id AS owner_user_id, revision, state, sealed,
                ${timestampSql.replace("$COLUMN$", "created_at")} AS created_at,
                ${timestampSql.replace("$COLUMN$", "updated_at")} AS updated_at
         FROM ${table} ORDER BY id`,
      );
      const tombstones = await tx.query<VaultDatabaseTombstone>(
        `SELECT document_id::text AS resource_id, workspace_id, owner_id AS owner_user_id, deleted_revision,
                ${timestampSql.replace("$COLUMN$", "deleted_at")} AS deleted_at
         FROM ${tombstoneTable} ORDER BY document_id`,
      );
      return backupSchema.parse({
        format: "IDA_RETAINED_VAULT_BACKUP_V1",
        domain,
        exportedAt,
        records: documents.rows.map((row) => ({
          domain,
          workspaceId: row.workspace_id,
          ownerUserId: row.owner_user_id,
          resourceId: row.resource_id,
          revision: row.revision,
          state: row.state,
          sealed: row.sealed,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        tombstones: tombstones.rows.map((row) => ({
          domain,
          workspaceId: row.workspace_id,
          ownerUserId: row.owner_user_id,
          resourceId: row.resource_id,
          deletedRevision: row.deleted_revision,
          deletedAt: row.deleted_at,
        })),
      });
    });
  } catch {
    throw new RetainedVaultRestorePlanError("BACKUP_INVALID");
  }
}

export class RetainedVaultRestorePlanError extends Error {
  constructor(readonly code: "BACKUP_INVALID" | "LEDGER_REQUIRED" | "TOMBSTONE_SCOPE_CONFLICT") {
    super(code);
  }
}

function identityKey(entry: RetainedVaultTombstone | RetainedVaultBackupRecord): string {
  return JSON.stringify([entry.domain, entry.workspaceId, entry.ownerUserId, entry.resourceId]);
}

function validateUniqueIds<T extends { resourceId: string }>(items: T[]): void {
  if (new Set(items.map(({ resourceId }) => resourceId)).size !== items.length) throw new Error("DUPLICATE_ID");
}

/**
 * Pure pre-restore planner. The caller MUST obtain `currentLedger` independently
 * before replacing a database from backup; this function does not persist data,
 * decrypt documents, authenticate the ledger's freshness, or perform a restore.
 */
export function planRetainedVaultRestore(
  backupInput: unknown,
  currentLedgerInput: unknown,
): { domain: "HEALTH" | "FINANCE"; records: RetainedVaultBackupRecord[]; tombstones: RetainedVaultTombstone[] } {
  try {
    const backup = backupSchema.parse(backupInput);
    if (currentLedgerInput === undefined || currentLedgerInput === null) throw new Error("LEDGER_REQUIRED");
    const ledger = currentLedgerSchema.parse(currentLedgerInput);
    if (ledger.domain !== backup.domain) throw new Error("INVALID_BACKUP");
    const backupTime = Date.parse(backup.exportedAt);
    const ledgerTime = Date.parse(ledger.observedAt);
    if (ledgerTime < backupTime) throw new Error("INVALID_BACKUP");
    if (
      backup.records.some((record) => Date.parse(record.updatedAt) > backupTime) ||
      backup.tombstones.some((entry) => Date.parse(entry.deletedAt) > backupTime) ||
      ledger.entries.some((entry) => Date.parse(entry.deletedAt) > ledgerTime)
    ) {
      throw new Error("INVALID_BACKUP");
    }
    if (ledger.entries.some((entry) => entry.domain !== ledger.domain)) throw new Error("INVALID_BACKUP");
    if (backup.tombstones.some((entry) => entry.domain !== backup.domain)) throw new Error("INVALID_BACKUP");
    if (backup.records.some((entry) => entry.domain !== backup.domain)) throw new Error("INVALID_BACKUP");
    validateUniqueIds(backup.records);
    validateUniqueIds(backup.tombstones);
    validateUniqueIds(ledger.entries);

    const tombstonesById = new Map<string, RetainedVaultTombstone>();
    for (const tombstone of [...backup.tombstones, ...ledger.entries]) {
      const previous = tombstonesById.get(tombstone.resourceId);
      if (!previous) {
        tombstonesById.set(tombstone.resourceId, tombstone);
        continue;
      }
      if (identityKey(previous) !== identityKey(tombstone)) throw new Error("TOMBSTONE_SCOPE_CONFLICT");
      tombstonesById.set(tombstone.resourceId, {
        ...previous,
        deletedRevision: Math.max(previous.deletedRevision, tombstone.deletedRevision),
        deletedAt:
          Date.parse(previous.deletedAt) > Date.parse(tombstone.deletedAt) ? previous.deletedAt : tombstone.deletedAt,
      });
    }

    const records = backup.records.filter((record) => {
      const tombstone = tombstonesById.get(record.resourceId);
      if (!tombstone) return true;
      if (identityKey(record) !== identityKey(tombstone)) throw new Error("TOMBSTONE_SCOPE_CONFLICT");
      return false;
    });
    return {
      domain: backup.domain,
      records,
      tombstones: [...tombstonesById.values()].sort((left, right) => left.resourceId.localeCompare(right.resourceId)),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "LEDGER_REQUIRED")
      throw new RetainedVaultRestorePlanError("LEDGER_REQUIRED");
    if (error instanceof Error && error.message === "TOMBSTONE_SCOPE_CONFLICT")
      throw new RetainedVaultRestorePlanError("TOMBSTONE_SCOPE_CONFLICT");
    throw new RetainedVaultRestorePlanError("BACKUP_INVALID");
  }
}
