import { createHash, randomBytes } from "node:crypto";
import type { IntelligencePolicy, IntelligenceScope } from "@ida/contracts/intelligence";
import {
  agentManifests,
  createAgentRegistry,
  type IntelligenceAdapter,
  IntelligenceError,
  listEnvironmentBrainProfiles,
  ProviderRegistry,
  ToolGateway,
} from "@ida/domain";
import { intelligenceProposalTool } from "../core-intelligence.js";
import { DemoDatabase } from "../database.js";
import { createLocalMusicProposalService } from "../local-music-proposal.js";
import { musicProposalPromptVersion } from "../music-proposal.js";
import { localPilot } from "./local-model-pin.js";
import {
  excludedCanaries,
  musicProposalCases,
  musicProposalEvaluationVersion,
  scoreMusicProposal,
} from "./music-proposal-cases.js";

export const proposalPilotProviderKey = "ollama_proposal_evaluation";
export type ProposalPilotEvent =
  | { type: "CASE_START"; caseId: string }
  | {
      type: "CASE";
      caseId: string;
      elapsedMs: number;
      observedOrder: string[];
      referencesValid: boolean;
      factsPreserved: boolean;
      groupingCorrect: boolean;
      safeAnswer: boolean;
      providerAttempts: number;
      errorCode?: string;
    }
  | {
      type: "SUMMARY";
      suite: string;
      promptVersion: string;
      total: number;
      successfulRankings: number;
      providerAttempts: number;
      modelResponsesDelivered: number;
      excludedDataAbsent: boolean;
      businessUnchanged: boolean;
      deterministicControls: boolean;
      auditEvents: number;
      remainingCalls: number;
      promptHashes: string[];
      humanReviewRequired: true;
      automaticProductionActivation: false;
    };

