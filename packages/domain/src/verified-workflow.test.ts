import { describe, expect, it } from "vitest";
import { ToolGateway } from "./tool-policy.js";
import {
  type WorkflowCheckpoint,
  type WorkflowCheckpointStore,
  type WorkflowDefinition,
  WorkflowFailure,
  runVerifiedWorkflow,
} from "./verified-workflow.js";

function syntheticStore<State>(): WorkflowCheckpointStore<State> {
  let row: WorkflowCheckpoint<State> | undefined;
  return {
    async load(workspaceId, runId) {
      return row?.workspaceId === workspaceId && row.runId === runId ? structuredClone(row) : undefined;
    },
    async compareAndSave(next, expectedRevision) {
      if (expectedRevision === null ? row !== undefined : row?.revision !== expectedRevision) return false;
      row = structuredClone(next);
      return true;
    },
  };
}

const auth = async () => undefined;
const base = { runId: "synthetic-run", workspaceId: "synthetic-workspace", authorize: auth };
type Growth = {
  prospectId: string;
  absentSources: string[];
  foundSite: boolean;
  humanVerified: boolean;
  result: string;
};

function growthGraph(): WorkflowDefinition<Growth> {
  return {
    key: "growth-no-site-synthetic",
    version: "1",
    startNode: "check_evidence",
    maxSteps: 4,
    timeoutMs: 2_000,
    nodes: [
      {
        id: "check_evidence",
        edges: ["human_review"],
        async execute(state) {
          if (state.foundSite) return { kind: "COMPLETE", state: { ...state, result: "SITE_PRESENT" } };
          if (new Set(state.absentSources).size < 2) {
            return { kind: "PAUSE", reason: "EVIDENCE_INSUFFICIENT", state };
          }
          return { kind: "NEXT", to: "human_review", state };
        },
      },
      {
        id: "human_review",
        edges: [],
        async execute(state) {
          if (!state.humanVerified) return { kind: "PAUSE", reason: "MANUAL_VALIDATION_REQUIRED", state };
          return { kind: "COMPLETE", state: { ...state, result: "VERIFIED_ABSENT" } };
        },
      },
    ],
  };
}

type Fabrique = {
  projectId: string;
  testsPassed: boolean;
  screenshots: string[];
  ownerApproved: boolean;
  state: string;
};

function fabriqueGraph(): WorkflowDefinition<Fabrique> {
  return {
    key: "fabrique-review-synthetic",
    version: "1",
    startNode: "technical_gate",
    maxSteps: 4,
    timeoutMs: 2_000,
    nodes: [
      {
        id: "technical_gate",
        edges: ["visual_gate"],
        async execute(state) {
          return state.testsPassed
            ? { kind: "NEXT", to: "visual_gate", state }
            : { kind: "PAUSE", reason: "TESTS_FAILED", state };
        },
      },
      {
        id: "visual_gate",
        edges: [],
        async execute(state) {
          if (!state.screenshots.includes("desktop") || !state.screenshots.includes("mobile")) {
            return { kind: "PAUSE", reason: "VISUAL_EVIDENCE_MISSING", state };
          }
          if (!state.ownerApproved) return { kind: "PAUSE", reason: "OWNER_APPROVAL_REQUIRED", state };
          return { kind: "COMPLETE", state: { ...state, state: "READY_FOR_REVIEWED_HANDOFF" } };
        },
      },
    ],
  };
}

