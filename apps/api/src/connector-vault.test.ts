import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { windowsHomeAssistantSecret } from "./connector-vault.js";

const execute = promisify(execFile);
describe("Coffre connecteur — fixture DPAPI sans credential utilisateur", () => {
  it("refuse racine relative et workspace invalide", () => {
    expect(() => windowsHomeAssistantSecret("relative", "wsp_fixture")).toThrow();
    expect(() => windowsHomeAssistantSecret(tmpdir(), "../../unsafe")).toThrow();
  });
  it.runIf(process.platform === "win32")(
    "respecte la politique Windows, sans contourner le refus de déchiffrement",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ida-vault-fixture-"));
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("ida-vault-fixture-"))
        throw new Error("UNEXPECTED_FIXTURE_PATH");
      try {
        const vault = windowsHomeAssistantSecret(root, "wsp_fixture");
        expect(await vault.available()).toBe(false);
        const protectedFixture = await execute(
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Import-Module 'C:/Windows/System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1' -ErrorAction Stop; ConvertFrom-SecureString (ConvertTo-SecureString 'SYNTHETIC_DPAPI_FIXTURE_ONLY' -AsPlainText -Force)",
          ],
          { windowsHide: true, timeout: 5000 },
        );
        const path = join(root, "wsp_fixture.home-assistant.dpapi");
        await writeFile(path, protectedFixture.stdout.trim(), { flag: "wx" });
        expect(await vault.available()).toBe(true);
        const policy = await execute(
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Import-Module 'C:/Windows/System32/WindowsPowerShell/v1.0/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1' -ErrorAction Stop; Get-ExecutionPolicy",
          ],
          { windowsHide: true, timeout: 5000 },
        );
        if (["Restricted", "AllSigned"].includes(policy.stdout.trim())) {
          // Le helper local n'est pas signé. Ce cas vérifie le refus fermé, PAS une lecture DPAPI réussie.
          await expect(vault.resolve(AbortSignal.timeout(5000))).rejects.toThrow("HOME_SECRET_UNAVAILABLE");
        } else {
          expect(await vault.resolve(AbortSignal.timeout(5000))).toBe("SYNTHETIC_DPAPI_FIXTURE_ONLY");
        }
        await expect(vault.resolve(AbortSignal.abort())).rejects.toThrow();
        await writeFile(path, "not-dpapi");
        await expect(vault.resolve(AbortSignal.timeout(5000))).rejects.toThrow("HOME_SECRET_UNAVAILABLE");
      } finally {
        // Répertoire temporaire créé dans ce test, aucun coffre ou fichier utilisateur.
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
