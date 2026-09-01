import {
  type ContentRotationCandidate as ContentRotationCandidateContract,
  contentRotationCandidateSchema,
} from "@ida/contracts";

import type { ContentRotationCandidate } from "./database.js";

// Une seule frontière de présentation est partagée par la route de rotation
// et IDA Core : le record de base conserve ses noms internes, cette projection
// n'expose que le contrat réduit autorisé au client.
export function toContentRotationCandidateResponse(
  candidate: ContentRotationCandidate,
): ContentRotationCandidateContract {
  return contentRotationCandidateSchema.parse({
    id: candidate.id,
    filename: candidate.filename,
    type: candidate.mediaType,
    ...(candidate.description === null ? {} : { description: candidate.description }),
    tags: candidate.tags,
    createdAt: candidate.createdAt,
    state: candidate.state,
  });
}
