import { timestampSchema } from "@ida/contracts";

export type SmartHomeState = "ON" | "OFF" | "UNKNOWN" | "UNAVAILABLE";
export type SmartHomeReadResult =
  | { status: "READY"; state: SmartHomeState; providerUpdatedAt: string }
  | { status: "INVALID_RESPONSE" | "PROVIDER_UNAVAILABLE" | "CANCELLED" };

/** Port interne pour un appareil déjà autorisé par le Gateway. Pas une API cliente. */
export interface SmartHomeReadProvider {
  readState(signal?: AbortSignal): Promise<SmartHomeReadResult>;
}

/** À implémenter seulement après validation du coffre, de l’hôte et des droits.
 * Aucun transport réel ni provider n’est enregistré dans le runtime actuel.
 */
export interface HomeAssistantReadTransport {
  getState(request: { method: "GET"; path: `/api/states/${string}`; signal?: AbortSignal }): Promise<unknown>;
}

const lightEntityPattern = /^light\.[a-z0-9_]{1,100}$/;
const stateMap: Readonly<Record<string, SmartHomeState>> = {
  on: "ON",
  off: "OFF",
  unknown: "UNKNOWN",
  unavailable: "UNAVAILABLE",
};

/** La cible vient d’un binding serveur, jamais d’une sortie IA ou d’une URL client. */
export function createHomeAssistantReadProvider(
  binding: { entityId: string },
  transport: HomeAssistantReadTransport,
): SmartHomeReadProvider {
  const entityId = binding.entityId;
  if (typeof entityId !== "string" || entityId.trim() !== entityId || !lightEntityPattern.test(entityId)) {
    throw new Error("SMART_HOME_TARGET_UNSUPPORTED");
  }
  const path = `/api/states/${entityId}` as const;
  return {
    async readState(signal?: AbortSignal) {
      if (signal?.aborted) return { status: "CANCELLED" };
      const cancelled = Symbol("cancelled");
      let cleanup = () => {};
      try {
        const cancellation = signal
          ? new Promise<typeof cancelled>((resolve) => {
              const abort = () => resolve(cancelled);
              signal.addEventListener("abort", abort, { once: true });
              cleanup = () => signal.removeEventListener("abort", abort);
              if (signal.aborted) abort();
            })
          : undefined;
        const pending = transport.getState({ method: "GET", path, ...(signal ? { signal } : {}) });
        const raw = await (cancellation ? Promise.race([pending, cancellation]) : pending);
        // Un transport tardif ne peut pas réintroduire un résultat après annulation.
        if (raw === cancelled || signal?.aborted) return { status: "CANCELLED" };
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { status: "INVALID_RESPONSE" };
        const record = raw as Record<string, unknown>;
        if (
          record.entity_id !== entityId ||
          typeof record.state !== "string" ||
          !Object.hasOwn(stateMap, record.state)
        ) {
          return { status: "INVALID_RESPONSE" };
        }
        const timestamp = timestampSchema.safeParse(record.last_updated);
        if (!timestamp.success) return { status: "INVALID_RESPONSE" };
        return {
          status: "READY",
          state: stateMap[record.state] as SmartHomeState,
          providerUpdatedAt: timestamp.data,
        };
      } catch {
        // Ne jamais remonter le message fournisseur, qui peut contenir URL ou secret.
        return { status: signal?.aborted ? "CANCELLED" : "PROVIDER_UNAVAILABLE" };
      } finally {
        cleanup();
      }
    },
  };
}
