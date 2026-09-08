import { fileURLToPath } from "node:url";
import type { IntelligencePolicy } from "@ida/contracts/intelligence";
import {
  type IntelligenceAudit,
  IntelligenceError,
  ProviderRegistry,
  ProviderRouter,
  sameIntelligenceScope,
} from "@ida/domain";
import { OllamaAdapter } from "../ai-adapters.js";
import { OllamaLoopbackTransport } from "../ollama-transport.js";
import {
  musicEvaluationCases,
  musicEvaluationPromptVersion,
  musicEvaluationScope,
  musicEvaluationVersion,
  runMusicEvaluation,
} from "./music-librarian.js";

/** Pin revu manuellement : ne jamais remplacer automatiquement par le résultat de /tags. */
export const localPilot = Object.freeze({
  name: "qwen3:4b-instruct-2507-q4_K_M",
  digest: "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0",
  size: 2497293803,
  contextTokens: 4096,
});

export async function runLocalModelEvaluation(args: string[]): Promise<void> {
  if (args.length !== 1 || args[0] !== "--run-synthetic-local-evaluation") {
    throw new IntelligenceError("FORBIDDEN");
  }
  // Instance de laboratoire indépendante des réglages, agents et données de la démo.
  const transport = new OllamaLoopbackTransport({
    enabled: true,
    localOnlyDeploymentApproved: true,
    models: [{ name: localPilot.name, digest: localPilot.digest }],
    contextTokens: localPilot.contextTokens,
    timeoutMs: 120_000,
  });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const suiteDeadline = setTimeout(stop, 8 * 60_000);
  try {
    const inventory = await transport.inspectInstalledModels(controller.signal);
    if (
      !inventory.some(
        (model) =>
          model.name === localPilot.name && model.digest === localPilot.digest && model.size === localPilot.size,
      )
    ) {
      throw new IntelligenceError("NO_COMPATIBLE_MODEL");
    }
    const registry = new ProviderRegistry([
      {
        manifest: {
          key: "ollama_evaluation",
          version: "0.1.0",
          category: "LLM",
          locality: "LOCAL",
          retention: "LOCAL_ONLY",
          acceptedDataClasses: ["PUBLIC"],
          models: [
            {
              id: localPilot.name,
              capabilities: ["TEXT"],
              maxComplexity: 1,
              maxInputChars: 5000,
              maxOutputTokens: 512,
              estimatedCostMicros: 0,
              // Premiers appels à froid ~59 s ; marge sous le délai dur de 120 s.
              estimatedLatencyMs: 90_000,
            },
          ],
        },
        adapter: new OllamaAdapter("ollama_evaluation", transport),
      },
    ]);
    registry.configure("ollama_evaluation", {
      enabled: true,
      configured: true,
      availability: "READY",
      remainingCalls: 6,
      validUntil: new Date(Date.now() + 8 * 60_000).toISOString(),
    });
    const allowedPrompts = new Set(musicEvaluationCases().map((item) => item.prompt));
    const policy: IntelligencePolicy = {
      mode: "AI",
      localFirst: true,
      allowedProviderKeys: ["ollama_evaluation"],
      allowedLocalities: ["LOCAL"],
      allowedModels: [{ providerKey: "ollama_evaluation", modelId: localPilot.name }],
      maxAttempts: 1,
      maxCostMicros: 0,
      maxLatencyMs: 120_000,
      cloudConsents: [],
    };
    const audit: IntelligenceAudit[] = [];
    const intelligence = new ProviderRouter(
      registry,
      async (request) => {
        if (
          !sameIntelligenceScope(request.scope, musicEvaluationScope) ||
          !allowedPrompts.has(request.prompt) ||
          request.purpose !== "ASSISTANT_REPLY" ||
          request.maxOutputTokens !== 512 ||
          request.dataClasses.length !== 1 ||
          request.dataClasses[0] !== "PUBLIC"
        ) {
          throw new IntelligenceError("FORBIDDEN");
        }
        return policy;
      },
      async (event) => {
        audit.push(event);
      },
    );
    console.log(
      JSON.stringify({
        type: "SYNTHETIC_EVALUATION_START",
        suite: musicEvaluationVersion,
        promptVersion: musicEvaluationPromptVersion,
        model: localPilot,
        maxOutputTokens: 512,
        sampling: "OLLAMA_MODEL_DEFAULTS_UNCHANGED",
        startedAt: new Date().toISOString(),
        automaticProductionActivation: false,
      }),
    );
    const results = await runMusicEvaluation(
      intelligence,
      (result) => console.log(JSON.stringify({ type: "CASE", ...result })),
      controller.signal,
    );
    const passed = results.filter((item) => item.passed).length;
    console.log(
      JSON.stringify({
        type: "SUMMARY",
        automaticCriteriaPassed: passed,
        total: results.length,
        auditEvents: audit.length,
        remainingCalls: registry.list()[0]?.state.remainingCalls,
        humanReviewRequired: true,
        automaticProductionActivation: false,
      }),
    );
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    clearTimeout(suiteDeadline);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    transport.dispose();
  }
}

// Importer le module ne lance jamais de réseau, téléchargement ou modèle.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLocalModelEvaluation(process.argv.slice(2)).catch((error) => {
    console.error(
      JSON.stringify({
        type: "EVALUATION_ERROR",
        code: error instanceof IntelligenceError ? error.code : "INVALID_RESPONSE",
      }),
    );
    process.exitCode = 1;
  });
}
