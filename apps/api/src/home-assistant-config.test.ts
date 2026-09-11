import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadHomeAssistantBinding } from "./home-assistant-config.js";

describe("Configuration privée Home Assistant", () => {
  it("absente ou mal formée : fermeture, jamais de token configuré en clair", async () => {
    const root = await mkdtemp(join(tmpdir(), "ida-ha-config-fixture-"));
    try {
      const path = join(root, "home-assistant.json");
      expect(await loadHomeAssistantBinding(root, "wsp_fixture")).toBeUndefined();
      for (const value of [
        "bad json",
        JSON.stringify({
          enabled: true,
          origin: "https://ha.fixture.invalid",
          address: "192.168.200.10",
          entityId: "light.fixture",
          token: "synthetic-rejected",
        }),
      ]) {
        await writeFile(path, value);
        expect(await loadHomeAssistantBinding(root, "wsp_fixture")).toBeUndefined();
      }
      await writeFile(
        path,
        JSON.stringify({ enabled: true, origin: "http://ha.fixture.invalid", address: "192.168.200.10", entityId: "" }),
      );
      const binding = await loadHomeAssistantBinding(root, "wsp_fixture");
      expect(binding?.workspaceId).toBe("wsp_fixture");
      expect(await binding?.secret.available()).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