/** Banc isolé : pas de chemin de base, texte, scope, URL ou clé fournis par l'appelant. */
export async function runMusicProposalScenarios(
  adapter: IntelligenceAdapter,
  report: (event: ProposalPilotEvent) => void,
  signal?: AbortSignal,
): Promise<Extract<ProposalPilotEvent, { type: "SUMMARY" }>> {
  if (adapter.providerKey !== proposalPilotProviderKey || adapter.locality !== "LOCAL")
    throw new IntelligenceError("FORBIDDEN");
  if (signal?.aborted) throw new IntelligenceError("CANCELLED");
  const database = await DemoDatabase.open({ dataDir: "memory://", seed: false });
  let providerAttempts = 0;
  let excludedDataAbsent = true;
  const promptHashes: string[] = [];
  try {
    const started = Date.now();
    const issuedAt = new Date(started - 1000).toISOString();
    const expiresAt = new Date(started + 8 * 60_000).toISOString();
    await database.pglite.exec(`
      INSERT INTO users (id, email, display_name, timezone) VALUES ('eval_user', 'evaluation@example.invalid', 'Évaluation synthétique', 'UTC');
    `);
    const cases = musicProposalCases();
    const scopes = new Map<string, IntelligenceScope>();
    for (const fixture of cases) {
      const scope = {
        userId: "eval_user",
        workspaceId: `eval_${fixture.id}`,
        clientInstanceId: `client_${fixture.id}`,
        sessionId: `session_${fixture.id}`,
      };
      scopes.set(fixture.id, scope);
      await database.pglite.query(
        "INSERT INTO client_instances (id, user_id, display_name, kind, platform, status) VALUES ($1, 'eval_user', 'Banc synthétique', 'NATIVE_DESKTOP', 'WINDOWS', 'ACTIVE')",
        [scope.clientInstanceId],
      );
      await database.pglite.query(
        "INSERT INTO workspaces (id, name, timezone, locale, owner_user_id) VALUES ($1, 'Banc synthétique', 'UTC', 'fr-FR', $2)",
        [scope.workspaceId, scope.userId],
      );
      await database.pglite.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')", [
        scope.workspaceId,
        scope.userId,
      ]);
      await database.pglite.query(
        "INSERT INTO client_workspace_grants (client_instance_id, user_id, workspace_id, access_level, granted_by) VALUES ($1, $2, $3, 'VIEW_ONLY', $2)",
        [scope.clientInstanceId, scope.userId, scope.workspaceId],
      );
      if (
        !(await database.createLocalAuthSession({
          ...scope,
          tokenDigest: randomBytes(32).toString("hex"),
          issuedAt,
          expiresAt,
          idleExpiresAt: expiresAt,
        }))
      )
        throw new IntelligenceError("FORBIDDEN");
      await database.pglite.query(
        "INSERT INTO artist_projects (id, workspace_id, name, status) VALUES ($1, $1, 'Projet synthétique', 'ACTIVE')",
        [scope.workspaceId],
      );
      for (const track of fixture.tracks)
        await database.pglite.query(
          `INSERT INTO tracks (id, workspace_id, artist_project_id, title, artist_credit, status, description, updated_at)
         VALUES ($1, $2, $2, $3, $4, 'UNRELEASED', $5, '2026-09-08T10:00:00Z')`,
          [track.id, scope.workspaceId, track.title, track.artistCredit, excludedCanaries[0]],
        );
    }
    // Workspace sans membership : son titre ne doit jamais entrer dans les prompts.
    await database.pglite.exec(`
      INSERT INTO workspaces (id, name, timezone, locale, owner_user_id) VALUES ('eval_foreign', 'Étranger synthétique', 'UTC', 'fr-FR', 'eval_user');
      INSERT INTO artist_projects (id, workspace_id, name, status) VALUES ('eval_foreign', 'eval_foreign', 'Étranger synthétique', 'ACTIVE');
    `);
    await database.pglite.query(
      "INSERT INTO tracks (id, workspace_id, artist_project_id, title, artist_credit, status) VALUES ('foreign', 'eval_foreign', 'eval_foreign', $1, 'Fictif', 'UNRELEASED')",
      [excludedCanaries[1]],
    );
    const profile = listEnvironmentBrainProfiles().find((entry) => entry.environmentKey === "music");
    if (!profile) throw new IntelligenceError("CONFIGURATION_INVALID");
    profile.status = "ACTIVE";
    profile.agentKeys = ["agent_music_librarian"];
    profile.modelPolicy.allowedModels = [{ providerKey: proposalPilotProviderKey, modelId: localPilot.name }];
    const agents = createAgentRegistry(
      agentManifests.map((entry) => ({
        ...entry,
        status: entry.key === "agent_music_librarian" ? "ACTIVE" : "PLANNED",
        ...(entry.key === "agent_music_librarian"
          ? {
              promptVersion: musicProposalPromptVersion,
              evaluationSuite: musicProposalEvaluationVersion,
              outputContract: "music-proposal.v1",
            }
          : {}),
        allowedTools: [...entry.allowedTools],
        contextSources: [...entry.contextSources],
        supportedIntents: [...entry.supportedIntents],
      })),
    );
    const gateway = new ToolGateway(undefined, [
      intelligenceProposalTool,
      { toolKey: "list_tracks", moduleKey: "MUSIC", permission: "READ" },
      { toolKey: "search_media", moduleKey: "CONTENT", permission: "READ" },
    ]);
    const registry = new ProviderRegistry([
      {
        manifest: {
          key: proposalPilotProviderKey,
          version: "0.1.0",
          category: "LLM",
          locality: "LOCAL",
          retention: "LOCAL_ONLY",
          acceptedDataClasses: ["PRIVATE_CREATIVE"],
          models: [
            {
              id: localPilot.name,
              capabilities: ["TEXT"],
              maxComplexity: 1,
              maxInputChars: 5000,
              maxOutputTokens: 256,
              estimatedCostMicros: 0,
              estimatedLatencyMs: 90_000,
            },
          ],
        },
        adapter: {
          providerKey: proposalPilotProviderKey,
          locality: "LOCAL",
          async generate(input) {
            if (
              providerAttempts >= 3 ||
              input.modelId !== localPilot.name ||
              input.maxOutputTokens !== 256 ||
              input.prompt.length > 5000 ||
              !input.prompt.startsWith(`IDA / ${musicProposalPromptVersion}\n`)
            )
              throw new IntelligenceError("FORBIDDEN");
            if (excludedCanaries.some((text) => input.prompt.includes(text))) {
              excludedDataAbsent = false;
              throw new IntelligenceError("FORBIDDEN");
            }
            // Compte l'appel d'adaptateur ; son inventaire peut encore échouer avant le POST d'inférence.
            providerAttempts++;
            // Hashes autorisés ici seulement car les fixtures sont fixes et entièrement fictives.
            promptHashes.push(createHash("sha256").update(input.prompt).digest("hex"));
            return adapter.generate(input);
          },
        },
      },
    ]);
    registry.configure(proposalPilotProviderKey, {
      enabled: true,
      configured: true,
      availability: "READY",
      remainingCalls: 3,
      validUntil: expiresAt,
    });
    const policy: IntelligencePolicy = {
      mode: "AI",
      allowedProviderKeys: [proposalPilotProviderKey],
      allowedLocalities: ["LOCAL"],
      allowedModels: profile.modelPolicy.allowedModels,
      localFirst: true,
      maxAttempts: 1,
      maxCostMicros: 0,
      maxLatencyMs: 120_000,
      cloudConsents: [],
    };
    const snapshotBusiness = async () =>
      JSON.stringify(
        (
          await database.pglite.query(`SELECT
      (SELECT json_agg(t ORDER BY id) FROM tracks t) AS tracks,
      (SELECT json_agg(p ORDER BY id) FROM posts p) AS posts,
      (SELECT json_agg(m ORDER BY id) FROM memories m) AS memories,
      (SELECT json_agg(a ORDER BY id) FROM activity_logs a) AS activity`)
        ).rows,
      );
    const before = await snapshotBusiness();
    let successfulRankings = 0;
    let modelResponsesDelivered = 0;
    let deterministicControls = true;
    for (const fixture of cases) {
      if (signal?.aborted) throw new IntelligenceError("CANCELLED");
      const scope = scopes.get(fixture.id);
      if (!scope) throw new IntelligenceError("INVALID_REQUEST");
      const service = createLocalMusicProposalService({
        database,
        authenticatedScope: scope,
        registry,
        agents,
        gateway,
        profileVersion: profile.version,
        getProfile: () => structuredClone(profile),
        getPolicy: () => structuredClone(policy),
      });
      // Même composition, cas vides/uniques/médias sans inférence, pas comptés comme qualité LLM.
      const callsBefore = providerAttempts;
      const empty = await service.propose(scope, { intent: "SEARCH_TRACK", title: "ABSENT_SYNTHETIC_5176" }, signal);
      const single = await service.propose(scope, { intent: "SEARCH_TRACK", limit: 1 }, signal);
      const media = await service.propose(scope, { intent: "SEARCH_MEDIA" }, signal);
      deterministicControls &&=
        empty.status === "NOT_FOUND" &&
        single.ordering === "CATALOG_ORDER" &&
        single.facts.tracks.length === 1 &&
        media.status === "NOT_FOUND" &&
        callsBefore === providerAttempts;
      report({ type: "CASE_START", caseId: fixture.id });
      const caseStart = performance.now();
      try {
        const result = await service.propose(scope, { intent: "SEARCH_TRACK", limit: 10 }, signal);
        const score = scoreMusicProposal(fixture.id, result);
        modelResponsesDelivered++;
        if (Object.values(score).every(Boolean)) successfulRankings++;
        report({
          type: "CASE",
          caseId: fixture.id,
          elapsedMs: Math.round(performance.now() - caseStart),
          observedOrder: result.facts.tracks.map((row) => row.id),
          ...score,
          providerAttempts: providerAttempts - callsBefore,
        });
      } catch (error) {
        if (signal?.aborted) throw new IntelligenceError("CANCELLED");
        report({
          type: "CASE",
          caseId: fixture.id,
          elapsedMs: Math.round(performance.now() - caseStart),
          observedOrder: [],
          referencesValid: false,
          factsPreserved: false,
          groupingCorrect: false,
          safeAnswer: false,
          providerAttempts: providerAttempts - callsBefore,
          errorCode: error instanceof IntelligenceError ? error.code : "INVALID_RESPONSE",
        });
      }
    }
    const audit = (await database.pglite.query("SELECT * FROM intelligence_audit_events ORDER BY id")).rows;
    excludedDataAbsent &&= !excludedCanaries.some((canary) => JSON.stringify(audit).includes(canary));
    const summary: Extract<ProposalPilotEvent, { type: "SUMMARY" }> = {
      type: "SUMMARY",
      suite: musicProposalEvaluationVersion,
      promptVersion: musicProposalPromptVersion,
      total: cases.length,
      successfulRankings,
      providerAttempts,
      modelResponsesDelivered,
      excludedDataAbsent,
      businessUnchanged: before === (await snapshotBusiness()),
      deterministicControls,
      auditEvents: audit.length,
      remainingCalls: registry.list()[0]?.state.remainingCalls ?? 0,
      promptHashes,
      humanReviewRequired: true,
      automaticProductionActivation: false,
    };
    report(summary);
    return summary;
  } finally {
    await database.close();
  }
}
