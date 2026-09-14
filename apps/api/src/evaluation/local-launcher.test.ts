import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const launcherPath = fileURLToPath(new URL("../../../../scripts/start-local-ida.ps1", import.meta.url));
const launcher = readFileSync(launcherPath, "utf8");
const powershell = [
  resolve(dirname(process.execPath), "../../native/powershell/pwsh.exe"),
  resolve(process.env.ProgramFiles ?? "C:/Program Files", "PowerShell/7/pwsh.exe"),
].find((candidate) => existsSync(candidate));

function assignment(name: string): string {
  const match = launcher.match(new RegExp(`^\\s*(\\$${name} = [^\\r\\n]+)$`, "m"));
  expect(match, `Missing assignment: ${name}`).not.toBeNull();
  return match?.[1] ?? "";
}

function assertLoaderExpressions(): void {
  // Only these side-effect-free expressions may be evaluated by the Windows case.
  expect(assignment("idaLoaderUrl")).toBe("$idaLoaderUrl = ([Uri]$idaLoader).AbsoluteUri");
  expect(assignment("idaArgs")).toBe("$idaArgs = '--import \"' + $idaLoaderUrl + '\" \"' + $idaEntry + '\"'");
}

describe("reviewed local launcher regression guards (no runtime activation)", () => {
  it("converts the Windows loader path to a file URL before constructing --import", () => {
    assertLoaderExpressions();
    expect(launcher).toContain("-ArgumentList $idaArgs");
  });

  it("keeps local inference explicit and disables cloud in both child environments", () => {
    expect(launcher).toMatch(/\[switch\]\$EnableLocalDialogue\s*,/);
    expect(launcher).toContain("IDA_LOCAL_DIALOGUE = $(if ($EnableLocalDialogue) { '1' } else { '0' })");
    expect(launcher.match(/OLLAMA_NO_CLOUD = '1'/g)).toHaveLength(2);
    expect(launcher).toMatch(/if \(\$EnableLocalDialogue\) \{\s*\$idaDaemon = Start-Process/);
  });

  it("keeps probes and daemon binding on numeric loopback with socket ownership checks", () => {
    expect(launcher).toContain("OLLAMA_HOST = '127.0.0.1:11434'");
    expect(launcher).toContain("'http://127.0.0.1:' + $Port + $Path");
    expect(launcher).toContain("-NoProxy -MaximumRedirection 0");
    expect(launcher).toContain("$idaSocket[0].OwningProcess -ne $idaDaemon.Id");
    expect(launcher).toContain("$idaSocket[0].OwningProcess -ne $idaApi.Id");
    expect(launcher.match(/\$idaSocket\[0\]\.LocalAddress -ne '127\.0\.0\.1'/g)).toHaveLength(2);
  });

  it("refuses occupied ports and rolls back only its own processes in reverse order", () => {
    expect(launcher).toContain("throw 'IDA_ALREADY_RUNNING_STOP_AND_BACKUP_FIRST'");
    expect(launcher).toContain("throw 'OLLAMA_ALREADY_RUNNING_NEEDS_REVIEW'");
    expect(launcher).toContain("$idaStarted.Add($idaDaemon)");
    expect(launcher).toContain("$idaStarted.Add($idaApi)");
    expect(launcher).toMatch(/for \(\$idaIndex = \$idaStarted\.Count - 1; \$idaIndex -ge 0; \$idaIndex--\)/);
    expect(launcher).toContain("$idaProcess = $idaStarted[$idaIndex]");
    expect(launcher).toContain("throw $idaFailure");
    expect(launcher).not.toMatch(/\b(?:Stop-Process|Remove-Item|Invoke-Expression)\b/i);
  });

  it("does not introduce installation, firewall, Tailscale, or public exposure commands", () => {
    expect(launcher).not.toMatch(
      /\b(?:tailscale(?:\.exe)?|funnel|winget|msiexec|New-NetFirewallRule|Set-NetFirewallProfile|netsh)\b/i,
    );
    expect(launcher).toContain("State = 'STARTED_NOT_BROWSER_VERIFIED'");
    expect(launcher).toContain("ExternalAccessVerified = $false");
  });

  it.skipIf(process.platform !== "win32" || !powershell)(
    "parses the complete PowerShell file and evaluates only ESM arguments for a path with spaces",
    () => {
      assertLoaderExpressions();
      const script = `
$ErrorActionPreference = 'Stop'
$idaTokens = $null
$idaErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($env:IDA_LAUNCHER_UNDER_TEST, [ref]$idaTokens, [ref]$idaErrors) | Out-Null
if ($idaErrors.Count -ne 0) { throw 'LAUNCHER_PARSE_ERROR' }
$idaLoader = 'C:\\IDA Workspace\\node_modules\\tsx\\loader.mjs'
$idaEntry = 'C:\\IDA Workspace\\apps\\api\\src\\local-preview.ts'
${assignment("idaLoaderUrl")}
${assignment("idaArgs")}
[pscustomobject]@{ loaderUrl = $idaLoaderUrl; arguments = $idaArgs } | ConvertTo-Json -Compress
`;
      // This starts only the local parser/expression interpreter, never the launcher,
      // Node, Ollama, listeners, or a request to an existing service.
      const output = execFileSync(powershell as string, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"], {
        input: script,
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, IDA_LAUNCHER_UNDER_TEST: launcherPath },
      });
      const result = JSON.parse(output.trim());
      expect(result.loaderUrl).toBe("file:///C:/IDA%20Workspace/node_modules/tsx/loader.mjs");
      expect(result.arguments).toBe(
        '--import "file:///C:/IDA%20Workspace/node_modules/tsx/loader.mjs" "C:\\IDA Workspace\\apps\\api\\src\\local-preview.ts"',
      );
    },
  );
});
