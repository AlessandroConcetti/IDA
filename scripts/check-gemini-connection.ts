import type { ClientRequest, IncomingMessage } from "node:http";
import { request } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { windowsIntelligenceSecret } from "../apps/api/src/connector-vault.js";
import { geminiTextModelId } from "../apps/api/src/gemini-adapter.js";

type State =
  | "INVALID_ARGUMENTS"
  | "KEY_MISSING"
  | "KEY_UNREADABLE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "REDIRECT_REJECTED"
  | "AUTH_REJECTED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "AUTHENTICATED";
type Report = {
  state: State;
  httpStatus: number | null;
  configuredModelId: string;
  modelPresent: boolean | null;
  generateContentSupported: boolean | null;
};
const MAX_BYTES = 64 * 1024;
const DEADLINE_MS = 10_000;
const report = (
  state: State,
  httpStatus: number | null = null,
  modelPresent: boolean | null = null,
  generateContentSupported: boolean | null = null,
): Report => ({ state, httpStatus, configuredModelId: geminiTextModelId, modelPresent, generateContentSupported });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Diagnostic opérateur explicite : métadonnées du modèle uniquement, aucune génération. */
export async function checkGeminiConnection(args: string[]): Promise<Report> {
  const workspaceFlag = args.indexOf("--workspace-id");
  const workspaceId = args[workspaceFlag + 1];
  if (
    args.length !== 3 ||
    !((workspaceFlag === 0 && args[2] === "--check-auth") || (workspaceFlag === 1 && args[0] === "--check-auth")) ||
    !workspaceId ||
    !/^wsp_[a-z0-9_]+$/iu.test(workspaceId)
  )
    return report("INVALID_ARGUMENTS");

  return new Promise((done) => {
    const controller = new AbortController();
    let req: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    let status: number | null = null;
    let settled = false;
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => finish("TIMEOUT"), DEADLINE_MS);
    function finish(state: State, modelPresent: boolean | null = null, supported: boolean | null = null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      chunks.length = 0;
      response?.destroy();
      req?.destroy();
      done(report(state, status, modelPresent, supported));
    }
    const invalid = () => finish("INVALID_RESPONSE");
    async function execute() {
      let token: string;
      try {
        const secret = windowsIntelligenceSecret(
          fileURLToPath(new URL("../.data/connector-secrets", import.meta.url)),
          workspaceId as string,
          "gemini",
        );
        if (!(await secret.available())) {
          finish("KEY_MISSING");
          return;
        }
        if (settled) return;
        token = await secret.resolve(controller.signal);
        if (settled) return;
        if (typeof token !== "string" || !/^[A-Za-z0-9._~-]{16,8192}$/u.test(token)) {
          finish("KEY_UNREADABLE");
          return;
        }
      } catch {
        finish("KEY_UNREADABLE");
        return;
      }
      try {
        req = request(
          {
            protocol: "https:",
            hostname: "generativelanguage.googleapis.com",
            port: 443,
            path: `/v1beta/models/${geminiTextModelId}`,
            method: "GET",
            agent: false,
            rejectUnauthorized: true,
            maxHeaderSize: 8192,
            headers: {
              accept: "application/json",
              "accept-encoding": "identity",
              connection: "close",
              "x-goog-api-key": token,
            },
          },
          (incoming) => {
            if (settled) {
              incoming.destroy();
              return;
            }
            response = incoming;
            const code = incoming.statusCode;
            status = code !== undefined && Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
            incoming.on("error", invalid);
            incoming.on("aborted", invalid);
            incoming.on("close", () => {
              if (!incoming.complete) invalid();
            });
            if (status !== 200) {
              finish(
                status === 401 || status === 403
                  ? "AUTH_REJECTED"
                  : status !== null && status >= 300 && status < 400
                    ? "REDIRECT_REJECTED"
                    : "HTTP_ERROR",
              );
              return;
            }
            const length = incoming.headers["content-length"];
            if (
              !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(incoming.headers["content-type"] ?? "") ||
              (incoming.headers["content-encoding"] !== undefined &&
                incoming.headers["content-encoding"] !== "identity") ||
              (length !== undefined && (!/^\d+$/u.test(length) || Number(length) > MAX_BYTES))
            ) {
              invalid();
              return;
            }
            let bytes = 0;
            incoming.on("data", (chunk: Buffer) => {
              if (settled) return;
              if (!Buffer.isBuffer(chunk) || bytes + chunk.length > MAX_BYTES) {
                invalid();
                return;
              }
              bytes += chunk.length;
              chunks.push(chunk);
            });
            incoming.on("end", () => {
              if (settled) return;
              try {
                if (!incoming.complete || (length !== undefined && Number(length) !== bytes)) {
                  invalid();
                  return;
                }
                const body: unknown = JSON.parse(
                  new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
                );
                if (
                  !record(body) ||
                  body.name !== `models/${geminiTextModelId}` ||
                  body.error != null ||
                  !Array.isArray(body.supportedGenerationMethods) ||
                  body.supportedGenerationMethods.length > 64 ||
                  !body.supportedGenerationMethods.every(
                    (method) => typeof method === "string" && method.length > 0 && method.length <= 128,
                  )
                ) {
                  invalid();
                  return;
                }
                finish("AUTHENTICATED", true, body.supportedGenerationMethods.includes("generateContent"));
              } catch {
                invalid();
              }
            });
          },
        );
        req.on("error", () => finish("NETWORK_ERROR"));
        req.on("upgrade", (_incoming, socket) => {
          socket.destroy();
          invalid();
        });
        req.end();
      } catch {
        finish("NETWORK_ERROR");
      }
    }
    void execute().catch(() => finish("NETWORK_ERROR"));
  });
}

export async function runGeminiConnectionCheck(args: string[]): Promise<number> {
  const result = await checkGeminiConnection(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.state === "AUTHENTICATED" && result.modelPresent === true && result.generateContentSupported === true
    ? 0
    : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runGeminiConnectionCheck(process.argv.slice(2));
}
