/**
 * Internal, fail-closed workflow runner. No provider, tool, HTTP route or agent is
 * activated by importing this module. The caller owns auth, tools and durable CAS.
 */
export type WorkflowDecision<State> =
  | { readonly kind: "NEXT"; readonly to: string; readonly state: State }
  | { readonly kind: "COMPLETE"; readonly state: State }
  | { readonly kind: "PAUSE"; readonly reason: string; readonly state: State };

export interface WorkflowNode<State> {
  readonly id: string;
  readonly edges: readonly string[];
  readonly execute: (
    state: Readonly<State>,
    context: { readonly signal: AbortSignal; readonly idempotencyKey: string },
  ) => Promise<WorkflowDecision<State>>;
}

export interface WorkflowDefinition<State> {
  readonly key: string;
  readonly version: string;
  readonly startNode: string;
  readonly maxSteps: number;
  readonly timeoutMs: number;
  readonly nodes: readonly WorkflowNode<State>[];
}

export type WorkflowStatus = "READY" | "IN_FLIGHT" | "PAUSED" | "SUCCEEDED";

export interface WorkflowCheckpoint<State> {
  readonly runId: string;
  readonly workspaceId: string;
  readonly workflowKey: string;
  readonly version: string;
  readonly nodeId: string | null;
  readonly state: State;
  readonly status: WorkflowStatus;
  readonly revision: number;
  readonly steps: number;
  readonly reason: string | null;
}

/**
 * compareAndSave MUST be atomic, reject concurrent writers, isolate by workspace,
 * and persist checkpoints durably. No production storage adapter is supplied.
 */
export interface WorkflowCheckpointStore<State> {
  load(workspaceId: string, runId: string): Promise<WorkflowCheckpoint<State> | undefined>;
  compareAndSave(checkpoint: WorkflowCheckpoint<State>, expectedRevision: number | null): Promise<boolean>;
}

export type WorkflowFailureCode =
  | "INVALID_GRAPH"
  | "CHECKPOINT_CONFLICT"
  | "WORKFLOW_MISMATCH"
  | "INVALID_TRANSITION"
  | "INTERRUPTED";

export class WorkflowFailure extends Error {
  constructor(readonly code: WorkflowFailureCode) {
    super(code);
    this.name = "WorkflowFailure";
  }
}

function validate<State>(definition: WorkflowDefinition<State>): Map<string, WorkflowNode<State>> {
  if (
    !definition.key ||
    !definition.version ||
    !Number.isSafeInteger(definition.maxSteps) ||
    definition.maxSteps < 1 ||
    definition.maxSteps > 100 ||
    !Number.isSafeInteger(definition.timeoutMs) ||
    definition.timeoutMs < 1 ||
    definition.timeoutMs > 600_000 ||
    definition.nodes.length < 1 ||
    definition.nodes.length > 40
  ) throw new WorkflowFailure("INVALID_GRAPH");
  const nodes = new Map<string, WorkflowNode<State>>();
  for (const node of definition.nodes) {
    if (!node.id || nodes.has(node.id) || typeof node.execute !== "function") {
      throw new WorkflowFailure("INVALID_GRAPH");
    }
    nodes.set(node.id, node);
  }
  if (!nodes.has(definition.startNode)) throw new WorkflowFailure("INVALID_GRAPH");
  for (const node of definition.nodes) {
    if (new Set(node.edges).size !== node.edges.length || node.edges.some((id) => !nodes.has(id))) {
      throw new WorkflowFailure("INVALID_GRAPH");
    }
  }
  return nodes;
}

export interface WorkflowRunOptions<State> {
  readonly runId: string;
  readonly workspaceId: string;
  readonly initialState: State;
  readonly signal?: AbortSignal;
  /** Re-read the real server identity and tool permissions for EACH step. */
  readonly authorize: (workspaceId: string, runId: string, nodeId: string) => Promise<void>;
}

/**
 * Resumes only READY checkpoints. IN_FLIGHT is deliberately never retried:
 * interrupted side effects require explicit human reconciliation.
 * PAUSED also requires an external, separately authorised transition.
 */
