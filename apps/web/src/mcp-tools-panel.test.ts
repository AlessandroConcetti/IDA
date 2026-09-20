import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IdaApiError } from "./api-transport";
import { McpToolsPanel } from "./McpToolsPanel";
import { mcpErrorMessage, parseMcpResult, parseMcpStatus, validMcpQuery } from "./mcp-tools-panel";

const resources = [{ id: "guide", name: "Guide documentaire" }];
function status() {
  return {
    data: {
      provider: "MCP",
      mode: "SCOPED_READ_ONLY",
      state: "CONFIGURED",
      verification: "NOT_PERFORMED",
      tools: [
        { toolKey: "READ_FILE_SCOPED", moduleKey: "IDA", permission: "READ" },
        { toolKey: "SEARCH_FILES_SCOPED", moduleKey: "IDA", permission: "READ" },
      ],
      resources,
    },
  };
}
const read = { tool: "READ_FILE_SCOPED", resourceId: "guide" } as const;
const search = { tool: "SEARCH_FILES_SCOPED", query: "MCP" } as const;

describe("MCP documentaire — validation des réponses", () => {
  it("charge un catalogue configuré sans prétendre à une lecture vérifiée", () => {
    expect(parseMcpStatus(status())).toEqual({ state: "CONFIGURED", resources });
    expect(parseMcpStatus({ data: { ...status().data, state: "PREPARED", resources: [] } }).state).toBe("PREPARED");
  });
  it("refuse les états, permissions, doublons et catalogues hors limites", () => {
    for (const changes of [
      { state: "CONNECTED" },
      { verification: "VERIFIED" },
      { mode: "UNRESTRICTED" },
      { tools: [{ ...status().data.tools[0], permission: "WRITE" }, status().data.tools[1]] },
      { resources: [resources[0], resources[0]] },
      { resources: Array.from({ length: 17 }, (_, index) => ({ id: `doc_${index}`, name: "Guide" })) },
      { resources: [{ id: "../private", name: "Privé" }] },
      { resources: [] },
    ]) {
      expect(() => parseMcpStatus({ data: { ...status().data, ...changes } })).toThrow("non reconnue");
    }
  });
  it("accepte seulement le document demandé, marqué non fiable et limité à 64 Kio UTF-8", () => {
    const data = { ...read, untrusted: true, text: "<script>instruction externe</script>" };
    expect(parseMcpResult({ data }, read, resources)).toEqual({ ...read, text: data.text });
    for (const changes of [
      { tool: "SEARCH_FILES_SCOPED" },
      { untrusted: false },
      { resourceId: "other" },
      { text: "a".repeat(65537) },
      { text: "é".repeat(32769) },
    ]) {
      expect(() => parseMcpResult({ data: { ...data, ...changes } }, read, resources)).toThrow();
    }
    expect(() => parseMcpResult({ data }, read, [])).toThrow();
  });
  it("borne les extraits, valide les lignes et exclut toute ressource hors catalogue", () => {
    const match = { resourceId: "guide", line: 1, excerpt: "MCP" };
    const data = { tool: search.tool, untrusted: true, matches: [match] };
    expect(parseMcpResult({ data }, search, resources)).toEqual({ tool: search.tool, matches: [match] });
    for (const matches of [
      Array.from({ length: 21 }, () => match),
      [match, match],
      [{ ...match, resourceId: "secret" }],
      [{ ...match, line: 0 }],
      [{ ...match, line: 1.5 }],
      [{ ...match, excerpt: "x".repeat(241) }],
    ]) {
      expect(() => parseMcpResult({ data: { ...data, matches } }, search, resources)).toThrow();
    }
  });
  it("conserve la recherche littérale et refuse les contrôles ou requêtes excessives", () => {
    expect(validMcpQuery("[MCP].*")).toBe(true);
    expect(validMcpQuery(" ")).toBe(false);
    expect(validMcpQuery("a".repeat(121))).toBe(false);
    expect(validMcpQuery("a\u0000b")).toBe(false);
  });
  it("affiche des erreurs actionnables sans recopier une réponse externe", () => {
    expect(mcpErrorMessage(new IdaApiError("secret serveur", 403))).toContain("Vérifiez votre accès");
    expect(mcpErrorMessage(new IdaApiError("secret serveur", 429))).toContain("minute");
    expect(mcpErrorMessage(new Error("secret serveur"))).not.toContain("secret serveur");
  });
  it("n’effectue aucun appel au rendu et demande un chargement explicite", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      const html = renderToStaticMarkup(createElement(McpToolsPanel));
      expect(html).toContain("Charger les outils");
      expect(html).toContain("Outils non chargés");
      expect(html).not.toContain("Lecture MCP vérifiée");
      expect(html).not.toContain("Lire document");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
