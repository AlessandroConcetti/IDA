import { describe, expect, it } from "vitest";
import { DEFAULT_SHIELD_POLICY, evaluateShieldRequest, normalizeShieldHost, type ShieldCounter } from "./ida-shield.js";

function counter(): ShieldCounter {
  const counts = new Map<string, number>();
  return {
    async increment(key, windowMs) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, ttlMs: windowMs };
    },
  };
}
const policy = { ...DEFAULT_SHIELD_POLICY, allowedHosts: ["idastudio.fr"], maxRequests: 2 };
const request = { host: "idastudio.fr", method: "GET", trustedIdentity: "verified-client", nowMs: 0 };

describe("IDA Shield policy", () => {
  it("normalizes case and rejects malformed hostnames", () => {
    expect(normalizeShieldHost("IDASTUDIO.FR")).toBe("idastudio.fr");
    expect(normalizeShieldHost("idastudio.fr.evil.example")).toBe("idastudio.fr.evil.example");
    expect(normalizeShieldHost("idastudio..fr")).toBeNull();
  });
  it("denies unknown hosts, disallowed methods and oversized bodies", async () => {
    const c = counter();
    expect(await evaluateShieldRequest({ ...request, host: "idastudio.fr.evil.example" }, policy, c)).toMatchObject({ allowed: false, reason: "unknown_host" });
    expect(await evaluateShieldRequest({ ...request, method: "TRACE" }, policy, c)).toMatchObject({ allowed: false, reason: "method_denied" });
    expect(await evaluateShieldRequest({ ...request, bodyBytes: policy.maxBodyBytes + 1 }, policy, c)).toMatchObject({ allowed: false, reason: "body_too_large" });
  });
  it("enforces limits per trusted identity and time window", async () => {
    const c = counter();
    expect((await evaluateShieldRequest(request, policy, c)).allowed).toBe(true);
    expect((await evaluateShieldRequest(request, policy, c)).allowed).toBe(true);
    expect(await evaluateShieldRequest(request, policy, c)).toMatchObject({ allowed: false, reason: "rate_limited" });
    expect((await evaluateShieldRequest({ ...request, nowMs: 60_000 }, policy, c)).allowed).toBe(true);
  });
  it("fails closed when the trusted identity is missing", async () => {
    expect(await evaluateShieldRequest({ ...request, trustedIdentity: "" }, policy, counter())).toMatchObject({ allowed: false, reason: "rate_limited" });
  });
});
