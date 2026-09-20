import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestIdentityContext } from "@ida/contracts";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DemoDatabase } from "./database.js";
import * as adapter from "./mcp-adapter.js";
import { mcpReadFileTool, mcpSearchFilesTool, registerMcpTools } from "./mcp-tools.js";

const instances: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of instances.splice(0)) await app.close();
});

const identity = {
  workspaceId: "wsp_fixture",
  userId: "usr_fixture",
  session: { id: "ses_fixture" },
  clientInstance: { id: "cli_fixture" },
} as RequestIdentityContext;
const result = {
  tool: "READ_FILE_SCOPED" as const,
  untrusted: true as const,
  resourceId: "guide",
  text: "DOCUMENT_SYNTHETIQUE_NON_FIABLE",
};

async function fixture({ locked = true, configured = true, workspaceId = "wsp_fixture" } = {}) {
  const app = Fastify();
  instances.push(app);
  const audit = vi.fn().mockResolvedValue({ rows: [] });
  const authorize = vi.fn().mockReturnValue(identity);
  const revalidate = vi.fn().mockResolvedValue(undefined);
  const execute = vi.spyOn(adapter, "executeScopedMcp").mockResolvedValue(result);
  const binding = {
    workspaceId,
    root: join(tmpdir(), "MCP_NONEXISTENT_FIXTURE"),
    resources: [{ id: "guide", name: "Guide de démonstration", relativePath: "guide.txt" }],
  };
  registerMcpTools(app, { pglite: { query: audit } } as unknown as DemoDatabase, {
    locked,
    binding: configured ? binding : undefined,
    authorize,
    revalidate,
  });
  await app.ready();
  const request = (payload: unknown = { tool: "READ_FILE_SCOPED", resourceId: "guide" }) =>
    app.inject({ method: "POST", url: "/v1/mcp/call", payload: payload as Record<string, unknown> });
  return { app, audit, authorize, revalidate, execute, binding, request };
}

