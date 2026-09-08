import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMediaDetail, fetchTrackDetail, submitIdaCommand } from "./api";
import { invalidateWorkspaceRequests } from "./api-transport";
import { CatalogDetailPanel } from "./CatalogDetailPanel";
import { CatalogResultLinks } from "./ConversationTools";
import { type CatalogTarget, isCatalogId, readCatalogTargets } from "./catalog-navigation";
import { SnapshotReader } from "./snapshot-reader";

const trackTarget: CatalogTarget = { kind: "track", id: "trk_lumiere_noire", label: "Lumière Noire" };
const mediaTarget: CatalogTarget = { kind: "media", id: "med_night-drive", label: "night-drive-preview.mp4" };
const track = { id: trackTarget.id, title: trackTarget.label, artistCredit: "Aless", status: "SCHEDULED", bpm: 124 };
const media = {
  id: mediaTarget.id,
  filename: mediaTarget.label,
  type: "VIDEO",
  status: "UNUSED",
  previewAvailable: false,
};
function command(kind: string, rows: unknown, state = "COMPLETED") {
  return { kind, state, message: "Résultats", result: { tracks: rows, media: rows } };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Promise non initialisée");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
afterEach(() => {
  invalidateWorkspaceRequests();
  vi.unstubAllGlobals();
});

describe("Cibles de navigation issues uniquement des résultats structurés", () => {
  it("conserve les identifiants seed/import et la casse exacte", () => {
    expect(readCatalogTargets(command("SEARCH_TRACK", [track]))).toEqual([trackTarget]);
    expect(readCatalogTargets(command("SEARCH_MEDIA", [media]))).toEqual([mediaTarget]);
    const id = "trk_A1c2b3";
    expect(readCatalogTargets(command("SEARCH_TRACK", [{ ...track, id }]))[0]?.id).toBe(id);
    expect(isCatalogId("med_b66d7d3775d84895a5ac574d719422dc", "media")).toBe(true);
  });
  it.each([
    undefined,
    null,
    "Ouvre trk_lumiere_noire",
    { responseMessage: "trk_lumiere_noire" },
    command("HELP", [track]),
    command("SEARCH_TRACK", [track], "FAILED"),
  ])("ne fabrique pas de lien depuis du texte/historique ou une commande incomplète : %j", (data) => {
    expect(readCatalogTargets(data)).toEqual([]);
  });
  it("ignore IDs/labels invalides, doublons et conserve les homonymes distincts", () => {
    const rows = [
      track,
      track,
      { ...track, id: "trk_second" },
      { ...track, id: "med_other" },
      { ...track, id: "trk_../secret" },
      { ...track, id: `trk_${"a".repeat(80)}` },
      { ...track, title: " " },
      { ...track, title: "a".repeat(501) },
    ];
    expect(readCatalogTargets(command("SEARCH_TRACK", rows))).toEqual([
      trackTarget,
      { ...trackTarget, id: "trk_second" },
    ]);
    expect(readCatalogTargets(command("SEARCH_TRACK", Array(11).fill(track)))).toEqual([]);
  });
  it("ne transmet ni URL, ni paramètres de fournisseur, ni caractères de contrôle", () => {
    expect(
      readCatalogTargets(
        command("SEARCH_TRACK", [
          { ...track, title: "A\u202eB\nC", href: "https://external.example", secret: "hidden" },
        ]),
      ),
    ).toEqual([{ ...trackTarget, label: "A B C" }]);
  });
  it("rend des boutons explicites échappés, sans envoi ni chargement au rendu", () => {
    const open = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const hostile = { ...trackTarget, label: '<img src=x onerror="alert(1)">' };
    const html = renderToStaticMarkup(createElement(CatalogResultLinks, { targets: [hostile], onOpen: open }));
    expect(html).toContain('type="button"');
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<img|<a\b|<video|autoplay|type="submit"/u);
    expect(open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(createElement(CatalogResultLinks, { targets: [], onOpen: open }))).toBe("");
  });
  it("le clic ne transmet que la cible précise, pas une commande naturelle", () => {
    const open = vi.fn();
    const element = CatalogResultLinks({ targets: [mediaTarget], onOpen: open });
    if (!element) throw new Error("Résultat attendu");
    const list = element.props.children[1] as ReactElement<{
      children: ReactElement<{ children: ReactElement<{ onClick: () => void }> }>[];
    }>;
    const first = list.props.children[0];
    if (!first) throw new Error("Bouton attendu");
    first.props.children.props.onClick();
    expect(open).toHaveBeenCalledExactlyOnceWith(mediaTarget);
  });
});

