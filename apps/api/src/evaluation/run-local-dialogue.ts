import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { intelligenceTextSchema } from "@ida/contracts/intelligence";
import { createApp } from "../app.js";
import { localPilot } from "./local-model-pin.js";

export const localDialogueSmokeFlag = "--run-synthetic-local-dialogue";
export const localDialogueSmokePrompt = "Réponds uniquement par IDA_LOCAL_OK, sans autre texte.";

type SmokeFailure =
  | "SYNTHETIC_OPT_IN_REQUIRED"
  | "LOCAL_ONLY_ATTESTATION_REQUIRED"
  | "AUTH_BOUNDARY_FAILED"
  | "SYNTHETIC_SETUP_FAILED"
  | "LOCAL_MODEL_NOT_READY"
  | "LOCAL_REPLY_FAILED"
  | "LOCAL_RESPONSE_INVALID"
  | "SESSION_REVOCATION_FAILED";

export class LocalDialogueSmokeError extends Error {
  constructor(readonly code: SmokeFailure) {
    super(code);
  }
}

/**
 * One synthetic request through the real HTTP/session/Core composition. No listen(),
 * existing database, user credential, cloud binding or automatic runtime startup.
 * The route keeps its conservative SENSITIVE_PERSONAL classification unchanged;
 * only this fixed, public synthetic sentence is sent to the model.
 */
export async function runLocalDialogueSmoke(args: readonly string[]) {
  if (args.length !== 1 || args[0] !== localDialogueSmokeFlag)
    throw new LocalDialogueSmokeError("SYNTHETIC_OPT_IN_REQUIRED");
  // Deployment attestation, not a technical detection of the daemon's egress.
  if (process.env.OLLAMA_NO_CLOUD !== "1") throw new LocalDialogueSmokeError("LOCAL_ONLY_ATTESTATION_REQUIRED");

  const started = Date.now();
  const app = await createApp({
    dataDir: "memory://",
    // No media route is invoked; never inherit the real user's storage directory.
    storageDir: "memory://",
    identityMode: "LOCAL_LOCK",
    localDialogueEnabled: true,
    weatherEnabled: false,
  });
  let cookie = "";
  try {
    const anonymous = await app.inject({
      method: "POST",
      url: "/v1/intelligence/local/reply",
      payload: { prompt: localDialogueSmokePrompt },
    });
    if (anonymous.statusCode !== 401) throw new LocalDialogueSmokeError("AUTH_BOUNDARY_FAILED");

    const setup = await app.inject({
      method: "POST",
      url: "/v1/auth/setup",
      payload: { passphrase: randomBytes(32).toString("base64url") },
    });
    if (setup.statusCode !== 201) throw new LocalDialogueSmokeError("SYNTHETIC_SETUP_FAILED");
    const setCookie = setup.headers["set-cookie"];
    cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";", 1)[0] ?? "";
    if (!cookie) throw new LocalDialogueSmokeError("SYNTHETIC_SETUP_FAILED");

    const status = await app.inject({
      method: "GET",
      url: "/v1/intelligence/local/status",
      headers: { cookie },
    });
    const state = status.json().data;
    if (status.statusCode !== 200 || state?.state !== "READY" || state?.model !== localPilot.name)
      throw new LocalDialogueSmokeError("LOCAL_MODEL_NOT_READY");

    // Exactly one authenticated generation request. Never retry or substitute a response.
    const response = await app.inject({
      method: "POST",
      url: "/v1/intelligence/local/reply",
      headers: { cookie },
      payload: { prompt: localDialogueSmokePrompt },
    });
    if (response.statusCode !== 200) throw new LocalDialogueSmokeError("LOCAL_REPLY_FAILED");
    const data = response.json().data;
    if (
      !data ||
      !intelligenceTextSchema.safeParse({ text: data.text }).success ||
      data.provider !== "ollama" ||
      data.model !== localPilot.name ||
      data.locality !== "LOCAL" ||
      data.experimental !== true
    )
      throw new LocalDialogueSmokeError("LOCAL_RESPONSE_INVALID");

    const lock = await app.inject({ method: "POST", url: "/v1/auth/lock", headers: { cookie } });
    const afterLock = await app.inject({ method: "GET", url: "/v1/intelligence/local/status", headers: { cookie } });
    if (lock.statusCode !== 204 || afterLock.statusCode !== 401)
      throw new LocalDialogueSmokeError("SESSION_REVOCATION_FAILED");
    cookie = "";
    return {
      type: "LOCAL_DIALOGUE_SYNTHETIC_SMOKE" as const,
      durationMs: Date.now() - started,
      model: localPilot.name,
      locality: "LOCAL" as const,
      anonymousRejected: true,
      authenticatedRouteSucceeded: true,
      sessionRevoked: true,
      generationRequests: 1,
      expectedMarkerMatched: data.text.trim() === "IDA_LOCAL_OK",
      browserValidated: false,
      userDataAccessed: false,
    };
  } finally {
    // Close the isolated authority even when inventory or generation failed.
    try {
      if (cookie) await app.inject({ method: "POST", url: "/v1/auth/lock", headers: { cookie } });
    } finally {
      await app.close();
    }
  }
}

// Imports and ordinary test discovery do not initialize a database or call Ollama.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLocalDialogueSmoke(process.argv.slice(2))
    .then((report) => {
      console.log(JSON.stringify(report)); // No prompt, response, cookie or passphrase.
      if (!report.expectedMarkerMatched) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          type: "LOCAL_DIALOGUE_SYNTHETIC_SMOKE_ERROR",
          code: error instanceof LocalDialogueSmokeError ? error.code : "UNEXPECTED_LOCAL_SMOKE_FAILURE",
        }),
      );
      process.exitCode = 1;
    });
}
