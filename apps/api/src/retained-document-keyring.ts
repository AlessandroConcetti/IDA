import { z } from "zod";

const versionSchema = z
  .object({
    keyId: z.string().uuid(),
    status: z.enum(["ACTIVE", "STAGED", "RETIRED"]),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
const manifestSchema = z
  .object({
    format: z.literal("IDA_RETAINED_KEYRING_V1"),
    currentKeyId: z.string().uuid(),
    versions: z.array(versionSchema).min(1).max(64),
  })
  .strict();
export type RetainedKeyVersion = z.infer<typeof versionSchema>;
export type RetainedKeyringManifest = z.infer<typeof manifestSchema>;
export type RetainedKeyReferences = ReadonlyMap<string, number>;

export class RetainedKeyringError extends Error {
  constructor(
    readonly code:
      | "KEYRING_INVALID"
      | "ROTATION_ALREADY_STAGED"
      | "ROTATION_NOT_STAGED"
      | "ROTATION_REFERENCES_REMAIN"
      | "KEY_VERSION_NOT_RETIRABLE"
      | "KEY_REFERENCES_REMAIN"
      | "VERIFIED_BACKUP_REQUIRED",
  ) {
    super(code);
  }
}

function parseManifest(input: unknown): RetainedKeyringManifest {
  try {
    const manifest = manifestSchema.parse(input);
    const ids = manifest.versions.map(({ keyId }) => keyId);
    if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_KEY_ID");
    const active = manifest.versions.filter(({ status }) => status === "ACTIVE");
    const staged = manifest.versions.filter(({ status }) => status === "STAGED");
    if (active.length !== 1 || active[0]?.keyId !== manifest.currentKeyId || staged.length > 1) {
      throw new Error("INVALID_KEY_STATES");
    }
    return manifest;
  } catch {
    throw new RetainedKeyringError("KEYRING_INVALID");
  }
}

function referenceCount(references: RetainedKeyReferences, keyId: string): number {
  const count = references.get(keyId) ?? 0;
  if (!Number.isSafeInteger(count) || count < 0) throw new RetainedKeyringError("KEYRING_INVALID");
  return count;
}

function validateReferenceKeys(manifest: RetainedKeyringManifest, references: RetainedKeyReferences): void {
  const allowed = new Set(manifest.versions.map(({ keyId }) => keyId));
  if ([...allowed].some((keyId) => !references.has(keyId))) throw new RetainedKeyringError("KEYRING_INVALID");
  for (const [keyId, count] of references) {
    if (!allowed.has(keyId) || !Number.isSafeInteger(count) || count < 0)
      throw new RetainedKeyringError("KEYRING_INVALID");
  }
}

/** Add a DPAPI-protected new key as STAGED; the current version remains active. */
export function stageRetainedKeyRotation(
  input: unknown,
  nextKeyId: string,
  createdAt: string,
): RetainedKeyringManifest {
  const manifest = parseManifest(input);
  try {
    const keyId = z.string().uuid().parse(nextKeyId);
    const at = z.string().datetime({ offset: true }).parse(createdAt);
    if (manifest.versions.some(({ status }) => status === "STAGED"))
      throw new RetainedKeyringError("ROTATION_ALREADY_STAGED");
    if (manifest.versions.some((version) => version.keyId === keyId) || manifest.versions.length >= 64)
      throw new RetainedKeyringError("KEYRING_INVALID");
    return manifestSchema.parse({
      ...manifest,
      versions: [...manifest.versions, { keyId, status: "STAGED", createdAt: at }],
    });
  } catch (error) {
    if (error instanceof RetainedKeyringError) throw error;
    throw new RetainedKeyringError("KEYRING_INVALID");
  }
}

/** Reports whether a restarted rotation can activate or must re-encrypt more rows. */
export function planRetainedKeyRotation(
  input: unknown,
  references: RetainedKeyReferences,
): { fromKeyId: string; toKeyId: string; rowsRemaining: number; canActivate: boolean } {
  const manifest = parseManifest(input);
  validateReferenceKeys(manifest, references);
  const next = manifest.versions.find(({ status }) => status === "STAGED");
  if (!next) throw new RetainedKeyringError("ROTATION_NOT_STAGED");
  const rowsRemaining = referenceCount(references, manifest.currentKeyId);
  return { fromKeyId: manifest.currentKeyId, toKeyId: next.keyId, rowsRemaining, canActivate: rowsRemaining === 0 };
}

/** Activate only after every record under the previous current key has been re-sealed. */
export function completeRetainedKeyRotation(
  input: unknown,
  references: RetainedKeyReferences,
): RetainedKeyringManifest {
  const manifest = parseManifest(input);
  validateReferenceKeys(manifest, references);
  const staged = manifest.versions.find(({ status }) => status === "STAGED");
  if (!staged) throw new RetainedKeyringError("ROTATION_NOT_STAGED");
  if (referenceCount(references, manifest.currentKeyId) !== 0)
    throw new RetainedKeyringError("ROTATION_REFERENCES_REMAIN");
  return manifestSchema.parse({
    ...manifest,
    currentKeyId: staged.keyId,
    versions: manifest.versions.map((version) =>
      version.keyId === staged.keyId
        ? { ...version, status: "ACTIVE" }
        : version.keyId === manifest.currentKeyId
          ? { ...version, status: "RETIRED" }
          : version,
    ),
  });
}

/** Key material can be discarded only after an authenticated backup and zero references. */
export function retireRetainedKeyVersion(
  input: unknown,
  retiredKeyId: string,
  references: RetainedKeyReferences,
  verifiedBackup: boolean,
): RetainedKeyringManifest {
  const manifest = parseManifest(input);
  validateReferenceKeys(manifest, references);
  const keyId = z.string().uuid().safeParse(retiredKeyId);
  const version = keyId.success ? manifest.versions.find((item) => item.keyId === keyId.data) : undefined;
  if (version?.status !== "RETIRED") throw new RetainedKeyringError("KEY_VERSION_NOT_RETIRABLE");
  if (!verifiedBackup) throw new RetainedKeyringError("VERIFIED_BACKUP_REQUIRED");
  if (referenceCount(references, version.keyId) !== 0) throw new RetainedKeyringError("KEY_REFERENCES_REMAIN");
  return manifestSchema.parse({
    ...manifest,
    versions: manifest.versions.filter((item) => item.keyId !== version.keyId),
  });
}