export async function runVerifiedWorkflow<State>(
  definition: WorkflowDefinition<State>,
  store: WorkflowCheckpointStore<State>,
  options: WorkflowRunOptions<State>,
): Promise<WorkflowCheckpoint<State>> {
  const nodes = validate(definition);
  if (!options.workspaceId || !options.runId || typeof options.authorize !== "function") {
    throw new WorkflowFailure("WORKFLOW_MISMATCH");
  }
  const deadlineSignal = AbortSignal.timeout(definition.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadlineSignal]) : deadlineSignal;
  let checkpoint = await store.load(options.workspaceId, options.runId);
  if (!checkpoint) {
    checkpoint = {
      runId: options.runId,
      workspaceId: options.workspaceId,
      workflowKey: definition.key,
      version: definition.version,
      nodeId: definition.startNode,
      state: structuredClone(options.initialState),
      status: "READY",
      revision: 1,
      steps: 0,
      reason: null,
    };
    if (!(await store.compareAndSave(checkpoint, null))) throw new WorkflowFailure("CHECKPOINT_CONFLICT");
  }
  if (
    checkpoint.runId !== options.runId ||
    checkpoint.workspaceId !== options.workspaceId ||
    checkpoint.workflowKey !== definition.key ||
    checkpoint.version !== definition.version ||
    !Number.isSafeInteger(checkpoint.steps) ||
    checkpoint.steps < 0 ||
    checkpoint.steps > definition.maxSteps ||
    !Number.isSafeInteger(checkpoint.revision) ||
    checkpoint.revision < 1
  ) throw new WorkflowFailure("WORKFLOW_MISMATCH");

  async function commit(next: WorkflowCheckpoint<State>): Promise<void> {
    if (!(await store.compareAndSave(next, checkpoint!.revision))) {
      throw new WorkflowFailure("CHECKPOINT_CONFLICT");
    }
    checkpoint = next;
  }

  while (checkpoint.status === "READY") {
    if (signal.aborted) throw new WorkflowFailure("INTERRUPTED");
    if (checkpoint.steps >= definition.maxSteps) {
      await commit({ ...checkpoint, status: "PAUSED", reason: "STEP_LIMIT", revision: checkpoint.revision + 1 });
      break;
    }
    const node = checkpoint.nodeId ? nodes.get(checkpoint.nodeId) : undefined;
    if (!node) throw new WorkflowFailure("WORKFLOW_MISMATCH");

    await options.authorize(options.workspaceId, options.runId, node.id);
    if (signal.aborted) throw new WorkflowFailure("INTERRUPTED");
    await commit({ ...checkpoint, status: "IN_FLIGHT", revision: checkpoint.revision + 1 });
    // Deliberately no catch/retry: failure leaves IN_FLIGHT for reconciliation.
    await options.authorize(options.workspaceId, options.runId, node.id);
    const decision = await node.execute(structuredClone(checkpoint.state), {
      signal,
      idempotencyKey: options.runId + ":" + String(checkpoint.steps + 1) + ":" + node.id,
    });
    if (signal.aborted) throw new WorkflowFailure("INTERRUPTED");
    await options.authorize(options.workspaceId, options.runId, node.id);
    if (
      !decision ||
      !["NEXT", "PAUSE", "COMPLETE"].includes(decision.kind) ||
      (decision.kind === "NEXT" && !node.edges.includes(decision.to)) ||
      (decision.kind === "PAUSE" && (!decision.reason || decision.reason.length > 160))
    ) throw new WorkflowFailure("INVALID_TRANSITION");
    const next = {
      ...checkpoint,
      state: structuredClone(decision.state),
      steps: checkpoint.steps + 1,
      revision: checkpoint.revision + 1,
      nodeId: decision.kind === "NEXT" ? decision.to : null,
      status: decision.kind === "NEXT" ? "READY" : decision.kind === "COMPLETE" ? "SUCCEEDED" : "PAUSED",
      reason: decision.kind === "PAUSE" ? decision.reason : null,
    } as WorkflowCheckpoint<State>;
    await commit(next);
  }
  return structuredClone(checkpoint);
}
