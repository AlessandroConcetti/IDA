import { type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";
import { fetchMediaDetail, fetchTrackDetail } from "./api";
import { onWorkspaceMutation } from "./api-transport";
import type { CatalogTarget } from "./catalog-navigation";
import type { MediaAsset, Track } from "./data";
import { SnapshotReader } from "./snapshot-reader";
import { TrackMediaPanel } from "./TrackMediaPanel";
import "./conversation-tools.css";

type CatalogDetail = { kind: "track"; track: Track } | { kind: "media"; media: MediaAsset };

export function CatalogDetailPanel({
  target,
  onBack,
  onShowLibrary,
  renderTrack,
  renderMedia,
  renderLinkedMedia,
}: {
  target: CatalogTarget;
  onBack: () => void;
  onShowLibrary: () => void;
  renderTrack: (track: Track) => ReactNode;
  renderMedia: (media: MediaAsset) => ReactNode;
  renderLinkedMedia?: (assets: MediaAsset[]) => ReactNode;
}) {
  const { id, kind } = target;
  const reader = useMemo(
    () =>
      new SnapshotReader<CatalogDetail>(async () =>
        kind === "track" ? { kind, track: await fetchTrackDetail(id) } : { kind, media: await fetchMediaDetail(id) },
      ),
    [id, kind],
  );
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(() => {
    const disconnect = reader.connect();
    const unsubscribe = onWorkspaceMutation(reader.refresh);
    return () => {
      unsubscribe();
      disconnect();
    };
  }, [reader]);

  return (
    <div className="catalog-detail">
      <section className="panel" aria-labelledby="catalog-detail-title">
        <p className="eyebrow">DEPUIS LA CONVERSATION</p>
        <h2 id="catalog-detail-title">{kind === "track" ? "Morceau sélectionné" : "Média sélectionné"}</h2>
        <p>Fiche relue dans votre workspace. Aucune modification, utilisation ou publication n’est déclenchée.</p>
        <div className="catalog-detail-actions">
          <button type="button" className="command-suggestion" onClick={onBack}>
            ← Revenir à la conversation
          </button>
          <button type="button" className="command-suggestion" onClick={onShowLibrary}>
            {kind === "track" ? "Voir tout le Music Brain" : "Voir toute la Content Library"}
          </button>
          <button
            type="button"
            className="command-suggestion"
            onClick={reader.refresh}
            disabled={state.phase === "loading"}
          >
            {state.phase === "unavailable" ? "Réessayer" : "Actualiser la fiche"}
          </button>
        </div>
        {state.phase === "idle" || state.phase === "loading" ? (
          <p role="status">Vérification de l’accès et chargement de la fiche…</p>
        ) : null}
        {state.phase === "unavailable" ? (
          <p role="alert">
            Cette fiche est introuvable, inaccessible ou momentanément indisponible. Vous pouvez réessayer ou revenir au
            chat ; aucun ancien résultat n’est utilisé comme remplacement.
          </p>
        ) : null}
      </section>
      {state.phase === "ready"
        ? state.data.kind === "track"
          ? renderTrack(state.data.track)
          : renderMedia(state.data.media)
        : null}
      {state.phase === "ready" && state.data.kind === "track" && renderLinkedMedia ? (
        <TrackMediaPanel key={id} trackId={id} renderMedia={renderLinkedMedia} />
      ) : null}
    </div>
  );
}
