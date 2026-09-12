import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HomeAssistantBinding } from "./home-device.js";
import { assessPrivateAccessReadiness, inspectPrivateAccessReadiness } from "./private-access-readiness.js";

const root = resolve(".data-readiness-synthetic");
const workspaceId = "wsp_readiness_fixture";
const file = { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 256 };
const directory = { ...file, isFile: () => false, isDirectory: () => true };
const absent = () => Promise.reject(Object.assign(new Error("private filesystem detail"), { code: "ENOENT" }));
const denied = () => Promise.reject(Object.assign(new Error("private filesystem detail"), { code: "EACCES" }));
function setup() {
  const available = vi.fn(async () => true);
  const decrypt = vi.fn(async () => {
    throw new Error("MUST_NOT_RESOLVE_SECRET");
  });
  const binding: HomeAssistantBinding = {
    workspaceId,
    enabled: true,
    origin: "https://private-home.example.invalid",
    address: "192.168.222.9",
    entityId: "light.private_fixture",
    secret: { available, resolve: decrypt },
  };
  const loadBinding = vi.fn(async () => binding as HomeAssistantBinding | undefined);
  const metadata = vi.fn(async (path: string) =>
    path === root || path === resolve(root, "connector-secrets") ? directory : file,
  );
  return {
    available,
    decrypt,
    binding,
    loadBinding,
    metadata,
    dependencies: { platform: "win32" as const, loadBinding, metadata },
  };
}

