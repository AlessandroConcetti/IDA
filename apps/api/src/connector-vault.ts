import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ConnectorSecret {
  available(): Promise<boolean>;
  resolve(signal: AbortSignal): Promise<string>;
}

/** Windows DPAPI CurrentUser : fichier chiffré privé, déchiffrement au dernier moment. */
export function windowsHomeAssistantSecret(vaultRoot: string, workspaceId: string): ConnectorSecret {
  return windowsConnectorSecret(vaultRoot, workspaceId, "home-assistant", "HOME_SECRET_UNAVAILABLE");
}

export const intelligenceSecretProviders = ["groq", "gemini", "mistral", "openai"] as const;
export type IntelligenceSecretProvider = (typeof intelligenceSecretProviders)[number];

/** Voice providers use the same DPAPI vault, but are not LLM registrations. */
export const voiceSecretProviders = ["elevenlabs"] as const;
export type VoiceSecretProvider = (typeof voiceSecretProviders)[number];

/** Même coffre DPAPI que les connecteurs ; aucun secret issu du navigateur ou de l'environnement. */
export function windowsIntelligenceSecret(
  vaultRoot: string,
  workspaceId: string,
  provider: IntelligenceSecretProvider,
): ConnectorSecret {
  if (!intelligenceSecretProviders.includes(provider)) throw new Error("INVALID_VAULT_BINDING");
  return windowsConnectorSecret(vaultRoot, workspaceId, provider, "INTELLIGENCE_SECRET_UNAVAILABLE");
}

/** ElevenLabs credential is isolated from the text-model provider registry. */
export function windowsVoiceSecret(
  vaultRoot: string,
  workspaceId: string,
  provider: VoiceSecretProvider,
): ConnectorSecret {
  if (!voiceSecretProviders.includes(provider)) throw new Error("INVALID_VAULT_BINDING");
  return windowsConnectorSecret(vaultRoot, workspaceId, provider, "VOICE_SECRET_UNAVAILABLE");
}

function windowsConnectorSecret(
  vaultRoot: string,
  workspaceId: string,
  connector: string,
  unavailableCode: string,
): ConnectorSecret {
  if (!isAbsolute(vaultRoot) || !/^wsp_[a-z0-9_]+$/i.test(workspaceId)) throw new Error("INVALID_VAULT_BINDING");
  const path = resolve(vaultRoot, `${workspaceId}.${connector}.dpapi`);
  const script = fileURLToPath(new URL("../../../scripts/read-home-assistant-secret.ps1", import.meta.url));
  async function available() {
    if (process.platform !== "win32") return false;
    try {
      const file = await lstat(path);
      return file.isFile() && !file.isSymbolicLink() && file.size > 0 && file.size < 32_768;
    } catch {
      return false;
    }
  }
  return {
    available,
    async resolve(signal) {
      signal.throwIfAborted();
      if (!(await available())) throw new Error(unavailableCode);
      signal.throwIfAborted();
      return await new Promise<string>((done, reject) => {
        // Aucun shell interpolé et aucun token dans les arguments ou l'environnement.
        execFile(
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
          ["-NoProfile", "-NonInteractive", "-File", script, "-Path", path],
          { windowsHide: true, timeout: 5000, maxBuffer: 16_384, signal },
          (error, stdout) => {
            if (error || signal.aborted || !stdout.trim()) reject(new Error(unavailableCode));
            else done(stdout.trim());
          },
        );
      });
    },
  };
}
