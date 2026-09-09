import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTrackMedia } from "./api";
import { invalidateWorkspaceRequests } from "./api-transport";
import type { MediaAsset } from "./data";
import { SnapshotReader } from "./snapshot-reader";
import { TrackMediaPanel, TrackMediaResults } from "./TrackMediaPanel";

const trackId = "trk_lumiere_noire";
const media = { id: "med_night-drive", trackId, filename: "night-drive-preview.mp4", type: "VIDEO", status: "UNUSED" };
const displayMedia: MediaAsset = {
  id: media.id,
  filename: media.filename,
  kind: "VIDEO",
  status: "UNUSED",
  detail: "Lié",
  tone: "blue",
};
afterEach(() => {
  invalidateWorkspaceRequests();
  vi.unstubAllGlobals();
});

describe("Médias liés — API existante et référence exacte", () => {
  it("relit uniquement trackId, sans statut, nom ou release hérités, et borne à 50", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [media] }));
    vi.stubGlobal("fetch", fetch);
    const assets = await fetchTrackMedia(trackId);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ id: media.id, status: "UNUSED" });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/v1/media?trackId=${trackId}&limit=50`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("conserve la casse de l'identifiant et accepte les archives", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ ...media, trackId: "trk_Mixed", status: "ARCHIVED" }] }));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchTrackMedia("trk_Mixed"))[0]?.status).toBe("ARCHIVED");
    expect(fetch.mock.calls[0]?.[0]).toContain("trackId=trk_Mixed");
  });
  it("refuse un identifiant invalide sans appel réseau", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchTrackMedia("../media")).rejects.toThrow("invalide");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [{ ...media, trackId: "trk_other" }],
    [media, { ...media, id: "med_unrelated", trackId: null, releaseId: "rel_lumiere_noire" }],
    [null],
    [{ ...media, id: "https://external.example" }],
    [{ ...media, status: "MADE_UP" }],
    [{ ...media, type: "SCRIPT" }],
    [{ ...media, filename: " " }],
    Array(51).fill(media),
  ])("refuse toute la réponse incohérente sans filtrer silencieusement : %j", async (rows) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: rows })));
    await expect(fetchTrackMedia(trackId)).rejects.toThrow("ne correspondent pas");
  });
  it("refuse une sélection doublonnée et accepte la vraie liste vide", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [media, media] }))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchTrackMedia(trackId)).rejects.toThrow("en double");
    await expect(fetchTrackMedia(trackId)).resolves.toEqual([]);
  });
  it.each([401, 403, 500])("n'élargit pas le filtre après refus %s", async (status) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}, { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchTrackMedia(trackId)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejette la réponse arrivée après verrouillage", async () => {
    let deliver: (response: Response) => void = () => {
      throw new Error("Lecture non initialisée");
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            deliver = resolve;
          }),
      ),
    );
    const pending = fetchTrackMedia(trackId);
    invalidateWorkspaceRequests();
    deliver(Response.json({ data: [media] }));
    await expect(pending).rejects.toThrow("Demande interrompue");
  });
  it("la fermeture du panneau empêche de réafficher une lecture tardive", async () => {
    let deliver: (assets: MediaAsset[]) => void = () => {
      throw new Error("Lecture non initialisée");
    };
    const reader = new SnapshotReader(
      () =>
        new Promise<MediaAsset[]>((resolve) => {
          deliver = resolve;
        }),
    );
    const disconnect = reader.connect();
    disconnect();
    deliver([displayMedia]);
    await Promise.resolve();
    await Promise.resolve();
    expect(reader.getSnapshot()).toEqual({ phase: "idle" });
  });
});

describe("Médias liés — ouverture volontaire et états honnêtes", () => {
  it("ne monte ni lecteur ni lecture réseau avant le clic explicite", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const renderMedia = vi.fn();
    const html = renderToStaticMarkup(createElement(TrackMediaPanel, { trackId, renderMedia }));
    expect(html).toContain("Afficher les médias liés");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("hidden");
    expect(html).toContain('type="button"');
    expect(html).not.toMatch(/<img|<audio|<video|Recherche des médias liés/u);
    expect(fetch).not.toHaveBeenCalled();
    expect(renderMedia).not.toHaveBeenCalled();
  });
  it.each(["idle", "loading", "unavailable"] as const)("ne rend aucune donnée en état %s", (phase) => {
    const renderMedia = vi.fn();
    const html = renderToStaticMarkup(
      createElement(TrackMediaResults, { state: { phase }, renderMedia, onRefresh: vi.fn() }),
    );
    expect(renderMedia).not.toHaveBeenCalled();
    expect(html).toContain(phase === "unavailable" ? 'role="alert"' : 'role="status"');
    expect(html).toContain(phase === "unavailable" ? "Réessayer les médias liés" : 'disabled=""');
  });
  it("distingue liste vide, liens directs et ressources associées seulement à la release", () => {
    const renderMedia = vi.fn();
    const html = renderToStaticMarkup(
      createElement(TrackMediaResults, { state: { phase: "ready", data: [] }, renderMedia, onRefresh: vi.fn() }),
    );
    expect(html).toContain("Aucun média directement lié");
    expect(html).toContain("release seulement");
    expect(renderMedia).not.toHaveBeenCalled();
  });
  it.each([1, 50])("rend les résultats via la grille existante et annonce honnêtement la borne : %s", (count) => {
    const assets = Array.from({ length: count }, (_, index) => ({ ...displayMedia, id: `med_${index}` }));
    const renderMedia = vi.fn(() => createElement("div", {}, "Grille existante"));
    const html = renderToStaticMarkup(
      createElement(TrackMediaResults, { state: { phase: "ready", data: assets }, renderMedia, onRefresh: vi.fn() }),
    );
    expect(renderMedia).toHaveBeenCalledExactlyOnceWith(assets);
    expect(html).toContain(`${count} média`);
    expect(html.includes("n’est pas un total exhaustif")).toBe(count === 50);
    expect(html).not.toContain('type="submit"');
  });
});
