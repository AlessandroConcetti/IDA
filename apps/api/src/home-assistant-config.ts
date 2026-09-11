import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { windowsHomeAssistantSecret } from "./connector-vault.js";
import type { HomeAssistantBinding } from "./home-device.js";

/** Configuration privée opérateur, jamais acceptée par HTTP, un agent ou un prompt. */
export async function loadHomeAssistantBinding(
  privateRoot: string,
  workspaceId: string,
): Promise<HomeAssistantBinding | undefined> {
  const path = resolve(privateRoot, "home-assistant.json");
  try {
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink() || file.size > 4096) return undefined;
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const data = value as Record<string, unknown>;
    if (
      Object.keys(data).some((key) => !["enabled", "origin", "address", "entityId"].includes(key)) ||
      typeof data.enabled !== "boolean" ||
      typeof data.origin !== "string" ||
      typeof data.address !== "string" ||
      typeof data.entityId !== "string"
    )
      return undefined;
    return Object.freeze({
      workspaceId,
      enabled: data.enabled,
      origin: data.origin,
      address: data.address,
      entityId: data.entityId,
      secret: windowsHomeAssistantSecret(resolve(privateRoot, "connector-secrets"), workspaceId),
    });
  } catch {
    return undefined;
  }
}