describe("Relecture des fiches via le transport authentifié existant", () => {
  it("propage les cibles du serveur sans changer le corps envoyé au Core", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: command("SEARCH_TRACK", [track]) }));
    vi.stubGlobal("fetch", fetch);
    expect((await submitIdaCommand("Liste mes morceaux")).catalogTargets).toEqual([trackTarget]);
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ message: "Liste mes morceaux", source: "web" });
  });
  it("relit uniquement le morceau demandé, sans utiliser la liste ou les faits du chat", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: { ...track, title: "Titre renommé" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchTrackDetail(trackTarget.id)).title).toBe("Titre renommé");
    expect(fetch.mock.calls[0]?.[0]).toBe(`/v1/tracks/${trackTarget.id}`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
  });
  it("relit un média au-delà de toute pagination et n'utilise pas une URL externe reçue", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { ...media, previewAvailable: true, previewUrl: "https://external.example" } }),
      );
    vi.stubGlobal("fetch", fetch);
    const asset = await fetchMediaDetail(mediaTarget.id);
    expect(asset.id).toBe(mediaTarget.id);
    expect(asset.previewUrl).toBe(`/v1/media/${mediaTarget.id}/preview`);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/v1/media/${mediaTarget.id}`);
  });
  it("refuse les chemins arbitraires avant réseau et les identifiants de réponse incohérents", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: { ...track, id: "trk_other" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchMediaDetail("../secrets")).rejects.toThrow("invalide");
    expect(fetch).not.toHaveBeenCalled();
    await expect(fetchTrackDetail(trackTarget.id)).rejects.toThrow("ne correspond pas");
    fetch.mockResolvedValue(Response.json({ data: { ...media, id: "med_other" } }));
    await expect(fetchMediaDetail(mediaTarget.id)).rejects.toThrow("ne correspond pas");
  });
  it.each([401, 403, 404, 500])("ne remplace pas un refus %s par d'anciennes données", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status })));
    await expect(fetchTrackDetail(trackTarget.id)).rejects.toMatchObject({ status });
  });
  it("ne livre pas une fiche arrivée après le verrouillage", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const reading = fetchTrackDetail(trackTarget.id);
    invalidateWorkspaceRequests();
    pending.resolve(Response.json({ data: track }));
    await expect(reading).rejects.toThrow("Demande interrompue");
  });
  it("ignore une ancienne sélection après démontage, la nouvelle conserve sa propre fiche", async () => {
    const old = deferred<typeof track>();
    const readerA = new SnapshotReader(() => old.promise);
    const readerB = new SnapshotReader(async () => ({ ...track, id: "trk_second" }));
    const disconnectA = readerA.connect();
    disconnectA();
    const disconnectB = readerB.connect();
    old.resolve(track);
    await settle();
    expect(readerA.getSnapshot()).toEqual({ phase: "idle" });
    expect(readerB.getSnapshot()).toMatchObject({ phase: "ready", data: { id: "trk_second" } });
    disconnectB();
  });
  it("affiche l'attente et les retours sans dévoiler la vieille fiche au rendu initial", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const renderer = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CatalogDetailPanel, {
        target: { ...trackTarget, label: "Ancien nom privé" },
        onBack: vi.fn(),
        onShowLibrary: vi.fn(),
        renderTrack: renderer,
        renderMedia: renderer,
      }),
    );
    expect(html).toContain("Vérification de l’accès");
    expect(html).toContain("Revenir à la conversation");
    expect(html).not.toContain("Ancien nom privé");
    expect(renderer).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
