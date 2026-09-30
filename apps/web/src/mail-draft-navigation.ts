import { workspaceMailDraftParamsSchema } from "@ida/contracts";
import { onWorkspaceInvalidated } from "./api-transport";

let pending: { id: string; expires: number } | null = null;
export function queueMailDraftNavigation(id: string) {
  if (workspaceMailDraftParamsSchema.safeParse({ draftId: id }).success) pending = { id, expires: Date.now() + 300000 };
}
export function consumeMailDraftNavigation(): string | undefined {
  const value = pending;
  pending = null;
  return value && value.expires > Date.now() ? value.id : undefined;
}
onWorkspaceInvalidated(() => {
  pending = null;
});
