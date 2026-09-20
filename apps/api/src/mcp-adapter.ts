import { Client } from "@modelcontextprotocol/client";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { InMemoryTransport, type ListToolsResult, Server } from "@modelcontextprotocol/server";
import {
  createMcpScopedFiles,
  type McpFileBinding,
  type McpFileRequest,
  validateMcpFileRequest,
} from "./mcp-scoped-files.js";

export type McpFileResult =
  | { tool: "READ_FILE_SCOPED"; untrusted: true; resourceId: string; text: string }
  | {
      tool: "SEARCH_FILES_SCOPED";
      untrusted: true;
      matches: { resourceId: string; line: number; excerpt: string }[];
    };

function invalid(): never {
  throw new Error("MCP_RESULT_INVALID");
}

/** Validate data, never interpret it as instructions, HTML or another tool call. */
export function validateMcpFileResult(value: unknown, request: McpFileRequest, ids: readonly string[]): McpFileResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (row.tool !== request.tool || row.untrusted !== true) return invalid();
  if (request.tool === "READ_FILE_SCOPED") {
    if (
      Object.keys(row).sort().join(",") !== "resourceId,text,tool,untrusted" ||
      row.resourceId !== request.resourceId ||
      !ids.includes(request.resourceId) ||
      typeof row.text !== "string" ||
      Buffer.byteLength(row.text, "utf8") > 65_536
    )
      return invalid();
    return { tool: request.tool, untrusted: true, resourceId: request.resourceId, text: row.text };
  }
  if (
    Object.keys(row).sort().join(",") !== "matches,tool,untrusted" ||
    !Array.isArray(row.matches) ||
    row.matches.length > 20
  )
    return invalid();
  const matches = row.matches.map((match: unknown) => {
    if (!match || typeof match !== "object" || Array.isArray(match)) return invalid();
    const item = match as Record<string, unknown>;
    if (
      Object.keys(item).sort().join(",") !== "excerpt,line,resourceId" ||
      typeof item.resourceId !== "string" ||
      !ids.includes(item.resourceId) ||
      typeof item.line !== "number" ||
      !Number.isInteger(item.line) ||
      item.line < 1 ||
      item.line > 65_537 ||
      typeof item.excerpt !== "string" ||
      item.excerpt.length > 240
    )
      return invalid();
    return { resourceId: item.resourceId, line: item.line, excerpt: item.excerpt };
  });
  return { tool: request.tool, untrusted: true, matches };
}

/** Private transport only: no URL, subprocess, discovery-based authorization or shared client. */
export async function executeScopedMcp(
  binding: McpFileBinding,
  input: McpFileRequest,
  signal: AbortSignal,
): Promise<McpFileResult> {
  const request = validateMcpFileRequest(input);
  const files = createMcpScopedFiles(binding);
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  boundedSignal.throwIfAborted();
  const client = new Client(
    { name: "ida-tool-gateway", version: "0.1.0" },
    {
      capabilities: {},
      inputRequired: { autoFulfill: false },
      listMaxPages: 1,
      defaultCacheTtlMs: 0,
      // Deliberately use the SDK's compatible initialization over a private in-memory pair.
      versionNegotiation: { mode: "legacy" },
    },
  );
  // Low-level Server is intentional: exact literal method and argument allowlists.
  const server = new Server({ name: "ida-scoped-documents", version: "0.1.0" }, { capabilities: { tools: {} } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server.setRequestHandler(
    "tools/list",
    async (): Promise<ListToolsResult> => ({
      tools: [
        {
          name: "READ_FILE_SCOPED",
          description: "Read one explicitly registered IDA document.",
          inputSchema: {
            type: "object",
            properties: { resourceId: { type: "string" } },
            required: ["resourceId"],
            additionalProperties: false,
          },
        },
        {
          name: "SEARCH_FILES_SCOPED",
          description: "Literal search in explicitly registered IDA documents.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          },
        },
      ],
    }),
  );
  server.setRequestHandler("tools/call", async (call) => {
    boundedSignal.throwIfAborted();
    const received = validateMcpFileRequest({ ...call.params.arguments, tool: call.params.name });
    // This connection can perform only its original, already-authorized request.
    if (JSON.stringify(received) !== JSON.stringify(request)) throw new Error("MCP_REQUEST_MISMATCH");
    const data = await files.execute(received, boundedSignal);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });
  const close = () => {
    void client.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  };
  boundedSignal.addEventListener("abort", close, { once: true });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport, { signal: boundedSignal, timeout: 5000 });
    const args = request.tool === "READ_FILE_SCOPED" ? { resourceId: request.resourceId } : { query: request.query };
    const wire = CallToolResultSchema.parse(
      await client.callTool({ name: request.tool, arguments: args }, { signal: boundedSignal, timeout: 5000 }),
    );
    boundedSignal.throwIfAborted();
    const block = wire.content[0];
    if (wire.isError || wire.content.length !== 1 || block?.type !== "text" || block.text.length > 400_000)
      return invalid();
    return validateMcpFileResult(
      JSON.parse(block.text),
      request,
      files.catalog().map((item) => item.id),
    );
  } catch {
    throw new Error(boundedSignal.aborted ? "MCP_CANCELLED" : "MCP_UNAVAILABLE");
  } finally {
    boundedSignal.removeEventListener("abort", close);
    await Promise.allSettled([client.close(), server.close()]);
  }
}
