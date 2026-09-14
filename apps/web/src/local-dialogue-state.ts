const messages = {
  DISABLED: "Le dialogue local est désactivé sur ce serveur.",
  READY: "Modèle local vérifié · prêt pour une demande · expérimental · aucun cloud",
  BUSY: "Le modèle traite déjà une demande. Vérifiez à nouveau après sa réponse.",
  MODEL_MISSING:
    "Le modèle local requis est absent ou son empreinte ne correspond pas. Aucun téléchargement automatique.",
  UNAVAILABLE: "Le moteur local ne répond pas. Il doit être relancé sur le PC ; aucun cloud ne prend le relais.",
} as const;

function localData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || !("data" in value)) throw new Error("INVALID_LOCAL_RESPONSE");
  const data = value.data;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !("locality" in data) ||
    data.locality !== "LOCAL" ||
    !("experimental" in data) ||
    data.experimental !== true ||
    !("model" in data) ||
    typeof data.model !== "string" ||
    !data.model.trim() ||
    data.model.length > 160
  )
    throw new Error("INVALID_LOCAL_RESPONSE");
  return data as Record<string, unknown>;
}

export function readLocalDialogueStatus(value: unknown) {
  const data = localData(value);
  if (typeof data.state !== "string" || !Object.hasOwn(messages, data.state)) throw new Error("INVALID_LOCAL_STATUS");
  const state = data.state as keyof typeof messages;
  return { state, ready: state === "READY", message: messages[state] };
}

export function readLocalDialogueReply(value: unknown): string {
  const data = localData(value);
  if (data.provider !== "ollama" || typeof data.text !== "string" || !data.text.trim() || data.text.length > 32_768) {
    throw new Error("INVALID_LOCAL_REPLY");
  }
  return data.text;
}

/** An ephemeral reservation is not a model's installation/connection status. */
export function allocationStatusLabel(provider: { key: string; locality: string; status: string }): string | undefined {
  if (provider.locality !== "LOCAL" || provider.key !== "ollama") return undefined;
  if (provider.status === "NOT_CONFIGURED") return "Allocation non ouverte";
  if (provider.status === "QUOTA_EXCEEDED") return "Allocation consommée";
  return undefined;
}
