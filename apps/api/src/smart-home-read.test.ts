import { describe, expect, it, vi } from "vitest";
import { createHomeAssistantReadProvider } from "./smart-home-read.js";

const entityId = "light.studio";
const fixture = { entity_id: entityId, state: "on", last_updated: "2026-09-07T10:00:00Z" };

describe("Préparation Home Assistant — lecture hors ligne d’une lampe", () => {
  it.each([
    ["on", "ON"],
    ["off", "OFF"],
    ["unknown", "UNKNOWN"],
    ["unavailable", "UNAVAILABLE"],
  ])("conserve l’état %s sans le confondre avec une panne ou OFF", async (state, expected) => {
    const getState = vi.fn(async () => ({
      ...fixture,
      state,
      attributes: { access_token: "private", friendly_name: "private" },
      context: { user_id: "private" },
    }));
    const provider = createHomeAssistantReadProvider({ entityId }, { getState });
    expect(getState).not.toHaveBeenCalled();
    const result = await provider.readState();
    expect(result).toEqual({ status: "READY", state: expected, providerUpdatedAt: fixture.last_updated });
    expect(getState).toHaveBeenCalledExactlyOnceWith({ method: "GET", path: "/api/states/light.studio" });
    expect(JSON.stringify(result)).not.toMatch(/private|attributes|context|entity_id/);
    expect(Object.keys(provider)).toEqual(["readState"]);
  });
  it.each([
    "",
    "camera.entry",
    "lock.entry",
    "switch.heater",
    "climate.home",
    "light.studio/../../config",
    "light.studio?token=x",
    "light.studio%2fconfig",
    "https://other.test",
    "light.studio\n",
    "light.studio\r\n",
    " light.studio",
    `light.${"a".repeat(101)}`,
  ])("refuse la cible non supportée %s avant tout appel", (entityId) => {
    const getState = vi.fn();
    expect(() => createHomeAssistantReadProvider({ entityId }, { getState })).toThrow("SMART_HOME_TARGET_UNSUPPORTED");
    expect(getState).not.toHaveBeenCalled();
  });
  it.each([
    null,
    [],
    "on",
    {},
    { ...fixture, entity_id: "light.other" },
    { ...fixture, state: "__proto__" },
    { ...fixture, state: "unexpected" },
    { ...fixture, last_updated: "2026-09-07T10:00:00" },
    { ...fixture, last_updated: "invalid" },
  ])("refuse une réponse mal formée ou une autre cible %#", async (raw) => {
    const provider = createHomeAssistantReadProvider({ entityId }, { getState: vi.fn(async () => raw) });
    expect(await provider.readState()).toEqual({ status: "INVALID_RESPONSE" });
  });
  it("ne retient aucun ancien état après une panne et ne rejoue pas la lecture", async () => {
    const getState = vi
      .fn()
      .mockResolvedValueOnce(fixture)
      .mockRejectedValueOnce(new Error("secret in provider response"));
    const provider = createHomeAssistantReadProvider({ entityId }, { getState });
    expect((await provider.readState()).status).toBe("READY");
    expect(await provider.readState()).toEqual({ status: "PROVIDER_UNAVAILABLE" });
    expect(getState).toHaveBeenCalledTimes(2);
  });
  it("capture seulement la cible validée, sans conserver un binding mutable", async () => {
    const binding = { entityId };
    const getState = vi.fn(async () => fixture);
    const provider = createHomeAssistantReadProvider(binding, { getState });
    binding.entityId = "camera.entry";
    await provider.readState();
    expect(getState).toHaveBeenCalledExactlyOnceWith({ method: "GET", path: "/api/states/light.studio" });
  });
  it("ne lance pas de lecture déjà annulée", async () => {
    const controller = new AbortController();
    controller.abort("private-reason");
    const getState = vi.fn();
    const provider = createHomeAssistantReadProvider({ entityId }, { getState });
    expect(await provider.readState(controller.signal)).toEqual({ status: "CANCELLED" });
    expect(getState).not.toHaveBeenCalled();
  });
  it("abandonne immédiatement une lecture, même si le transport ignore l’annulation", async () => {
    const controller = new AbortController();
    let complete!: (value: unknown) => void;
    const getState = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          complete = resolve;
        }),
    );
    const provider = createHomeAssistantReadProvider({ entityId }, { getState });
    const pending = provider.readState(controller.signal);
    controller.abort("private-reason");
    expect(await pending).toEqual({ status: "CANCELLED" });
    expect(getState).toHaveBeenCalledExactlyOnceWith({
      method: "GET",
      path: "/api/states/light.studio",
      signal: controller.signal,
    });
    complete(fixture);
    expect(await pending).toEqual({ status: "CANCELLED" });
  });
  it("retire son abonnement d’annulation après une réponse normale", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const provider = createHomeAssistantReadProvider({ entityId }, { getState: vi.fn(async () => fixture) });
    expect((await provider.readState(controller.signal)).status).toBe("READY");
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
