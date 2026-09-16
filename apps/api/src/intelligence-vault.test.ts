import { type ChildProcess, type ExecFileOptions, execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type IntelligenceSecretProvider,
  intelligenceSecretProviders,
  type VoiceSecretProvider,
  voiceSecretProviders,
  windowsIntelligenceSecret,
  windowsVoiceSecret,
} from "./connector-vault.js";

vi.mock("node:fs/promises", () => ({ lstat: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

type Completion = (error: Error | null, stdout: string, stderr: string) => void;
type Invocation = { executable: string; args: readonly string[]; options: ExecFileOptions; complete: Completion };
const originalPlatform = process.platform;
const root = resolve("synthetic vault's directory");
const workspaceId = "wsp_synthetic_fixture";
const syntheticSecret = "SYNTHETIC_TEST_VALUE_NEVER_A_USER_CREDENTIAL";
const metadata = vi.mocked(lstat);
const execute = vi.mocked(execFile);
const invocations: Invocation[] = [];
let onExecute: (invocation: Invocation) => void;

function file(size = 128, regular = true, symbolic = false): Awaited<ReturnType<typeof lstat>> {
  return { size, isFile: () => regular, isSymbolicLink: () => symbolic } as Awaited<ReturnType<typeof lstat>>;
}
function invocation(): Invocation {
  const item = invocations[0];
  if (!item) throw new Error("Missing mocked process invocation");
  return item;
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
function vault(provider: IntelligenceSecretProvider = "groq") {
  return windowsIntelligenceSecret(root, workspaceId, provider);
}
function voiceVault(provider: VoiceSecretProvider = "elevenlabs") {
  return windowsVoiceSecret(root, workspaceId, provider);
}

beforeEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  invocations.length = 0;
  metadata.mockReset().mockResolvedValue(file());
  execute.mockReset();
  onExecute = ({ complete }) => complete(null, `  ${syntheticSecret}\r\n`, "");
  execute.mockImplementation(((
    executable: string,
    args: readonly string[],
    options: ExecFileOptions,
    complete: Completion,
  ) => {
    const item = { executable, args, options, complete };
    invocations.push(item);
    onExecute(item);
    return {} as ChildProcess;
  }) as typeof execFile);
});
afterEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
});