describe("Verified workflow — synthetic end-to-end graph scenarios", () => {
  it("Growth: never qualifies a no-site prospect from search failures alone", async () => {
    const store = syntheticStore<Growth>();
    const result = await runVerifiedWorkflow(growthGraph(), store, {
      ...base,
      initialState: {
        prospectId: "fictional-1",
        absentSources: ["directory", "search"],
        foundSite: false,
        humanVerified: false,
        result: "UNKNOWN",
      },
    });
    expect(result.status).toBe("PAUSED");
    expect(result.reason).toBe("MANUAL_VALIDATION_REQUIRED");
    expect(result.state.result).toBe("UNKNOWN");
    expect(result.steps).toBe(2);
  });

  it("Growth: synthetic evidence plus prior human validation can complete without outreach", async () => {
    const store = syntheticStore<Growth>();
    const result = await runVerifiedWorkflow(growthGraph(), store, {
      ...base,
      initialState: {
        prospectId: "fictional-2",
        absentSources: ["directory", "search"],
        foundSite: false,
        humanVerified: true,
        result: "UNKNOWN",
      },
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.state.result).toBe("VERIFIED_ABSENT");
    const resumed = await runVerifiedWorkflow(growthGraph(), store, {
      ...base,
      initialState: { ...result.state, result: "FORGED" },
    });
    expect(resumed).toEqual(result);
  });

  it("Growth: an actually found website takes precedence over negative evidence", async () => {
    const result = await runVerifiedWorkflow(growthGraph(), syntheticStore<Growth>(), {
      ...base,
      initialState: {
        prospectId: "fictional-3",
        absentSources: ["directory", "search"],
        foundSite: true,
        humanVerified: true,
        result: "UNKNOWN",
      },
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.state.result).toBe("SITE_PRESENT");
  });

  it("Fabrique: technical success without real visual evidence is not a delivered site", async () => {
    const result = await runVerifiedWorkflow(fabriqueGraph(), syntheticStore<Fabrique>(), {
      ...base,
      initialState: {
        projectId: "fictional-site",
        testsPassed: true,
        screenshots: [],
        ownerApproved: true,
        state: "PENDING",
      },
    });
    expect(result.status).toBe("PAUSED");
    expect(result.reason).toBe("VISUAL_EVIDENCE_MISSING");
  });

  it("Fabrique: explicit visual evidence and review result in handoff, never deployment", async () => {
    const result = await runVerifiedWorkflow(fabriqueGraph(), syntheticStore<Fabrique>(), {
      ...base,
      initialState: {
        projectId: "fictional-site",
        testsPassed: true,
        screenshots: ["desktop", "mobile"],
        ownerApproved: true,
        state: "PENDING",
      },
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.state.state).toBe("READY_FOR_REVIEWED_HANDOFF");
  });

  it("hard-stops cyclic graphs at the step limit without another invocation", async () => {
    let invoked = 0;
    const graph: WorkflowDefinition<{ attempts: number }> = {
      key: "cycle",
      version: "1",
      startNode: "retry",
      maxSteps: 2,
      timeoutMs: 2_000,
      nodes: [
        {
          id: "retry",
          edges: ["retry"],
          async execute(state) {
            invoked++;
            return { kind: "NEXT", to: "retry", state: { attempts: state.attempts + 1 } };
          },
        },
      ],
    };
    const result = await runVerifiedWorkflow(graph, syntheticStore(), { ...base, initialState: { attempts: 0 } });
    expect(result.status).toBe("PAUSED");
    expect(result.reason).toBe("STEP_LIMIT");
    expect(result.state.attempts).toBe(2);
    expect(invoked).toBe(2);
  });

  it("uses the existing ToolGateway and refuses an unlisted write before execution", async () => {
    const gateway = new ToolGateway(undefined, [{ toolKey: "check_evidence", moduleKey: "IDA", permission: "READ" }]);
    let invoked = 0;
    const graph: WorkflowDefinition<{}> = {
      key: "policy",
      version: "1",
      startNode: "blocked",
      maxSteps: 2,
      timeoutMs: 2_000,
      nodes: [{ id: "blocked", edges: [], async execute(state) { invoked++; return { kind: "COMPLETE", state }; } }],
    };
    const store = syntheticStore<{}>();
    await expect(
      runVerifiedWorkflow(graph, store, {
        ...base,
        initialState: {},
        authorize: async () => {
          gateway.assertAuthorized({ toolKey: "send_email", moduleKey: "IDA", permission: "WRITE" });
        },
      }),
    ).rejects.toThrow("n’est pas autorisé");
    expect(invoked).toBe(0);
    expect((await store.load(base.workspaceId, base.runId))?.status).toBe("READY");
  });

  it("does not replay an ambiguous or failed IN_FLIGHT step after restarting", async () => {
    let invocations = 0;
    const graph: WorkflowDefinition<{ done: boolean }> = {
      key: "ambiguous",
      version: "1",
      startNode: "outside",
      maxSteps: 2,
      timeoutMs: 2_000,
      nodes: [{
        id: "outside",
        edges: [],
        async execute() {
          invocations++;
          throw new Error("UNKNOWN_REMOTE_OUTCOME");
        },
      }],
    };
    const store = syntheticStore<{ done: boolean }>();
    await expect(runVerifiedWorkflow(graph, store, { ...base, initialState: { done: false } })).rejects.toThrow(
      "UNKNOWN_REMOTE_OUTCOME",
    );
    expect((await store.load(base.workspaceId, base.runId))?.status).toBe("IN_FLIGHT");
    const secondCall = await runVerifiedWorkflow(graph, store, { ...base, initialState: { done: false } });
    expect(secondCall.status).toBe("IN_FLIGHT");
    expect(invocations).toBe(1);
  });

  it("blocks undeclared transitions and preserves the uncertain checkpoint", async () => {
    const graph: WorkflowDefinition<{}> = {
      key: "invalid",
      version: "1",
      startNode: "a",
      maxSteps: 2,
      timeoutMs: 2_000,
      nodes: [{
        id: "a",
        edges: [],
        async execute(state) {
          return { kind: "NEXT", to: "outside", state };
        },
      }],
    };
    const store = syntheticStore<{}>();
    await expect(runVerifiedWorkflow(graph, store, { ...base, initialState: {} })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    } satisfies Partial<WorkflowFailure>);
    expect((await store.load(base.workspaceId, base.runId))?.status).toBe("IN_FLIGHT");
  });

  it("rejects version drift rather than resuming the wrong graph", async () => {
    const store = syntheticStore<Growth>();
    const graph = growthGraph();
    await runVerifiedWorkflow(graph, store, {
      ...base,
      initialState: {
        prospectId: "fictional-4",
        absentSources: [],
        foundSite: false,
        humanVerified: false,
        result: "UNKNOWN",
      },
    });
    await expect(
      runVerifiedWorkflow({ ...graph, version: "2" }, store, {
        ...base,
        initialState: {
          prospectId: "fictional-4",
          absentSources: [],
          foundSite: false,
          humanVerified: false,
          result: "UNKNOWN",
        },
      }),
    ).rejects.toMatchObject({ code: "WORKFLOW_MISMATCH" });
  });
});
