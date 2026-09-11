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
  if (!isAbsolute(vaultRoot) || !/^wsp_[a-z0-9_]+$/i.test(workspaceId)) throw new Error("INVALID_VAULT_BINDING");
  const path = resolve(vaultRoot, `${workspaceId}.home-assistant.dpapi`);
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
      if (!(await available())) throw new Error("HOME_SECRET_UNAVAILABLE");
      return await new Promise<string>((done, reject) => {
        // Aucun shell interpolé et aucun token dans les arguments ou l'environnement.
        execFile(
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
          ["-NoProfile", "-NonInteractive", "-File", script, "-Path", path],
          { windowsHide: true, timeout: 5000, maxBuffer: 16_384, signal },
          (error, stdout) => {
            if (error || signal.aborted) reject(new Error("HOME_SECRET_UNAVAILABLE"));
            else done(stdout.trim());
          },
        );
      });
    },
  };
}