describe("Intelligence vault, mocked metadata and processes only", () => {
  it("declares an explicit provider allowlist", () => {
    expect(intelligenceSecretProviders).toEqual(["groq", "gemini", "mistral", "openai"]);
    expect(voiceSecretProviders).toEqual(["elevenlabs"]);
    expect(metadata).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps voice credentials outside the LLM provider allowlist", async () => {
    const secret = voiceVault();
    expect(await secret.available()).toBe(true);
    expect(metadata).toHaveBeenCalledExactlyOnceWith(resolve(root, `${workspaceId}.elevenlabs.dpapi`));
    expect(execute).not.toHaveBeenCalled();
    expect(() => windowsVoiceSecret(root, workspaceId, "mistral" as VoiceSecretProvider)).toThrow(
      "INVALID_VAULT_BINDING",
    );
  });

  it.each(["other", "GROQ", "../groq", "groq/other", "groq.dpapi", "", "groq\n"])(
    "rejects unsupported provider %s without filesystem or process access",
    (provider) => {
      expect(() => windowsIntelligenceSecret(root, workspaceId, provider as IntelligenceSecretProvider)).toThrow(
        "INVALID_VAULT_BINDING",
      );
      expect(metadata).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each(["", "relative", ".", "../vault"])("rejects relative vault root %s", (vaultRoot) => {
    expect(() => windowsIntelligenceSecret(vaultRoot, workspaceId, "groq")).toThrow("INVALID_VAULT_BINDING");
    expect(metadata).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "wsp_",
    "workspace_fixture",
    "../wsp_fixture",
    "wsp_x/../other",
    "wsp_x\\other",
    "wsp_x:stream",
    "wsp_x\n",
  ])("rejects malformed workspace %s", (workspace) => {
    expect(() => windowsIntelligenceSecret(root, workspace, "groq")).toThrow("INVALID_VAULT_BINDING");
    expect(metadata).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(intelligenceSecretProviders)("binds metadata to the exact workspace and %s provider", async (provider) => {
    const secret = vault(provider);
    expect(metadata).not.toHaveBeenCalled();
    expect(await secret.available()).toBe(true);
    expect(metadata).toHaveBeenCalledExactlyOnceWith(resolve(root, `${workspaceId}.${provider}.dpapi`));
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not inspect the filesystem or decrypt on a non-Windows host", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    expect(await vault().available()).toBe(false);
    await expect(vault().resolve(new AbortController().signal)).rejects.toThrow("INTELLIGENCE_SECRET_UNAVAILABLE");
    expect(metadata).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("treats absent files and metadata errors as unavailable without exposing the cause", async () => {
    metadata.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_FILE_ERROR"));
    expect(await vault().available()).toBe(false);
    await expect(vault().resolve(new AbortController().signal)).rejects.toThrow(/^INTELLIGENCE_SECRET_UNAVAILABLE$/u);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { label: "directory", size: 128, regular: false, symbolic: false },
    { label: "symbolic link", size: 128, regular: true, symbolic: true },
    { label: "empty", size: 0, regular: true, symbolic: false },
    { label: "negative size", size: -1, regular: true, symbolic: false },
    { label: "at limit", size: 32768, regular: true, symbolic: false },
    { label: "over limit", size: 32769, regular: true, symbolic: false },
  ])("rejects $label before process creation", async ({ size, regular, symbolic }) => {
    metadata.mockResolvedValue(file(size, regular, symbolic));
    expect(await vault().available()).toBe(false);
    await expect(vault().resolve(new AbortController().signal)).rejects.toThrow("INTELLIGENCE_SECRET_UNAVAILABLE");
    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts only a nonempty regular encrypted file below the size limit", async () => {
    metadata.mockResolvedValueOnce(file(1)).mockResolvedValueOnce(file(32767));
    expect(await vault().available()).toBe(true);
    expect(await vault().available()).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(intelligenceSecretProviders)(
    "decrypts %s only through the fixed helper and expurgates process metadata",
    async (provider) => {
      const signal = new AbortController().signal;
      expect(await vault(provider).resolve(signal)).toBe(syntheticSecret);
      expect(execute).toHaveBeenCalledOnce();
      expect(invocation()).toEqual({
        executable: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          fileURLToPath(new URL("../../../scripts/read-home-assistant-secret.ps1", import.meta.url)),
          "-Path",
          resolve(root, `${workspaceId}.${provider}.dpapi`),
        ],
        options: { windowsHide: true, timeout: 5000, maxBuffer: 16384, signal },
        complete: expect.any(Function),
      });
      expect(invocation().options).not.toHaveProperty("env");
      expect(invocation().options).not.toHaveProperty("shell");
      expect(JSON.stringify(invocation().args)).not.toContain(syntheticSecret);
      expect(invocation().args).not.toContain("-Command");
      expect(invocation().args).not.toContain("-ExecutionPolicy");
    },
  );

  it("rejects a request cancelled before metadata inspection", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(vault().resolve(controller.signal)).rejects.toThrow();
    expect(metadata).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not start decryption if cancellation occurs during metadata inspection", async () => {
    let release: () => void = () => {};
    metadata.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = () => done(file());
        }),
    );
    const controller = new AbortController();
    const pending = vault().resolve(controller.signal);
    const assertion = expect(pending).rejects.toThrow();
    controller.abort();
    release();
    await assertion;
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes cancellation to the child and never returns late secret output", async () => {
    onExecute = () => {};
    const controller = new AbortController();
    const pending = vault().resolve(controller.signal);
    const assertion = expect(pending).rejects.toThrow(/^INTELLIGENCE_SECRET_UNAVAILABLE$/u);
    await flush();
    expect(invocation().options.signal).toBe(controller.signal);
    controller.abort();
    invocation().complete(null, syntheticSecret, "SYNTHETIC_PRIVATE_STDERR");
    await assertion;
  });

  it.each(["", " \r\n\t"])("rejects empty stdout without exposing stderr", async (stdout) => {
    onExecute = ({ complete }) => complete(null, stdout, "SYNTHETIC_PRIVATE_STDERR");
    await expect(vault().resolve(new AbortController().signal)).rejects.toThrow(/^INTELLIGENCE_SECRET_UNAVAILABLE$/u);
  });

  it("discards process error, stdout, stderr and their private causes", async () => {
    onExecute = ({ complete }) =>
      complete(
        new Error("SYNTHETIC_PRIVATE_ERROR", { cause: new Error("SYNTHETIC_PRIVATE_CAUSE") }),
        syntheticSecret,
        "SYNTHETIC_PRIVATE_STDERR",
      );
    let failure: unknown;
    try {
      await vault().resolve(new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toBe("Error: INTELLIGENCE_SECRET_UNAVAILABLE");
    expect(failure).not.toHaveProperty("cause");
    expect(execute).toHaveBeenCalledOnce();
  });
});
