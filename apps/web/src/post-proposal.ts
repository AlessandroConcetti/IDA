import { IdaApiError, requestApi } from "./api-transport";
import { isCatalogId } from "./catalog-navigation";
import type { MediaAsset } from "./data";

export const proposalPlatforms = ["INSTAGRAM", "TIKTOK", "YOUTUBE"] as const;
export type ProposalFields = {
  mediaId: string;
  postTitle: string;
  platform: (typeof proposalPlatforms)[number];
  caption: string;
  objective: string;
  hashtags: string[];
  cta?: string;
};
export type ProposalReceipt = { postId: string; variantId: string; approvalId: string; replayed: boolean };

export function canPrepareMedia(asset: MediaAsset): boolean {
  return isCatalogId(asset.id, "media") && asset.status !== "ARCHIVED" && ["VIDEO", "IMAGE"].includes(asset.kind);
}

export function validateProposalFields(input: ProposalFields): ProposalFields {
  const result = {
    mediaId: input.mediaId,
    postTitle: input.postTitle.trim(),
    platform: input.platform,
    caption: input.caption.trim(),
    objective: input.objective.trim(),
    hashtags: input.hashtags.map((tag) => tag.trim()).filter(Boolean),
    ...(input.cta?.trim() ? { cta: input.cta.trim() } : {}),
  };
  if (
    !isCatalogId(result.mediaId, "media") ||
    !proposalPlatforms.includes(result.platform) ||
    !result.postTitle ||
    result.postTitle.length > 240 ||
    !result.caption ||
    result.caption.length > 4000 ||
    !result.objective ||
    result.objective.length > 2000 ||
    result.hashtags.length > 30 ||
    result.hashtags.some((tag) => tag.length > 100) ||
    (result.cta?.length ?? 0) > 500
  ) {
    throw new IdaApiError("Complétez le titre, le texte et l’objectif en respectant les limites indiquées.");
  }
  return result;
}

// Une tentative incertaine garde le même contenu et la même clé : aucun retry automatique.
export class PostProposalSubmission {
  private body: string | undefined;
  private pending: Promise<ProposalReceipt> | undefined;
  private receipt: ProposalReceipt | undefined;
  get locked(): boolean {
    return this.body !== undefined;
  }

  constructor(private readonly makeId: () => string = () => crypto.randomUUID()) {}

  submit(fields: ProposalFields): Promise<ProposalReceipt> {
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.pending) return this.pending;
    if (!this.body) this.body = JSON.stringify({ requestId: this.makeId(), ...validateProposalFields(fields) });
    const body = this.body;
    this.pending = requestApi("/v1/post-proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then((payload) => {
        const data = (payload as { data?: ProposalReceipt } | null)?.data;
        if (
          !data ||
          typeof data.postId !== "string" ||
          !/^post_[a-f0-9]{64}$/.test(data.postId) ||
          typeof data.variantId !== "string" ||
          !/^variant_[a-f0-9]{64}$/.test(data.variantId) ||
          typeof data.approvalId !== "string" ||
          !/^apr_[a-f0-9]{64}$/.test(data.approvalId) ||
          typeof data.replayed !== "boolean"
        ) {
          throw new IdaApiError("Le reçu est indisponible. Vérifiez les propositions avant de recommencer.");
        }
        this.receipt = {
          postId: data.postId,
          variantId: data.variantId,
          approvalId: data.approvalId,
          replayed: data.replayed,
        };
        return this.receipt;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
}