describe("MCP — routes de lecture bornées", () => {
  it("le statut expose les deux outils et le catalogue sans lire le dossier ni tester une connexion", async () => {
    const f = await fixture();
    const response = await f.app.inject("/v1/mcp/status");
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      provider: "MCP",
      mode: "SCOPED_READ_ONLY",
      state: "CONFIGURED",
      verification: "NOT_PERFORMED",
      tools: [mcpReadFileTool, mcpSearchFilesTool],
      resources: [{ id: "guide", name: "Guide de démonstration" }],
    });
    expect(f.authorize).toHaveBeenCalledWith(expect.anything(), mcpReadFileTool);
    expect(f.revalidate).toHaveBeenCalledWith(expect.anything(), mcpReadFileTool);
    expect(response.body).not.toMatch(/NONEXISTENT|relativePath|guide\.txt|wsp_fixture/);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it.each([
    { locked: false, configured: true, state: "DISABLED" },
    { locked: false, configured: false, state: "DISABLED" },
    { locked: true, configured: false, state: "PREPARED" },
  ])("reste fermé sans IO quand $state", async ({ state, ...options }) => {
    const f = await fixture(options);
    const status = await f.app.inject("/v1/mcp/status");
    expect(status.json().data).toMatchObject({ state, resources: [], verification: "NOT_PERFORMED" });
    expect((await f.request()).statusCode).toBe(503);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it("refuse l'anonyme et un outil non autorisé avant l'appel MCP", async () => {
    const f = await fixture();
    f.authorize.mockImplementation(() => {
      throw Object.assign(new Error("Connexion requise"), { statusCode: 401 });
    });
    expect((await f.request()).statusCode).toBe(401);
    expect((await f.app.inject("/v1/mcp/status")).statusCode).toBe(401);
    f.authorize.mockImplementation(() => {
      throw Object.assign(new Error("Outil non autorisé"), { statusCode: 403 });
    });
    expect((await f.request({ tool: "SEARCH_FILES_SCOPED", query: "fixture" })).statusCode).toBe(403);
    expect(f.authorize).toHaveBeenLastCalledWith(expect.anything(), mcpSearchFilesTool);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it("refuse un autre workspace avant le SDK ou la remise du catalogue", async () => {
    const f = await fixture({ workspaceId: "wsp_other" });
    expect((await f.request()).statusCode).toBe(403);
    expect((await f.app.inject("/v1/mcp/status")).statusCode).toBe(403);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it("refuse les outils inconnus et les racines, URLs, chemins ou workspaces fournis par le client", async () => {
    const f = await fixture();
    for (const payload of [
      {},
      { tool: "WRITE_FILE_SCOPED", resourceId: "guide" },
      { tool: "READ_FILE_SCOPED" },
      { tool: "READ_FILE_SCOPED", resourceId: "guide", root: "C:/" },
      { tool: "READ_FILE_SCOPED", resourceId: "guide", url: "https://outside.invalid" },
      { tool: "READ_FILE_SCOPED", resourceId: "guide", path: "../secrets.txt" },
      { tool: "READ_FILE_SCOPED", resourceId: "guide", workspaceId: "wsp_other" },
      { tool: "SEARCH_FILES_SCOPED", query: "" },
      { tool: "SEARCH_FILES_SCOPED", query: "fixture", args: {} },
    ])
      expect((await f.request(payload)).statusCode).toBe(400);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it("borne le corps avant le SDK", async () => {
    const f = await fixture();
    expect((await f.request({ tool: "SEARCH_FILES_SCOPED", query: "x".repeat(2000) })).statusCode).toBe(413);
    expect(f.execute).not.toHaveBeenCalled();
  });

  it("réévalue la session avant de livrer le statut", async () => {
    const f = await fixture();
    f.revalidate.mockRejectedValue(Object.assign(new Error("Session révoquée"), { statusCode: 401 }));
    const response = await f.app.inject("/v1/mcp/status");
    expect(response.statusCode).toBe(401);
    expect(response.json().data).toBeUndefined();
  });

  it("livre le contenu non fiable après les audits et la revalidation de l'outil réellement appelé", async () => {
    const f = await fixture();
    const response = await f.request();
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(result);
    expect(f.execute).toHaveBeenCalledWith(
      f.binding,
      { tool: "READ_FILE_SCOPED", resourceId: "guide" },
      expect.any(AbortSignal),
    );
    expect(f.revalidate).toHaveBeenCalledTimes(3);
    expect(f.revalidate.mock.calls.every(([, tool]) => tool === mcpReadFileTool)).toBe(true);
    const outcomes = f.audit.mock.calls.map(([, values]) => JSON.parse(values[4]).outcome);
    expect(outcomes).toEqual(["REQUESTED", "SUCCEEDED"]);
    const audit = JSON.stringify(f.audit.mock.calls);
    expect(audit).not.toMatch(/guide|NON_FIABLE|relativePath|NONEXISTENT/);
    expect(audit).toContain("ses_fixture");
    expect(audit).toContain("cli_fixture");
  });

  it("ne conserve pas la recherche ni les extraits dans l'audit", async () => {
    const f = await fixture();
    f.execute.mockResolvedValue({
      tool: "SEARCH_FILES_SCOPED",
      untrusted: true,
      matches: [{ resourceId: "guide", line: 1, excerpt: "EXTRAIT_SYNTHETIQUE" }],
    });
    const response = await f.request({ tool: "SEARCH_FILES_SCOPED", query: "RECHERCHE_SYNTHETIQUE" });
    expect(response.statusCode).toBe(200);
    expect(f.authorize).toHaveBeenCalledWith(expect.anything(), mcpSearchFilesTool);
    expect(f.revalidate.mock.calls.every(([, tool]) => tool === mcpSearchFilesTool)).toBe(true);
    expect(JSON.stringify(f.audit.mock.calls)).not.toMatch(/RECHERCHE_SYNTHETIQUE|EXTRAIT_SYNTHETIQUE|guide/);
  });

  it("bloque l'exécution si l'audit initial ne peut pas être écrit", async () => {
    const f = await fixture();
    f.audit.mockRejectedValue(new Error("PRIVATE_DATABASE_PATH"));
    const response = await f.request();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("PRIVATE_DATABASE_PATH");
    expect(f.execute).not.toHaveBeenCalled();
  });

  it("révocation avant l'exécution : aucun appel MCP même si la revalidation suivante passe", async () => {
    const f = await fixture();
    f.revalidate.mockRejectedValueOnce(Object.assign(new Error("Session révoquée"), { statusCode: 401 }));
    expect((await f.request()).statusCode).toBe(401);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit.mock.calls.map(([, values]) => JSON.parse(values[4]).outcome)).toEqual(["REQUESTED", "FAILED"]);
  });

  it.each([1, 2])("révocation à la revalidation %i après lecture : aucun contenu livré", async (completedChecks) => {
    const f = await fixture();
    for (let index = 0; index < completedChecks; index++) f.revalidate.mockResolvedValueOnce(undefined);
    f.revalidate.mockRejectedValueOnce(Object.assign(new Error("Session révoquée"), { statusCode: 403 }));
    const response = await f.request();
    expect(response.statusCode).toBe(403);
    expect(response.json().data).toBeUndefined();
    expect(response.body).not.toContain(result.text);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it("une panne d'audit final empêche la remise du résultat", async () => {
    const f = await fixture();
    f.audit.mockResolvedValueOnce({ rows: [] }).mockRejectedValue(new Error("PRIVATE_AUDIT_PATH"));
    const response = await f.request();
    expect(response.statusCode).toBe(503);
    expect(response.json().data).toBeUndefined();
    expect(response.body).not.toMatch(/PRIVATE_AUDIT_PATH|NON_FIABLE/);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it("une panne SDK donne une erreur bornée et un audit sans contenu privé", async () => {
    const f = await fixture();
    f.execute.mockRejectedValue(new Error("PRIVATE_ROOT_AND_CONTENT"));
    const response = await f.request();
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("MCP_CALL_UNAVAILABLE");
    expect(response.body).not.toContain("PRIVATE_ROOT_AND_CONTENT");
    expect(f.audit.mock.calls.map(([, values]) => JSON.parse(values[4]).outcome)).toEqual(["REQUESTED", "FAILED"]);
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("PRIVATE_ROOT_AND_CONTENT");
  });

  it("limite la concurrence à un appel pour la configuration serveur", async () => {
    const f = await fixture();
    let finish!: (value: typeof result) => void;
    f.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = f.request();
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledTimes(1));
    expect((await f.request()).statusCode).toBe(429);
    expect(f.execute).toHaveBeenCalledTimes(1);
    finish(result);
    expect((await first).statusCode).toBe(200);
    expect((await f.request()).statusCode).toBe(200);
  });

  it("limite 60 appels par minute puis libère la fenêtre sans cache de contenu", async () => {
    const f = await fixture();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    for (let index = 0; index < 60; index++) expect((await f.request()).statusCode).toBe(200);
    expect((await f.request()).statusCode).toBe(429);
    expect(f.execute).toHaveBeenCalledTimes(60);
    clock.mockReturnValue(1_060_000);
    expect((await f.request()).statusCode).toBe(200);
    expect(f.execute).toHaveBeenCalledTimes(61);
  });
});