describe("Private access readiness — metadata only, fail closed", () => {
  it("never promotes preparation evidence to an active connection or exposed runtime", () => {
    const result = assessPrivateAccessReadiness({
      tailscale: "PRESENT",
      configuration: "LOADED",
      enabled: true,
      target: setup().binding,
      credential: "STORED",
    });
    expect(result).toMatchObject({
      runtime: "LOCAL_ONLY",
      networkGate: "NOT_IMPLEMENTED",
      outsideTest: "NOT_PERFORMED",
      tailscale: { executable: "PRESENT", connection: "NOT_VERIFIED" },
      homeAssistant: {
        configuration: "CONFIGURED",
        tls: "CONFIGURED",
        target: "CONFIGURED",
        credential: "STORED",
        credentialAccess: "NOT_VERIFIED",
        verification: "NOT_PERFORMED",
      },
    });
  });
  it("reads only fixed file metadata and availability, not the credential", async () => {
    const fixture = setup();
    const result = await inspectPrivateAccessReadiness(root, workspaceId, fixture.dependencies);
    expect(fixture.loadBinding).toHaveBeenCalledWith(root, workspaceId);
    expect(fixture.available).toHaveBeenCalledOnce();
    expect(fixture.decrypt).not.toHaveBeenCalled();
    expect(fixture.metadata.mock.calls.map(([path]) => path)).toEqual([
      "C:/Program Files/Tailscale/tailscale.exe",
      "C:/Program Files (x86)/Tailscale/tailscale.exe",
      root,
      resolve(root, "home-assistant.json"),
      resolve(root, "connector-secrets"),
      resolve(root, "connector-secrets", `${workspaceId}.home-assistant.dpapi`),
    ]);
    const output = JSON.stringify(result);
    for (const privateValue of [
      root,
      workspaceId,
      fixture.binding.origin,
      fixture.binding.address,
      fixture.binding.entityId,
      "Program Files",
    ]) {
      expect(output).not.toContain(privateValue);
    }
  });
  it("distinguishes missing files from inaccessible files", async () => {
    const fixture = setup();
    const missing = await inspectPrivateAccessReadiness(root, workspaceId, {
      ...fixture.dependencies,
      metadata: absent,
    });
    expect(missing.tailscale.executable).toBe("MISSING");
    expect(missing.homeAssistant.configuration).toBe("REQUIRED");
    const unknown = await inspectPrivateAccessReadiness(root, workspaceId, {
      ...fixture.dependencies,
      metadata: denied,
    });
    expect(unknown.tailscale.executable).toBe("UNKNOWN");
    expect(unknown.homeAssistant.configuration).toBe("UNKNOWN");
    expect(fixture.loadBinding).not.toHaveBeenCalled();
    expect(fixture.available).not.toHaveBeenCalled();
  });
  it("does not follow links or classify a malformed/unreadable config as absent", async () => {
    const fixture = setup();
    fixture.metadata.mockImplementation(async () => ({ ...file, isSymbolicLink: () => true }));
    expect(
      (await inspectPrivateAccessReadiness(root, workspaceId, fixture.dependencies)).homeAssistant.configuration,
    ).toBe("UNKNOWN");
    expect(fixture.loadBinding).not.toHaveBeenCalled();
    const malformed = setup();
    malformed.loadBinding.mockResolvedValue(undefined);
    expect(
      (await inspectPrivateAccessReadiness(root, workspaceId, malformed.dependencies)).homeAssistant.configuration,
    ).toBe("INVALID_OR_UNREADABLE");
  });
  it("keeps credential failures unknown and never decrypts", async () => {
    for (const mode of ["denied", "false", "throw"] as const) {
      const fixture = setup();
      if (mode === "denied")
        fixture.metadata.mockImplementation(async (path) =>
          path.endsWith(".dpapi")
            ? denied()
            : directory.isDirectory() && (path === root || path.endsWith("connector-secrets"))
              ? directory
              : file,
        );
      if (mode === "false") fixture.available.mockResolvedValue(false);
      if (mode === "throw") fixture.available.mockRejectedValue(new Error("private credential failure"));
      const result = await inspectPrivateAccessReadiness(root, workspaceId, fixture.dependencies);
      expect(result.homeAssistant.credential).toBe("UNKNOWN");
      expect(fixture.decrypt).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("private");
    }
  });
  it("does not inspect a disabled or wrong-workspace vault", async () => {
    for (const binding of [{ enabled: false }, { workspaceId: "wsp_different" }]) {
      const fixture = setup();
      fixture.loadBinding.mockResolvedValue({ ...fixture.binding, ...binding });
      const result = await inspectPrivateAccessReadiness(root, workspaceId, fixture.dependencies);
      expect(result.homeAssistant.credential).toBe("NOT_CHECKED");
      expect(fixture.available).not.toHaveBeenCalled();
      expect(fixture.metadata.mock.calls.some(([path]) => path.includes("connector-secrets"))).toBe(false);
    }
  });
  it("reports HTTP and missing target independently; missing target evidence cannot look ready", () => {
    const result = assessPrivateAccessReadiness({
      tailscale: "MISSING",
      configuration: "LOADED",
      enabled: true,
      target: { origin: "http://private-home.example.invalid", address: "192.168.222.9", entityId: "" },
      credential: "MISSING",
    });
    expect(result.homeAssistant).toMatchObject({
      configuration: "CONFIGURED",
      tls: "REQUIRED",
      target: "REQUIRED",
      credential: "MISSING",
    });
    expect(
      assessPrivateAccessReadiness({ tailscale: "MISSING", configuration: "LOADED", credential: "STORED" })
        .homeAssistant,
    ).toMatchObject({ configuration: "UNKNOWN", tls: "UNKNOWN", credential: "NOT_CHECKED" });
  });
  it("refuses unscoped roots/workspaces and does not inspect Windows programs on another platform", async () => {
    const fixture = setup();
    await expect(inspectPrivateAccessReadiness("relative", workspaceId, fixture.dependencies)).rejects.toThrow(
      "INVALID_READINESS_BINDING",
    );
    await expect(inspectPrivateAccessReadiness(root, "../wrong", fixture.dependencies)).rejects.toThrow(
      "INVALID_READINESS_BINDING",
    );
    expect(fixture.metadata).not.toHaveBeenCalled();
    const result = await inspectPrivateAccessReadiness(root, workspaceId, {
      ...fixture.dependencies,
      platform: "linux",
    });
    expect(result.tailscale.executable).toBe("UNSUPPORTED_PLATFORM");
    expect(fixture.metadata.mock.calls.some(([path]) => path.includes("Program Files"))).toBe(false);
  });
});
