export class IdaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "IdaApiError";
  }
}

export const apiBaseUrl = (import.meta.env.VITE_IDA_API_URL?.trim() ?? "").replace(/\/+$/, "");
const pendingWorkspaceRequests = new Set<AbortController>();
const authenticationListeners = new Set<() => void>();
const workspaceMutationListeners = new Set<() => void>();
let workspaceGeneration = 0;

export function onWorkspaceMutation(listener: () => void): () => void {
  workspaceMutationListeners.add(listener);
  return () => workspaceMutationListeners.delete(listener);
}

// Seulement les écritures qui affectent le résumé ou ses catalogues.
// Une commande READ reste une lecture, même transportée par POST.
function affectsDashboard(path: string, method: string): boolean {
  if (method !== "POST") return false;
  return (
    /^\/v1\/(releases|tracks|media|campaigns|post-proposals)$/.test(path) ||
    /^\/v1\/post-variants\/[^/]+\/(approve|reject|internal-schedules)$/.test(path) ||
    /^\/v1\/internal-post-schedules\/[^/]+\/cancel$/.test(path)
  );
}

export function invalidateWorkspaceRequests(): void {
  workspaceGeneration += 1;
  for (const controller of pendingWorkspaceRequests) controller.abort();
  pendingWorkspaceRequests.clear();
}

export function onAuthenticationRequired(listener: () => void): () => void {
  authenticationListeners.add(listener);
  return () => authenticationListeners.delete(listener);
}

// Aucun token n'est lu par JavaScript. Le navigateur gère le cookie HttpOnly.
// Une génération invalidée ne peut pas livrer une réponse à un nouveau hub.
export async function requestApi(path: string, init: RequestInit = {}, accessRequest = false): Promise<unknown> {
  const generation = workspaceGeneration;
  const controller = new AbortController();
  if (!accessRequest) pendingWorkspaceRequests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!accessRequest && generation !== workspaceGeneration) throw new IdaApiError("Demande interrompue.");

    if (!response.ok) {
      if (response.status === 401 && !accessRequest) {
        invalidateWorkspaceRequests();
        for (const listener of authenticationListeners) listener();
      }
      const retry = Number(response.headers.get("Retry-After"));
      const retryAfter = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined;
      // Les formulaires d'accès emploient leurs propres messages français.
      // Une réponse externe ne peut ainsi recopier une passphrase dans l'UI.
      let message = "La demande a échoué.";
      if (!accessRequest && typeof payload === "object" && payload !== null && "error" in payload) {
        const error = payload.error;
        if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
          message = error.message;
        }
      }
      throw new IdaApiError(message, response.status, retryAfter);
    }
    if (!accessRequest && affectsDashboard(path, (init.method ?? "GET").toUpperCase())) {
      for (const listener of workspaceMutationListeners) {
        try {
          listener();
        } catch {
          // Une erreur d'affichage ne transforme jamais une écriture réussie
          // en échec apparent et ne doit pas inciter à la rejouer.
        }
      }
    }
    return payload;
  } catch (error) {
    if (error instanceof IdaApiError) throw error;
    throw new IdaApiError("IDA est momentanément indisponible. Réessaie dans un instant.");
  } finally {
    clearTimeout(timeout);
    pendingWorkspaceRequests.delete(controller);
  }
}
