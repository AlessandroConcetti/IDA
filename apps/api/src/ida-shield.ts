/**
 * IDA Shield — conservative, dependency-free HTTP request guard.
 * This module is deliberately NOT an edge DDoS absorber.
 * Call from a trusted server ingress only; never trust user-supplied forwarding headers.
 */
export type ShieldDecision = { allowed: true; reason: "ok" } | { allowed: false; reason: "unknown_host" | "method_denied" | "body_too_large" | "rate_limited"; retryAfterSeconds?: number };
export type ShieldPolicy = {
  allowedHosts: readonly string[];
  maxBodyBytes: number;
  allowedMethods: readonly string[];
  windowMs: number;
  maxRequests: number;
};
export type ShieldRequest = {
  host: string;
  method: string;
  bodyBytes?: number;
  /** Identity from authenticated server context, or verified client IP from a trusted proxy. */
  trustedIdentity: string;
  nowMs: number;
};
export interface ShieldCounter {
  /** Atomic increment + expiration, shared across all gateway instances. */
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}
export const DEFAULT_SHIELD_POLICY: ShieldPolicy = {
  allowedHosts: [],
  maxBodyBytes: 1024 * 1024,
  allowedMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  windowMs: 60_000,
  maxRequests: 120,
};
export function normalizeShieldHost(value: string): string | null {
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(host) || host.includes("..") || host.startsWith(".") || host.endsWith(".")) return null;
  return host;
}
export async function evaluateShieldRequest(
  request: ShieldRequest,
  policy: ShieldPolicy,
  counter: ShieldCounter,
): Promise<ShieldDecision> {
  const host = normalizeShieldHost(request.host);
  if (!host || !policy.allowedHosts.includes(host)) return { allowed: false, reason: "unknown_host" };
  if (!policy.allowedMethods.includes(request.method.toUpperCase())) return { allowed: false, reason: "method_denied" };
  if ((request.bodyBytes ?? 0) > policy.maxBodyBytes || (request.bodyBytes ?? 0) < 0) return { allowed: false, reason: "body_too_large" };
  if (!request.trustedIdentity || !Number.isFinite(request.nowMs) || policy.windowMs <= 0 || policy.maxRequests <= 0) {
    return { allowed: false, reason: "rate_limited", retryAfterSeconds: 1 };
  }
  const window = Math.floor(request.nowMs / policy.windowMs);
  // Hash identities before persistence in production. Never log this key.
  const key = [host, request.trustedIdentity, window].join(":");
  const { count, ttlMs } = await counter.increment(key, policy.windowMs);
  if (count > policy.maxRequests) return { allowed: false, reason: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
  return { allowed: true, reason: "ok" };
}
