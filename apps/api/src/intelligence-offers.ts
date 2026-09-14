import type { NetworkProvider } from "@ida/contracts/intelligence-network";

// Présélection documentaire, pas des inscriptions exécutables au ProviderRegistry.
// Les modèles/capacités réellement admissibles seront épinglés après revue, jamais depuis ces textes.
const base: Omit<NetworkProvider, "key" | "name" | "model" | "role" | "conditions" | "sources"> = {
  lifecycle: "PREPARED",
  status: "NOT_CONFIGURED",
  locality: "CLOUD",
  cost: "UNKNOWN",
  freeTier: "CONDITIONAL",
  capabilities: [],
  allocationRemaining: null,
  quota: null,
  estimatedCostMicros: null,
  latencyMs: null,
  lastSuccess: null,
  lastError: null,
  verifiedAt: "2026-09-14",
  privacy: "Egress bloquée. Revue de confidentialité, consentement et quota du compte requis.",
};
export const preparedIntelligenceOffers: NetworkProvider[] = [
  {
    ...base,
    key: "gemini",
    name: "Google Gemini API",
    model: "gemini-3.8-flash · référence à qualifier",
    role: "Multimodal / raisonnement",
    lifecycle: "NEEDS_REVIEW",
    status: "BLOCKED",
    cost: "BLOCKED",
    conditions:
      "Free sous conditions par modèle. Les conditions imposent Paid pour un client API proposé aux utilisateurs EEE/UK/Suisse. Éligibilité IDA à clarifier. Quotas actifs UNKNOWN, aucune activation de facturation.",
    sources: ["https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/terms"],
  },
  {
    ...base,
    key: "mistral",
    name: "Mistral API",
    model: "mistral-small-2603 · référence à qualifier",
    role: "Général / code",
    conditions:
      "Studio annonce 10 USD/mois de crédits, pas un solde IDA. RPM/TPM et date de reset UNKNOWN. Opt-out entraînement et conditions commerciales sans CB à vérifier. PAYG doit rester désactivé.",
    sources: ["https://mistral.ai/pricing/", "https://docs.mistral.ai/admin/billing-usage/subscriptions"],
  },
  {
    ...base,
    key: "mistral-vibe",
    name: "Mistral Vibe",
    model: "Outil de développement, pas un modèle Core",
    role: "Code / refactoring / tests",
    locality: "CODING_TOOL",
    lifecycle: "NEEDS_REVIEW",
    status: "BLOCKED",
    cost: "BLOCKED",
    conditions:
      "CLI non installé. Sessions gratuites limitées, quota UNKNOWN. Intégration dans un produit offert à des tiers restreinte sans autorisation ; sandbox, outils autorisés et validation humaine préalables.",
    sources: [
      "https://docs.mistral.ai/vibe/code/overview",
      "https://legal.mistral.ai/terms/commercial-terms-of-service/",
    ],
  },
  {
    ...base,
    key: "groq",
    name: "Groq",
    model: "openai/gpt-oss-120b · référence à qualifier",
    role: "Inférence texte rapide",
    lifecycle: "NEEDS_REVIEW",
    conditions:
      "Free publié pour ce modèle : 30 RPM, 1 000 RPD, 8 000 TPM, 200 000 TPD. Solde réel UNKNOWN. Contrat destiné aux usages professionnels : qualification de l’usage personnel IDA requise.",
    sources: ["https://console.groq.com/docs/rate-limits", "https://console.groq.com/docs/legal/services-agreement"],
  },
  {
    ...base,
    key: "qwen",
    name: "Alibaba Model Studio",
    model: "qwen-plus · référence à qualifier",
    role: "Raisonnement / code",
    conditions:
      "Essai généralement 1M tokens/modèle éligible, Singapour International. Nouvelles activations depuis le 08/09 : 90 jours. Free Quota Only nécessaire contre le dépassement. Aucun quota acquis ; ancien OAuth Qwen exclu.",
    sources: ["https://www.alibabacloud.com/help/en/model-studio/new-free-quota"],
  },
  {
    ...base,
    key: "qwencloud",
    name: "QwenCloud",
    model: "qwen3.6-plus · référence à qualifier",
    role: "Raisonnement / code",
    conditions:
      "Essai par modèle généralement 90 jours, quantité UNKNOWN. Chez les comptes vérifiés, Free quota only peut être désactivé par défaut : dépassement payant à bloquer. Responses store=true par défaut, conservation à revoir.",
    sources: [
      "https://docs.qwencloud.com/resources/free-quota",
      "https://docs.qwencloud.com/developer-guides/run-and-scale/safety",
    ],
  },
  {
    ...base,
    key: "z-ai",
    name: "Z.ai / GLM",
    model: "glm-4.7-flash · référence à qualifier",
    role: "Raisonnement / code / variantes vision",
    conditions:
      "Tarif nul publié pour GLM-4.7-Flash, 4.5-Flash et 4.6V-Flash. Pas pour tous les Flash : 5.3-Flash payant. RPM/TPM/RPD, CB et admissibilité du compte UNKNOWN. Recherche web intégrée payante exclue.",
    sources: ["https://docs.z.ai/guides/overview/pricing", "https://docs.z.ai/api-reference/introduction"],
  },
  {
    ...base,
    key: "openrouter",
    name: "OpenRouter",
    model: "Variantes :free · aucun slug activé",
    role: "Agrégation de modèles",
    conditions:
      "Gratuit sous conditions : 50 RPD / 20 RPM sans achat. Les échecs consomment aussi le quota. Route finale et politique de données à épingler ; aucun fallback payant, ni route automatique non revue.",
    sources: [
      "https://openrouter.ai/docs/api_reference/limits",
      "https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/",
    ],
  },
  {
    ...base,
    key: "cerebras",
    name: "Cerebras",
    model: "gpt-oss-120b · référence à qualifier",
    role: "Inférence rapide",
    lifecycle: "NEEDS_REVIEW",
    status: "BLOCKED",
    cost: "BLOCKED",
    conditions:
      "Essai de 5 USD valable 30 jours, moyen de paiement vérifié requis. Pas de quota gratuit récurrent. 5 RPM / 30k TPM non cachés annoncés ; solde UNKNOWN. Aucune carte ni souscription ajoutée.",
    sources: ["https://inference-docs.cerebras.ai/support/rate-limits"],
  },
  {
    ...base,
    key: "cloudflare",
    name: "Cloudflare Workers AI",
    model: "@cf/zai-org/glm-4.7-flash · référence",
    role: "Inférence hébergée",
    conditions:
      "Workers Free : 10 000 neurones/jour, reset 00:00 UTC, sans CB. Neurones ≠ tokens. Paid facture le dépassement ; seuls les modèles admissibles Free seraient retenus. Gouverneur en neurones encore PREPARED.",
    sources: ["https://developers.cloudflare.com/workers-ai/platform/pricing/"],
  },
  {
    ...base,
    key: "huggingface",
    name: "Hugging Face",
    model: "Inference Providers · route à qualifier",
    role: "Catalogue de modèles",
    conditions:
      "Crédit annoncé 0,10 USD/mois susceptible de changer. Ce n’est pas un quota de tokens. Solde, modèle, route finale et privacy UNKNOWN ; achat nécessaire au-delà. Gouverneur de crédit monétaire encore PREPARED.",
    sources: ["https://huggingface.co/docs/inference-providers/pricing"],
  },
  {
    ...base,
    key: "modelscope",
    name: "ModelScope",
    model: "API Inference · modèle à qualifier",
    role: "Modèles ouverts / inférence",
    freeTier: "UNKNOWN",
    lifecycle: "NEEDS_REVIEW",
    status: "UNKNOWN",
    conditions:
      "Des quotas historiques de 2024 existent, mais les pages actuelles ne permettent pas de vérifier les conditions. Quotas, modèles, entraînement et usage commercial actuels UNKNOWN. Aucun ancien chiffre utilisé comme disponibilité.",
    sources: ["https://modelscope.cn/docs/model-service/API-Inference/intro"],
  },
  {
    ...base,
    key: "openai",
    name: "OpenAI Astra",
    model: "gpt-6-astra",
    role: "Premium · non activé",
    freeTier: "NONE",
    cost: "PAID",
    status: "BLOCKED",
    conditions:
      "La fiche API indique Free non pris en charge. Un accès dans Codex ne prouve ni quota API gratuit ni autorisation de dépense. Aucun connecteur payant activé.",
    sources: ["https://developers.openai.com/api/docs/models/gpt-6-astra"],
  },
];
