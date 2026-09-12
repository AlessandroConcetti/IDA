import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: socket.request }));

import {
  createHomeAssistantHttpsTransport,
  homeAssistantTargetPrerequisites,
  homeAssistantTargetState,
  privateHomeAddress,
} from "./home-assistant-transport.js";

const target = { origin: "https://ha.fixture.invalid:443", address: "192.168.200.10", entityId: "light.fixture" };
function response(body: string, status = 200, complete = true) {
  socket.request.mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const res = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers: { "content-type": "application/json" },
        complete,
        destroy: vi.fn(),
      });
      callback(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.from(body));
        res.emit("end");
      });
    };
    return request;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe("Transport HA — origine et secret fermés par défaut", () => {
  it("inspecte les prérequis indépendamment sans réseau", () => {
    expect(homeAssistantTargetPrerequisites(undefined)).toEqual({
      configuration: "REQUIRED",
      tls: "REQUIRED",
      target: "REQUIRED",
    });
    expect(homeAssistantTargetPrerequisites({ ...target, origin: "not a URL" })).toEqual({
      configuration: "INVALID",
      tls: "REQUIRED",
      target: "CONFIGURED",
    });
    expect(homeAssistantTargetPrerequisites({ ...target, origin: "http://ha.fixture.invalid", entityId: "" })).toEqual({
      configuration: "CONFIGURED",
      tls: "REQUIRED",
      target: "REQUIRED",
    });
    expect(socket.request).not.toHaveBeenCalled();
  });
  it.each([
    { origin: "https://user:pass@ha.fixture.invalid" },
    { origin: "https://ha.fixture.invalid/path" },
    { origin: "https://ha.fixture.invalid/?token=synthetic" },
    { origin: "https://192.168.200.11" },
    { address: "127.0.0.1" },
  ])("configuration invalide distincte de HTTPS demandé pour %j", (change) => {
    expect(homeAssistantTargetPrerequisites({ ...target, ...change })).toEqual({
      configuration: "INVALID",
      tls: "CONFIGURED",
      target: "CONFIGURED",
    });
    expect(socket.request).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "169.254.169.254", "8.8.8.8", "::1", "192.168.1.1.evil", "224.0.0.1"])(
    "refuse l'adresse non privée exacte %s",
    (address) => expect(privateHomeAddress(address)).toBe(false),
  );
  it.each([
    { origin: "http://ha.fixture.invalid" },
    { origin: "https://user:pass@ha.fixture.invalid" },
    { origin: "https://ha.fixture.invalid/other" },
    { origin: "https://ha.fixture.invalid/?token=test" },
    { origin: "https://192.168.200.11" },
    { address: "127.0.0.1" },
    { entityId: "switch.fixture" },
  ])("refuse %j avant déchiffrement et réseau", async (change) => {
    const secret = vi.fn();
    await expect(
      createHomeAssistantHttpsTransport({ ...target, ...change }, secret).getState({
        method: "GET",
        path: "/api/states/light.fixture",
      }),
    ).rejects.toThrow();
    expect(secret).not.toHaveBeenCalled();
    expect(socket.request).not.toHaveBeenCalled();
  });
  it("exige TLS même si l'environnement tente de le désactiver", () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    expect(homeAssistantTargetState(target)).toBe("TLS_REQUIRED");
    expect(homeAssistantTargetPrerequisites(target).tls).toBe("REQUIRED");
    vi.unstubAllEnvs();
  });
  it("n'émet qu'un GET ciblé à IP épinglée avec TLS vérifié", async () => {
    response('{"entity_id":"light.fixture"}');
    const secret = vi.fn().mockResolvedValue("SYNTHETIC_FIXTURE_TOKEN");
    const adapter = createHomeAssistantHttpsTransport(target, secret);
    expect(socket.request).not.toHaveBeenCalled();
    await adapter.getState({ method: "GET", path: "/api/states/light.fixture" });
    const [url, options] = socket.request.mock.calls[0] ?? [];
    expect(url.hostname).toBe("ha.fixture.invalid");
    expect(options).toMatchObject({
      method: "GET",
      path: "/api/states/light.fixture",
      agent: false,
      family: 4,
      rejectUnauthorized: true,
    });
    const lookup = vi.fn();
    options.lookup("ha.fixture.invalid", { family: 4 }, lookup);
    expect(lookup).toHaveBeenCalledWith(null, target.address, 4);
    expect(socket.request).toHaveBeenCalledTimes(1);
  });
  it("refuse une autre cible et l'annulation avant le secret", async () => {
    const secret = vi.fn();
    const adapter = createHomeAssistantHttpsTransport(target, secret);
    await expect(adapter.getState({ method: "GET", path: "/api/states/light.other" })).rejects.toThrow();
    await expect(
      adapter.getState({ method: "GET", path: "/api/states/light.fixture", signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(secret).not.toHaveBeenCalled();
    expect(socket.request).not.toHaveBeenCalled();
  });
  it("annulation pendant le coffre : pas de transmission tardive", async () => {
    const controller = new AbortController();
    const secret = vi.fn().mockImplementation(async () => {
      controller.abort();
      return "SYNTHETIC_FIXTURE_TOKEN";
    });
    await expect(
      createHomeAssistantHttpsTransport(target, secret).getState({
        method: "GET",
        path: "/api/states/light.fixture",
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(socket.request).not.toHaveBeenCalled();
  });
  it.each([
    ["{}", 302, true],
    ["invalid", 200, true],
    ["{}", 200, false],
    ["x".repeat(65_537), 200, true],
  ])("refuse redirection, JSON, troncature et taille", async (body, status, complete) => {
    response(body as string, status as number, complete as boolean);
    await expect(
      createHomeAssistantHttpsTransport(target, async () => "SYNTHETIC_FIXTURE_TOKEN").getState({
        method: "GET",
        path: "/api/states/light.fixture",
      }),
    ).rejects.toThrow("HOME_PROVIDER_UNAVAILABLE");
    expect(socket.request).toHaveBeenCalledTimes(1);
  });
});
