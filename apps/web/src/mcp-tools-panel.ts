import { IdaApiError } from "./api-transport";

export type McpRequest =
  | { tool: "READ_FILE_SCOPED"; resourceId: string }
  | { tool: "SEARCH_FILES_SCOPED"; query: string };
export type McpStatus = {
  state: "DISABLED" | "PREPARED" | "CONFIGURED";
  resources: { id: string; name: string }[];
};
export type McpResult =
  | { tool: "READ_FILE_SCOPED"; resourceId: string; text: string }
  | { tool: "SEARCH_FILES_SCOPED"; matches: { resourceId: string; line: number; excerpt: string }[] };

const resourcePattern = /^[a-z0-9_-]{1,64}$/u;
function invalid(): never {
  throw new IdaApiError("Réponse MCP non reconnue.");
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function hasControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}
export function validMcpQuery(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= 120 && !hasControl(value.trim());
}

export function parseMcpStatus(payload: unknown): McpStatus {
  const data = record(record(payload).data);
  if (
    data.provider !== "MCP" ||
    data.mode !== "SCOPED_READ_ONLY" ||
    data.verification !== "NOT_PERFORMED" ||
    (data.state !== "DISABLED" && data.state !== "PREPARED" && data.state !== "CONFIGURED") ||
    !Array.isArray(data.tools) ||
    data.tools.length !== 2 ||
    !Array.isArray(data.resources) ||
    data.resources.length > 16
  )
    return invalid();
  const tools = new Set<string>();
  for (const entry of data.tools) {
    const tool = record(entry);
    if (
      (tool.toolKey !== "READ_FILE_SCOPED" && tool.toolKey !== "SEARCH_FILES_SCOPED") ||
      tool.moduleKey !== "IDA" ||
      tool.permission !== "READ" ||
      tools.has(tool.toolKey)
    )
      return invalid();
    tools.add(tool.toolKey);
  }
  const ids = new Set<string>();
  const resources = data.resources.map((entry) => {
    const resource = record(entry);
    if (
      typeof resource.id !== "string" ||
      !resourcePattern.test(resource.id) ||
      ids.has(resource.id) ||
      typeof resource.name !== "string" ||
      !resource.name.trim() ||
      resource.name.length > 120 ||
      hasControl(resource.name)
    )
      return invalid();
    ids.add(resource.id);
    return { id: resource.id, name: resource.name };
  });
  if ((data.state === "CONFIGURED") !== resources.length > 0) return invalid();
  return { state: data.state, resources };
}

export function parseMcpResult(payload: unknown, request: McpRequest, resources: McpStatus["resources"]): McpResult {
  const data = record(record(payload).data);
  if (data.tool !== request.tool || data.untrusted !== true) return invalid();
  const ids = new Set(resources.map((resource) => resource.id));
  if (request.tool === "READ_FILE_SCOPED") {
    if (
      data.resourceId !== request.resourceId ||
      !ids.has(request.resourceId) ||
      typeof data.text !== "string" ||
      data.text.length > 64 * 1024 ||
      new TextEncoder().encode(data.text).byteLength > 64 * 1024
    )
      return invalid();
    return { tool: request.tool, resourceId: request.resourceId, text: data.text };
  }
  if (!Array.isArray(data.matches) || data.matches.length > 20) return invalid();
  const seen = new Set<string>();
  const matches = data.matches.map((entry) => {
    const match = record(entry);
    if (
      typeof match.resourceId !== "string" ||
      !ids.has(match.resourceId) ||
      typeof match.line !== "number" ||
      !Number.isSafeInteger(match.line) ||
      match.line < 1 ||
      match.line > 64 * 1024 + 1 ||
      seen.has(`${match.resourceId}:${match.line}`) ||
      typeof match.excerpt !== "string" ||
      match.excerpt.length > 240
    )
      return invalid();
    seen.add(`${match.resourceId}:${match.line}`);
    return { resourceId: match.resourceId, line: match.line, excerpt: match.excerpt };
  });
  return { tool: request.tool, matches };
}

export function mcpErrorMessage(error: unknown): string {
  if (error instanceof IdaApiError) {
    if (error.status === 401) return "Reconnectez-vous à IDA, puis rechargez les outils.";
    if (error.status === 403) return "Cet espace ne vous autorise pas à consulter ces documents. Vérifiez votre accès.";
    if (error.status === 429)
      return "Une lecture est en cours ou la limite est atteinte. Patientez une minute et réessayez.";
    if (error.status === 400) return "Choisissez un document ou une recherche de 1 à 120 caractères, puis réessayez.";
    if (error.status === 503)
      return "Lecture indisponible. Vérifiez la configuration MCP et la session locale verrouillée.";
  }
  return "Le résultat MCP n’a pas pu être validé. Rechargez les outils, puis réessayez.";
}
