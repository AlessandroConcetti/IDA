import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
async function fixture(workspaceId = "wsp_demo_aless") {
  const root = await mkdtemp(join(tmpdir(), "ida-mcp-integration-"));
  roots.push(root);
  await writeFile(join(root, "guide.md"), "# DOCUMENT_SYNTHETIQUE\nMCP lit uniquement les fichiers autorisés.");
  const opened = vi.spyOn(DemoDatabase, "open");
  const app = await createApp({
    dataDir: "memory://",
    storageDir: "memory://",
    identityMode: "LOCAL_LOCK",
    mcpFiles: { workspaceId, root, resources: [{ id: "guide", name: "Guide", relativePath: "guide.md" }] },
  });
  apps.push(app);
  const database = (await opened.mock.results.at(-1)?.value) as DemoDatabase;
  const setup = await app.inject({
    method: "POST",
    url: "/v1/auth/setup",
    payload: { passphrase: randomBytes(32).toString("base64url") },
  });
  expect(setup.statusCode).toBe(201);
  const cookies = setup.headers["set-cookie"];
  const headers = { cookie: (Array.isArray(cookies) ? cookies[0] : cookies)?.split(";", 1)[0] ?? "" };
  const call = (
    payload: Record<string, unknown> = { tool: "READ_FILE_SCOPED", resourceId: "guide" },
    customHeaders = headers,
  ) => app.inject({ method: "POST", url: "/v1/mcp/call", headers: customHeaders, payload });
  return { app, database, headers, call, root };
}
describe("MCP — authenticated API → Tool Gateway → real MCP → scoped file → audit", () => {
  it("performs both real tools and persists metadata-only audit under the session workspace", async () => {
    const f = await fixture();
    const status = await f.app.inject({ url: "/v1/mcp/status", headers: f.headers });
    expect(status.json().data).toMatchObject({ state: "CONFIGURED", verification: "NOT_PERFORMED" });
    expect(status.body).not.toContain(f.root);
    const read = await f.call();
    expect(read.statusCode).toBe(200);
    expect(read.json().data).toMatchObject({
      resourceId: "guide",
      untrusted: true,
      text: expect.stringContaining("DOCUMENT_SYNTHETIQUE"),
    });
    expect(read.headers["cache-control"]).toContain("no-store");
    const search = await f.call({ tool: "SEARCH_FILES_SCOPED", query: "autorisés" });
    expect(search.statusCode).toBe(200);
    expect(search.json().data.matches).toEqual([
      { resourceId: "guide", line: 2, excerpt: "MCP lit uniquement les fichiers autorisés." },
    ]);
    const audit = await f.database.pglite.query(
      "SELECT workspace_id, payload FROM activity_logs WHERE action='mcp.tool.call'",
    );
    expect(audit.rows).toHaveLength(4);
    expect(audit.rows.every((row) => (row as { workspace_id: string }).workspace_id === "wsp_demo_aless")).toBe(true);
    expect(JSON.stringify(audit.rows)).not.toMatch(/DOCUMENT_SYNTHETIQUE|autorisés|guide\.md/u);
  });
  it("refuses anonymous, hostile-origin and extra-parameter requests with no tool success", async () => {
    const f = await fixture();
    expect((await f.call(undefined, { cookie: "" })).statusCode).toBe(401);
    expect(
      (await f.call(undefined, { ...f.headers, origin: "https://attacker.invalid" } as typeof f.headers)).statusCode,
    ).toBe(403);
    expect((await f.call({ tool: "READ_FILE_SCOPED", resourceId: "guide", workspaceId: "wsp_other" })).statusCode).toBe(
      400,
    );
    expect((await f.call({ tool: "SHELL", command: "whoami" })).statusCode).toBe(400);
    const audit = await f.database.pglite.query("SELECT id FROM activity_logs WHERE action='mcp.tool.call'");
    expect(audit.rows).toHaveLength(0);
  });
  it("enforces workspace binding", async () => {
    const f = await fixture("wsp_other");
    expect((await f.call()).statusCode).toBe(403);
    expect((await f.app.inject({ url: "/v1/mcp/status", headers: f.headers })).statusCode).toBe(403);
  });
  it("rejects a revoked membership before MCP execution", async () => {
    const f = await fixture();
    await f.database.pglite.query("UPDATE memberships SET status='REVOKED'");
    expect([401, 403]).toContain((await f.call()).statusCode);
    const audit = await f.database.pglite.query("SELECT id FROM activity_logs WHERE action='mcp.tool.call'");
    expect(audit.rows).toHaveLength(0);
  });
});
