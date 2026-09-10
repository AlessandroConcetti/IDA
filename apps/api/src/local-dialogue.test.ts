import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoDatabase } from "./database.js";
import { localPilot } from "./evaluation/local-model-pin.js";
import { registerLocalDialogue } from "./local-dialogue.js";

const fake = vi.hoisted(() => ({
  instances: [] as { inspectInstalledModels: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
}));
vi.mock("./ollama-transport.js", () => ({
  OllamaLoopbackTransport: class {
    inspectInstalledModels = vi.fn();
    dispose = vi.fn();
    constructor() {
      fake.instances.push(this);
    }
  },
}));
const apps: ReturnType<typeof Fastify>[] = [];
function instance(index: number) {
  const result = fake.instances[index];
  if (!result) throw new Error("Missing test transport");
  return result;
}
async function fixture(enabled = true, locked = true) {
  const app = Fastify();
  // Composition des statuts seulement. L'authentification est exercée par les tests app existants.
  registerLocalDialogue(app, {} as DemoDatabase, { enabled, locked });
  apps.push(app);
  await app.ready();
  return app;
}
beforeEach(() => {
  fake.instances.length = 0;
});
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
describe("Composition du statut IA local", () => {
  it("sépare le transport de statut de celui d’inférence", async () => {
    const app = await fixture();
    instance(1).inspectInstalledModels.mockResolvedValue([
      { name: localPilot.name, digest: localPilot.digest, size: 1024 },
    ]);
    const response = await app.inject("/v1/intelligence/local/status");
    expect(response.json().data.state).toBe("READY");
    expect(instance(0).inspectInstalledModels).not.toHaveBeenCalled();
    expect(instance(1).inspectInstalledModels).toHaveBeenCalledTimes(1);
  });
  it("mutualise deux lectures simultanées sans faux statut indisponible", async () => {
    const app = await fixture();
    let resolve!: (rows: unknown[]) => void;
    instance(1).inspectInstalledModels.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = app.inject("/v1/intelligence/local/status");
    const second = app.inject("/v1/intelligence/local/status");
    await vi.waitFor(() => expect(instance(1).inspectInstalledModels).toHaveBeenCalledTimes(1));
    resolve([{ name: localPilot.name, digest: localPilot.digest, size: 1024 }]);
    expect((await first).json().data.state).toBe("READY");
    expect((await second).json().data.state).toBe("READY");
  });
  it("refuse un digest différent et ne conserve pas un résultat de statut", async () => {
    const app = await fixture();
    const inventory = instance(1).inspectInstalledModels;
    inventory.mockResolvedValueOnce([{ name: localPilot.name, digest: "wrong", size: 1024 }]).mockResolvedValueOnce([]);
    expect((await app.inject("/v1/intelligence/local/status")).json().data.state).toBe("MODEL_MISSING");
    expect((await app.inject("/v1/intelligence/local/status")).json().data.state).toBe("MODEL_MISSING");
    expect(inventory).toHaveBeenCalledTimes(2);
  });
  it.each([
    [false, true],
    [true, false],
  ])("n’active rien si enabled=%s et locked=%s", async (enabled, locked) => {
    const app = await fixture(enabled, locked);
    expect((await app.inject("/v1/intelligence/local/status")).json().data.state).toBe("DISABLED");
    expect(fake.instances.every((instance) => instance.inspectInstalledModels.mock.calls.length === 0)).toBe(true);
  });
  it("masque les erreurs de transport et libère la vérification échouée", async () => {
    const app = await fixture();
    const inventory = instance(1).inspectInstalledModels;
    inventory.mockRejectedValueOnce(new Error("INTERNAL_DIAGNOSTIC_ONLY")).mockResolvedValueOnce([]);
    const response = await app.inject("/v1/intelligence/local/status");
    expect(response.json().data.state).toBe("UNAVAILABLE");
    expect(response.body).not.toContain("INTERNAL_DIAGNOSTIC_ONLY");
    expect((await app.inject("/v1/intelligence/local/status")).json().data.state).toBe("MODEL_MISSING");
  });
  it("ferme les deux transports avec le serveur", async () => {
    const app = await fixture();
    await app.close();
    expect(fake.instances).toHaveLength(2);
    for (const instance of fake.instances) expect(instance.dispose).toHaveBeenCalledOnce();
  });
});
