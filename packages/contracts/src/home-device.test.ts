import { describe, expect, it } from "vitest";
import { homeDeviceStatusSchema } from "./home-device.js";

const legacy = { provider: "HOME_ASSISTANT", mode: "READ_ONLY_PILOT", state: "TLS_REQUIRED" };
const prerequisites = {
  configuration: "CONFIGURED",
  tls: "REQUIRED",
  target: "REQUIRED",
  credential: "MISSING",
  verification: "NOT_PERFORMED",
};

describe("Contrat du diagnostic Home Assistant", () => {
  it("accepte le statut antérieur et le diagnostic indépendant", () => {
    expect(homeDeviceStatusSchema.safeParse(legacy).success).toBe(true);
    expect(homeDeviceStatusSchema.safeParse({ ...legacy, prerequisites }).success).toBe(true);
  });
  it.each([
    { ...prerequisites, token: "synthetic" },
    { ...prerequisites, origin: "https://private.invalid" },
    { ...prerequisites, entityId: "light.private" },
    { ...prerequisites, verification: "VERIFIED" },
    { ...prerequisites, credential: "VALID" },
    { ...prerequisites, tls: undefined },
  ])("refuse données privées, preuve inventée et prérequis incomplets", (value) => {
    expect(homeDeviceStatusSchema.safeParse({ ...legacy, prerequisites: value }).success).toBe(false);
  });
});
