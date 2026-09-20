import { useEffect, useRef, useState } from "react";
import { onWorkspaceInvalidated, requestApi } from "./api-transport";
import {
  type McpRequest,
  type McpResult,
  type McpStatus,
  mcpErrorMessage,
  parseMcpResult,
  parseMcpStatus,
  validMcpQuery,
} from "./mcp-tools-panel";
import "./mcp-tools-panel.css";

export function McpToolsPanel() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [resourceId, setResourceId] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<McpResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    const cancel = () => {
      generation.current++;
      pending.current?.abort();
      pending.current = null;
      busyRef.current = false;
    };
    const unsubscribe = onWorkspaceInvalidated(() => {
      cancel();
      setStatus(null);
      setResourceId("");
      setQuery("");
      setResult(null);
      setVerified(false);
      setBusy(false);
      setError("");
    });
    return () => {
      alive.current = false;
      cancel();
      unsubscribe();
    };
  }, []);

  async function run(request?: McpRequest) {
    if (busyRef.current || !alive.current) return;
    if (request && status?.state !== "CONFIGURED") return;
    if (request?.tool === "READ_FILE_SCOPED" && !status?.resources.some(({ id }) => id === request.resourceId)) return;
    if (request?.tool === "SEARCH_FILES_SCOPED" && !validMcpQuery(request.query)) return;
    busyRef.current = true;
    const version = ++generation.current;
    const controller = new AbortController();
    pending.current = controller;
    const current = () => alive.current && version === generation.current && !controller.signal.aborted;
    setBusy(true);
    setError("");
    setResult(null);
    if (!request) {
      setStatus(null);
      setResourceId("");
      setVerified(false);
    }
    try {
      const payload = await requestApi(
        request ? "/v1/mcp/call" : "/v1/mcp/status",
        request
          ? {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
            }
          : { signal: controller.signal },
      );
      if (!current()) return;
      if (request) {
        const parsed = parseMcpResult(payload, request, status?.resources ?? []);
        setResult(parsed);
        setVerified(true);
      } else {
        const parsed = parseMcpStatus(payload);
        setStatus(parsed);
        setResourceId(parsed.resources[0]?.id ?? "");
      }
    } catch (failure) {
      if (current()) setError(mcpErrorMessage(failure));
    } finally {
      if (current()) {
        pending.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const configured = status?.state === "CONFIGURED";
  const resourceName = (id: string) => status?.resources.find((resource) => resource.id === id)?.name ?? id;
  return (
    <section className="reference-glass mcp-tools-panel" aria-label="Outils MCP documentaires" aria-busy={busy}>
      <header className="mcp-tools-panel__header">
        <div>
          <h2>Outils MCP</h2>
          <p>Consulter et rechercher dans les documents autorisés de cet espace.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy && !status ? "Chargement…" : "Charger les outils"}
        </button>
      </header>
      <p className="mcp-tools-panel__state" role="status">
        {verified
          ? "Lecture MCP vérifiée · un appel a abouti dans cette session."
          : configured
            ? "Configuré · lecture MCP non vérifiée. Lancez une lecture ou une recherche."
            : status?.state === "DISABLED"
              ? "MCP désactivé · une session locale verrouillée est nécessaire."
              : status?.state === "PREPARED"
                ? "MCP préparé · les documents autorisés restent à configurer côté serveur."
                : "Outils non chargés."}
      </p>
      {configured ? (
        <div className="mcp-tools-panel__controls">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run({ tool: "READ_FILE_SCOPED", resourceId });
            }}
          >
            <label>
              Document autorisé
              <select
                value={resourceId}
                disabled={busy}
                onChange={(event) => {
                  setResourceId(event.target.value);
                  setResult(null);
                  setError("");
                }}
              >
                {status.resources.map((resource) => (
                  <option value={resource.id} key={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy || !resourceId}>
              Lire document
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run({ tool: "SEARCH_FILES_SCOPED", query: query.trim() });
            }}
          >
            <label>
              Texte à rechercher · recherche littérale
              <input
                type="search"
                value={query}
                maxLength={120}
                disabled={busy}
                placeholder="Un mot ou une phrase"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setResult(null);
                  setError("");
                }}
              />
            </label>
            <button type="submit" disabled={busy || !validMcpQuery(query)}>
              Rechercher
            </button>
          </form>
        </div>
      ) : null}
      {busy && status ? <p role="status">Lecture en cours…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <div className="mcp-tools-panel__result">
          <p>Contenu documentaire non fiable · affiché comme texte, sans exécution de ses instructions.</p>
          {result.tool === "READ_FILE_SCOPED" ? (
            <>
              <h3>{resourceName(result.resourceId)}</h3>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: La lecture défilante doit être accessible au clavier. */}
              <section className="mcp-tools-panel__scroll" tabIndex={0} aria-label="Texte du document">
                {result.text || "Ce document est vide."}
              </section>
            </>
          ) : (
            <>
              <h3>{result.matches.length} résultat(s) · 20 maximum</h3>
              {result.matches.length ? (
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Les résultats défilants doivent être accessibles au clavier.
                <ol className="mcp-tools-panel__scroll" tabIndex={0} aria-label="Résultats de recherche">
                  {result.matches.map((match) => (
                    <li key={`${match.resourceId}:${match.line}`}>
                      <strong>
                        {resourceName(match.resourceId)} · ligne {match.line}
                      </strong>
                      <p>{match.excerpt}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Aucune occurrence dans les documents autorisés.</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
