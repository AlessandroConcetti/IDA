import { describe, expect, it } from "vitest";
import { clientAccessStatusResponseSchema } from "./identity.js";

describe("Contrat d'accès explicite au hub", () => {
  it("accepte uniquement les états cohérents sans credential", () => {
    for (const data of [
      { mode: "LOCAL_DEMO", state: "UNLOCKED" },
      { mode: "LOCAL_LOCK", state: "UNINITIALIZED" },
      { mode: "LOCAL_LOCK", state: "LOCKED" },
      { mode: "LOCAL_LOCK", state: "UNLOCKED", sessionExpiresAt: "2099-01-01T00:00:00.000Z" },
    ]) {
      expect(clientAccessStatusResponseSchema.parse({ data })).toEqual({ data });
      expect(clientAccessStatusResponseSchema.safeParse({ data: { ...data, token: "interdit" } }).success).toBe(false);
    }
  });
  it("refuse toute ouverture implicite, échéance ambiguë ou mode inconnu", () => {
    for (const data of [
      {},
      { mode: "LOCAL_DEMO", state: "LOCKED" },
      { mode: "UNKNOWN", state: "UNLOCKED" },
      { mode: "LOCAL_LOCK", state: "UNLOCKED" },
      { mode: "LOCAL_LOCK", state: "UNINITIALIZED", sessionExpiresAt: "2099-01-01T00:00:00.000Z" },
      { mode: "LOCAL_LOCK", state: "UNLOCKED", sessionExpiresAt: "invalid" },
      { mode: "LOCAL_LOCK", state: "LOCKED", sessionExpiresAt: "2099-01-01T00:00:00.000Z" },
    ]) {
      expect(clientAccessStatusResponseSchema.safeParse({ data }).success).toBe(false);
    }
  });
});
