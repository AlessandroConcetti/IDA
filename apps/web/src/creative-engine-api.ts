import {
  type CreativeKind,
  creativeDetailResponseSchema,
  creativeProjectsResponseSchema,
  creativeRecordSchemas,
} from "../../../packages/contracts/src/creative-engine";
import { requestApi } from "./api-transport";

const base = "/v1/creative/projects";
export async function fetchCreativeProjects(signal?: AbortSignal) {
  return creativeProjectsResponseSchema.parse(await requestApi(base, { signal })).data;
}
export async function fetchCreativeDetail(id: string, signal?: AbortSignal) {
  return creativeDetailResponseSchema.parse(await requestApi(`${base}/${encodeURIComponent(id)}`, { signal })).data;
}
export async function saveCreativeRecord(id: string, kind: CreativeKind, body: unknown) {
  const result = await requestApi(`${base}/${encodeURIComponent(id)}/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (typeof result !== "object" || result === null || !("data" in result)) throw new Error("Réponse invalide.");
  return creativeRecordSchemas[kind].parse(result.data);
}
