import { type ReactNode, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { fetchTrackMedia } from "./api";
import { onWorkspaceMutation } from "./api-transport";
import type { MediaAsset } from "./data";
import { SnapshotReader, type SnapshotState } from "./snapshot-reader";

export function TrackMediaResults({
  state,
  onRefresh,
  renderMedia,
}: {
  state: SnapshotState<MediaAsset[]>;
  onRefresh: () => void;
  renderMedia: (assets: MediaAsset[]) => ReactNode;
}) {
  return (
    <div>
      {state.phase === "idle" || state.phase === "loading" ? <p role="status">Recherche des médias liés…</p> : null}
      {state.phase === "unavailable" ? (
        <p role="alert">
          Les médias liés sont indisponibles. Réessayez ; aucun autre contenu ne remplace cette sélection.
        </p>
      ) : null}
      {state.phase === "ready" ? (
        state.data.length === 0 ? (
          <p role="status">
            Aucun média directement lié à ce morceau. Un média peut être associé à la release seulement, ou ne pas
            encore être associé.
          </p>
        ) : (
          <>
            <p role="status">
              {state.data.length} média{state.data.length === 1 ? "" : "s"} affiché{state.data.length === 1 ? "" : "s"}{" "}
              · plus récents en premier.
            </p>
            {state.data.length === 50 ? (
              <p>
                Limite de 50 atteinte : d’autres médias peuvent être liés. Cette liste n’est pas un total exhaustif.
              </p>
            ) : null}
            {renderMedia(state.data)}
          </>
        )
      ) : null}
      <button
        type="button"
        className="command-suggestion"
        onClick={onRefresh}
        disabled={state.phase === "loading" || state.phase === "idle"}
      >
        {state.phase === "unavailable" ? "Réessayer les médias liés" : "Actualiser les médias liés"}
      </button>
    </div>
  );
}

function LoadedTrackMedia({
  trackId,
  renderMedia,
}: {
  trackId: string;
  renderMedia: (assets: MediaAsset[]) => ReactNode;
}) {
  const reader = useMemo(() => new SnapshotReader(() => fetchTrackMedia(trackId)), [trackId]);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(() => {
    const disconnect = reader.connect();
    const unsubscribe = onWorkspaceMutation(reader.refresh);
    return () => {
      unsubscribe();
      disconnect();
    };
  }, [reader]);
  return <TrackMediaResults state={state} onRefresh={reader.refresh} renderMedia={renderMedia} />;
}

export function TrackMediaPanel({
  trackId,
  renderMedia,
}: {
  trackId: string;
  renderMedia: (assets: MediaAsset[]) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  return (
    <section className="panel linked-track-media" aria-labelledby={`${regionId}-title`}>
      <p className="eyebrow">CONTENT LIBRARY · LIENS EXISTANTS</p>
      <h2 id={`${regionId}-title`}>Les médias de ce morceau</h2>
      <p>
        Liens directs uniquement, sans déduction par nom ou par release. Tous les statuts sont inclus, même les
        archives. « Inutilisé » ne signifie pas libre de toute proposition.
      </p>
      <button
        type="button"
        className="command-suggestion"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Masquer les médias liés" : "Afficher les médias liés"}
      </button>
      <div id={regionId} hidden={!expanded}>
        {expanded ? <LoadedTrackMedia key={trackId} trackId={trackId} renderMedia={renderMedia} /> : null}
      </div>
    </section>
  );
}
