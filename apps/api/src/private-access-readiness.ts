import { lstat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { loadHomeAssistantBinding } from "./home-assistant-config.js";
import { homeAssistantTargetPrerequisites } from "./home-assistant-transport.js";
import type { HomeAssistantBinding } from "./home-device.js";

type FileEvidence = "PRESENT" | "MISSING" | "UNKNOWN";
type ConfigurationEvidence = "LOADED" | "MISSING" | "INVALID_OR_UNREADABLE" | "UNKNOWN";
type CredentialEvidence = "STORED" | "MISSING" | "UNKNOWN" | "NOT_CHECKED";

export type PrivateAccessEvidence = Readonly<{
  tailscale: FileEvidence | "UNSUPPORTED_PLATFORM";
  configuration: ConfigurationEvidence;
  enabled?: boolean;
  target?: Pick<HomeAssistantBinding, "origin" | "address" | "entityId">;
  credential: CredentialEvidence;
}>;

/** This report is preparation metadata, never a network exposure authorization. */
export function assessPrivateAccessReadiness(evidence: PrivateAccessEvidence) {
  const target =
    evidence.configuration === "LOADED" && evidence.target
      ? homeAssistantTargetPrerequisites(evidence.target)
      : undefined;
  const configuration =
    target?.configuration ??
    (evidence.configuration === "MISSING"
      ? "REQUIRED"
      : evidence.configuration === "INVALID_OR_UNREADABLE"
        ? "INVALID_OR_UNREADABLE"
        : "UNKNOWN");
  return {
    version: 1 as const,
    runtime: "LOCAL_ONLY" as const,
    networkGate: "NOT_IMPLEMENTED" as const,
    outsideTest: "NOT_PERFORMED" as const,
    tailscale: {
      executable: evidence.tailscale,
      connection: "NOT_VERIFIED" as const,
    },
    homeAssistant: {
      configuration,
      enabled:
        evidence.configuration === "LOADED"
          ? evidence.enabled === true
            ? ("ENABLED" as const)
            : evidence.enabled === false
              ? ("DISABLED" as const)
              : ("UNKNOWN" as const)
          : ("NOT_CHECKED" as const),
      tls: target?.tls ?? (evidence.configuration === "MISSING" ? ("REQUIRED" as const) : ("UNKNOWN" as const)),
      target: target?.target ?? (evidence.configuration === "MISSING" ? ("REQUIRED" as const) : ("UNKNOWN" as const)),
      credential:
        evidence.configuration === "LOADED" && evidence.enabled === true
          ? evidence.credential
          : ("NOT_CHECKED" as const),
      credentialAccess: "NOT_VERIFIED" as const,
      verification: "NOT_PERFORMED" as const,
    },
  };
}

type Metadata = { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number };
type InspectionDependencies = {
  platform: NodeJS.Platform;
  metadata: (path: string) => Promise<Metadata>;
  loadBinding: typeof loadHomeAssistantBinding;
};
const defaults: InspectionDependencies = {
  platform: process.platform,
  metadata: lstat,
  loadBinding: loadHomeAssistantBinding,
};

async function inspectMetadata(
  path: string,
  kind: "file" | "directory",
  dependencies: InspectionDependencies,
  maxBytes?: number,
): Promise<FileEvidence> {
  try {
    const file = await dependencies.metadata(path);
    if (file.isSymbolicLink() || !(kind === "file" ? file.isFile() : file.isDirectory())) return "UNKNOWN";
    if (maxBytes !== undefined && (file.size <= 0 || file.size >= maxBytes)) return "UNKNOWN";
    return "PRESENT";
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? "MISSING" : "UNKNOWN";
  }
}

/** No process execution, discovery, network, secret resolution or state mutation. */
export async function inspectPrivateAccessReadiness(
  privateRoot: string,
  workspaceId: string,
  dependencies: InspectionDependencies = defaults,
) {
  if (!isAbsolute(privateRoot) || !/^wsp_[a-z0-9_]+$/i.test(workspaceId)) throw new Error("INVALID_READINESS_BINDING");
  let tailscale: PrivateAccessEvidence["tailscale"] = "UNSUPPORTED_PLATFORM";
  if (dependencies.platform === "win32") {
    // Deliberately not PATH, registry, CLI, service status or a network call.
    const candidates = await Promise.all(
      ["C:/Program Files/Tailscale/tailscale.exe", "C:/Program Files (x86)/Tailscale/tailscale.exe"].map((path) =>
        inspectMetadata(path, "file", dependencies),
      ),
    );
    tailscale = candidates.includes("PRESENT") ? "PRESENT" : candidates.includes("UNKNOWN") ? "UNKNOWN" : "MISSING";
  }
  let configuration: ConfigurationEvidence = "UNKNOWN";
  let binding: HomeAssistantBinding | undefined;
  let credential: CredentialEvidence = "NOT_CHECKED";
  const directory = await inspectMetadata(privateRoot, "directory", dependencies);
  const configFile =
    directory === "PRESENT"
      ? await inspectMetadata(resolve(privateRoot, "home-assistant.json"), "file", dependencies, 4097)
      : directory;
  if (configFile === "MISSING") configuration = "MISSING";
  if (configFile === "PRESENT") {
    try {
      binding = await dependencies.loadBinding(privateRoot, workspaceId);
      configuration = binding ? "LOADED" : "INVALID_OR_UNREADABLE";
    } catch {
      configuration = "UNKNOWN";
    }
  }
  if (binding && binding.workspaceId !== workspaceId) {
    configuration = "UNKNOWN";
    binding = undefined;
  }
  if (binding?.enabled) {
    const vaultRoot = resolve(privateRoot, "connector-secrets");
    const vault = await inspectMetadata(vaultRoot, "directory", dependencies);
    const protectedFile =
      vault === "PRESENT"
        ? await inspectMetadata(resolve(vaultRoot, `${workspaceId}.home-assistant.dpapi`), "file", dependencies, 32768)
        : vault;
    credential = protectedFile === "MISSING" ? "MISSING" : "UNKNOWN";
    if (protectedFile === "PRESENT") {
      try {
        // available() checks metadata only. Never call resolve() in a diagnostic.
        credential = (await binding.secret.available()) ? "STORED" : "UNKNOWN";
      } catch {
        credential = "UNKNOWN";
      }
    }
  }
  return assessPrivateAccessReadiness({
    tailscale,
    configuration,
    ...(binding ? { enabled: binding.enabled, target: binding } : {}),
    credential,
  });
}
