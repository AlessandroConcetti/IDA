import { describe, expect, it } from "vitest";
import {
  completeRetainedKeyRotation,
  planRetainedKeyRotation,
  RetainedKeyringError,
  type RetainedKeyringManifest,
  retireRetainedKeyVersion,
  stageRetainedKeyRotation,
} from "./retained-document-keyring.js";

const currentKeyId = "00000000-0000-4000-8000-000000000021";
const nextKeyId = "00000000-0000-4000-8000-000000000022";
const retiredKeyId = "00000000-0000-4000-8000-000000000020";
const at = "2026-09-27T12:00:00.000Z";
const manifest: RetainedKeyringManifest = {
  format: "IDA_RETAINED_KEYRING_V1",
  currentKeyId,
  versions: [{ keyId: currentKeyId, status: "ACTIVE", createdAt: at }],
};

describe("retained vault key rotation protocol", () => {
  it("stages without changing the active key and is resumable while old rows remain", () => {
    const staged = stageRetainedKeyRotation(manifest, nextKeyId, at);
    expect(staged.currentKeyId).toBe(currentKeyId);
    expect(
      planRetainedKeyRotation(
        staged,
        new Map([
          [currentKeyId, 2],
          [nextKeyId, 1],
        ]),
      ),
    ).toEqual({
      fromKeyId: currentKeyId,
      toKeyId: nextKeyId,
      rowsRemaining: 2,
      canActivate: false,
    });
    expect(() =>
      completeRetainedKeyRotation(
        staged,
        new Map([
          [currentKeyId, 1],
          [nextKeyId, 0],
        ]),
      ),
    ).toThrowError(new RetainedKeyringError("ROTATION_REFERENCES_REMAIN"));
  });

  it("activates only after old-key reference count reaches zero", () => {
    const staged = stageRetainedKeyRotation(manifest, nextKeyId, at);
    const activated = completeRetainedKeyRotation(
      staged,
      new Map([
        [currentKeyId, 0],
        [nextKeyId, 3],
      ]),
    );
    expect(activated.currentKeyId).toBe(nextKeyId);
    expect(activated.versions).toEqual([
      { keyId: currentKeyId, status: "RETIRED", createdAt: at },
      { keyId: nextKeyId, status: "ACTIVE", createdAt: at },
    ]);
  });

  it("retains old keys until a verified backup exists and no rows use them", () => {
    const staged = stageRetainedKeyRotation(manifest, nextKeyId, at);
    const activated = completeRetainedKeyRotation(
      staged,
      new Map([
        [currentKeyId, 0],
        [nextKeyId, 1],
      ]),
    );
    expect(() =>
      retireRetainedKeyVersion(
        activated,
        currentKeyId,
        new Map([
          [currentKeyId, 0],
          [nextKeyId, 1],
        ]),
        false,
      ),
    ).toThrowError(new RetainedKeyringError("VERIFIED_BACKUP_REQUIRED"));
    expect(() =>
      retireRetainedKeyVersion(
        activated,
        currentKeyId,
        new Map([
          [currentKeyId, 1],
          [nextKeyId, 1],
        ]),
        true,
      ),
    ).toThrowError(new RetainedKeyringError("KEY_REFERENCES_REMAIN"));
    expect(
      retireRetainedKeyVersion(
        activated,
        currentKeyId,
        new Map([
          [currentKeyId, 0],
          [nextKeyId, 1],
        ]),
        true,
      ).versions,
    ).toEqual([{ keyId: nextKeyId, status: "ACTIVE", createdAt: at }]);
  });

  it("fails closed for malformed manifests, duplicate rotations, and unknown references", () => {
    expect(() => stageRetainedKeyRotation({ ...manifest, currentKeyId: nextKeyId }, nextKeyId, at)).toThrowError(
      new RetainedKeyringError("KEYRING_INVALID"),
    );
    const staged = stageRetainedKeyRotation(manifest, nextKeyId, at);
    expect(() => stageRetainedKeyRotation(staged, retiredKeyId, at)).toThrowError(
      new RetainedKeyringError("ROTATION_ALREADY_STAGED"),
    );
    expect(() => planRetainedKeyRotation(staged, new Map([[retiredKeyId, 1]]))).toThrowError(
      new RetainedKeyringError("KEYRING_INVALID"),
    );
    expect(() => planRetainedKeyRotation(staged, new Map([[currentKeyId, 0]]))).toThrowError(
      new RetainedKeyringError("KEYRING_INVALID"),
    );
    expect(() =>
      planRetainedKeyRotation(
        staged,
        new Map([
          [currentKeyId, 0],
          [nextKeyId, 0],
        ]),
      ),
    ).not.toThrow();
    expect(() => planRetainedKeyRotation(manifest, new Map([[currentKeyId, 0]]))).toThrowError(
      new RetainedKeyringError("ROTATION_NOT_STAGED"),
    );
  });
});
