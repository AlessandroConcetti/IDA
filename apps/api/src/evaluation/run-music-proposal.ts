import { fileURLToPath } from "node:url";
import { IntelligenceError } from "@ida/domain";
import { OllamaAdapter } from "../ai-adapters.js";
import { OllamaLoopbackTransport } from "../ollama-transport.js";
import { localPilot } from "./local-model-pin.js";
import { proposalPilotProviderKey, runMusicProposalScenarios } from "./music-proposal-scenario.js";

export async function runLocalMusicProposalEvaluation(args: string[]) {
  if (args.length !== 1 || args[0] !== "--run-synthetic-music-proposal") throw new IntelligenceError("FORBIDDEN");
  const controller = new AbortController();
  const stop = () => controller.abort();
  const deadline = setTimeout(stop, 8 * 60_000);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const transport = new OllamaLoopbackTransport({
    enabled: true,
    localOnlyDeploymentApproved: true,
    models: [{ name: localPilot.name, digest: localPilot.digest }],
    contextTokens: localPilot.contextTokens,
    timeoutMs: 120_000,
  });
  try {
    const models = await transport.inspectInstalledModels(controller.signal);
    if (
      !models.some(
        (model) =>
          model.name === localPilot.name && model.digest === localPilot.digest && model.size === localPilot.size,
      )
    )
      throw new IntelligenceError("NO_COMPATIBLE_MODEL");
    console.log(
      JSON.stringify({
        type: "SYNTHETIC_PROPOSAL_START",
        startedAt: new Date().toISOString(),
        model: localPilot,
        maxCalls: 3,
        maxOutputTokens: 256,
        sampling: "OLLAMA_MODEL_DEFAULTS_UNCHANGED",
        automaticProductionActivation: false,
      }),
    );
    return await runMusicProposalScenarios(
      new OllamaAdapter(proposalPilotProviderKey, transport),
      (event) => console.log(JSON.stringify(event)),
      controller.signal,
    );
  } finally {
    clearTimeout(deadline);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    transport.dispose();
  }
}

// Import sans effet réseau/processus/base. La CLI ne démarre pas Ollama et ne télécharge aucun modèle.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLocalMusicProposalEvaluation(process.argv.slice(2))
    .then((summary) => {
      if (
        summary.successfulRankings !== summary.total ||
        !summary.excludedDataAbsent ||
        !summary.businessUnchanged ||
        !summary.deterministicControls
      )
        process.exitCode = 1;
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          type: "PROPOSAL_EVALUATION_ERROR",
          code: error instanceof IntelligenceError ? error.code : "INVALID_RESPONSE",
        }),
      );
      process.exitCode = 1;
    });
}
