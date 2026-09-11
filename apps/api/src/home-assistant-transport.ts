import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { HomeAssistantReadTransport } from "./smart-home-read.js";

export type HomeAssistantTarget = Readonly<{ origin: string; address: string; entityId: string }>;
const entityPattern = /^light\.[a-z0-9_]{1,100}$/;

/** Pilote LAN IPv4 privé épinglé. Aucun DNS ni découverte du réseau. */
export function privateHomeAddress(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
export function homeAssistantTargetState(
  target: HomeAssistantTarget,
): "CONNECTION_REQUIRED" | "TLS_REQUIRED" | "TARGET_REQUIRED" | "VALID" {
  let url: URL;
  try {
    url = new URL(target.origin);
  } catch {
    return "CONNECTION_REQUIRED";
  }
  if (url.protocol !== "https:" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return "TLS_REQUIRED";
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !privateHomeAddress(target.address)
  )
    return "CONNECTION_REQUIRED";
  // Une URL IP ne peut pas désigner une autre IP que celle épinglée.
  if (isIP(url.hostname) && url.hostname !== target.address) return "CONNECTION_REQUIRED";
  if (!/^[a-z0-9.-]+$/i.test(url.hostname) || !entityPattern.test(target.entityId)) return "TARGET_REQUIRED";
  return "VALID";
}

/** Secret résolu uniquement à l'appel autorisé. Jamais dans URL, erreurs ou logs. */
export function createHomeAssistantHttpsTransport(
  config: HomeAssistantTarget,
  resolveSecret: (signal: AbortSignal) => Promise<string>,
): HomeAssistantReadTransport {
  const target = Object.freeze({ ...config });
  return {
    async getState(input) {
      if (
        homeAssistantTargetState(target) !== "VALID" ||
        input.method !== "GET" ||
        input.path !== `/api/states/${target.entityId}`
      )
        throw new Error("HOME_CONNECTION_NOT_READY");
      const signal = input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000);
      signal.throwIfAborted();
      let token: string;
      try {
        token = await resolveSecret(signal);
      } catch {
        throw new Error("HOME_SECRET_UNAVAILABLE");
      }
      signal.throwIfAborted();
      if (!/^[A-Za-z0-9._~-]{16,8192}$/.test(token)) throw new Error("HOME_SECRET_UNAVAILABLE");
      const url = new URL(target.origin);
      return await new Promise<unknown>((resolve, reject) => {
        const fail = () => reject(new Error("HOME_PROVIDER_UNAVAILABLE"));
        const request = httpsRequest(
          url,
          {
            method: "GET",
            path: input.path,
            signal,
            agent: false,
            family: 4,
            rejectUnauthorized: true,
            // L'identité TLS reste le hostname de l'URL, même lorsque l'IP est épinglée.
            lookup: (_hostname, _options, callback) => callback(null, target.address, 4),
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          },
          (response) => {
            if (
              response.statusCode !== 200 ||
              !/^application\/json(?:\s*;|$)/i.test(String(response.headers["content-type"] ?? ""))
            ) {
              response.destroy();
              fail();
              return;
            }
            let bytes = 0;
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 65_536) {
                chunks.length = 0;
                response.destroy();
                fail();
              } else chunks.push(chunk);
            });
            response.once("error", fail);
            response.once("aborted", fail);
            response.once("end", () => {
              try {
                signal.throwIfAborted();
                if (!response.complete) throw new Error("INCOMPLETE");
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
              } catch {
                fail();
              } finally {
                chunks.length = 0;
              }
            });
          },
        );
        request.once("error", fail);
        request.end();
      });
    },
  };
}
