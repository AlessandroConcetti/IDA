import { musicFollowupQuerySchema } from "@ida/contracts";
import { onWorkspaceInvalidated } from "./api-transport";

type Target = "music" | "workspace";
let pending: { target: Target; id: string; expires: number } | null = null;
export function queueMusicFollowupNavigation(target: Target, id: string) {
  const schema =
    target === "music" ? musicFollowupQuerySchema.shape.musicContactId : musicFollowupQuerySchema.shape.taskId;
  if (schema.safeParse(id).success) pending = { target, id, expires: Date.now() + 300000 };
}
export function consumeMusicFollowupNavigation(target: Target): string | undefined {
  if (pending && pending.expires <= Date.now()) pending = null;
  if (!pending || pending.target !== target) return;
  const id = pending.id;
  pending = null;
  return id;
}
onWorkspaceInvalidated(() => {
  pending = null;
});
