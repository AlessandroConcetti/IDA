import { useEffect, useRef, useState } from "react";
import type { MediaAsset } from "./data";

/** Traitement de lecture local ; aucune modification du fichier maître. */
export function StudioPlayer({ asset }: { asset: MediaAsset }) {
  const audio = useRef<HTMLAudioElement>(null);
  const graph = useRef<{
    context: AudioContext;
    bass: BiquadFilterNode;
    mid: BiquadFilterNode;
    treble: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    output: GainNode;
  } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);
  const [compression, setCompression] = useState(false);
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      const current = graph.current;
      graph.current = null;
      void current?.context.close();
    },
    [],
  );
  useEffect(() => {
    const current = graph.current;
    if (!current) return;
    current.bass.gain.setTargetAtTime(enabled ? bass : 0, current.context.currentTime, 0.03);
    current.mid.gain.setTargetAtTime(enabled ? mid : 0, current.context.currentTime, 0.03);
    current.treble.gain.setTargetAtTime(enabled ? treble : 0, current.context.currentTime, 0.03);
    current.treble.disconnect();
    current.treble.connect(enabled && compression ? current.compressor : current.output);
  }, [bass, mid, treble, compression, enabled]);
  async function activate() {
    if (!audio.current) return;
    try {
      if (!graph.current) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(audio.current);
        const low = context.createBiquadFilter();
        low.type = "lowshelf";
        low.frequency.value = 160;
        const medium = context.createBiquadFilter();
        medium.type = "peaking";
        medium.frequency.value = 1000;
        medium.Q.value = 0.7;
        const high = context.createBiquadFilter();
        high.type = "highshelf";
        high.frequency.value = 5000;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 2;
        compressor.attack.value = 0.02;
        compressor.release.value = 0.2;
        const output = context.createGain();
        output.gain.value = 0.7;
        source.connect(low).connect(medium).connect(high).connect(output).connect(context.destination);
        compressor.connect(output);
        graph.current = { context, bass: low, mid: medium, treble: high, compressor, output };
      }
      await graph.current.context.resume();
      setEnabled(true);
      setError("");
    } catch {
      setError("Le traitement audio n’est pas disponible dans ce navigateur. La lecture simple reste accessible.");
    }
  }
  return (
    <section className="reference-player">
      <h3>{asset.filename}</h3>
      {asset.previewUrl ? (
        <audio
          ref={audio}
          controls
          preload="none"
          src={asset.previewUrl}
          loop={loop}
          onPlay={() => {
            if (graph.current) void graph.current.context.resume();
          }}
          onError={() => setError("Lecture indisponible. Reconnectez IDA puis rouvrez ce fichier.")}
        />
      ) : (
        <p>Aucun aperçu pour ce format.</p>
      )}
      <label className="reference-check">
        <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Lecture en boucle
      </label>
      <button
        type="button"
        disabled={!asset.previewUrl}
        onClick={() => (enabled ? setEnabled(false) : void activate())}
      >
        {enabled ? "Comparer avec le son original" : "Activer l’égaliseur d’écoute"}
      </button>
      <fieldset disabled={!enabled} className="studio-eq">
        <legend>Égaliseur 3 bandes</legend>
        {[
          ["Graves", bass, setBass],
          ["Médiums", mid, setMid],
          ["Aigus", treble, setTreble],
        ].map(([label, value, setter]) => (
          <label key={String(label)}>
            {String(label)}{" "}
            <output>
              {Number(value) > 0 ? "+" : ""}
              {Number(value)} dB
            </output>
            <input
              type="range"
              min="-12"
              max="6"
              step=".5"
              value={Number(value)}
              onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))}
            />
          </label>
        ))}
        <label className="reference-check">
          <input type="checkbox" checked={compression} onChange={(event) => setCompression(event.target.checked)} />{" "}
          Compression douce d’écoute
        </label>
        <button
          type="button"
          onClick={() => {
            setBass(0);
            setMid(0);
            setTreble(0);
            setCompression(false);
          }}
        >
          Réinitialiser
        </button>
      </fieldset>
      <p className="reference-hint">
        Traitement sur ce PC seulement, avec marge de volume. Le fichier maître n’est jamais modifié. Pas encore
        d’export audio traité ni de mesure LUFS.
      </p>
      {error ? <p role="status">{error}</p> : null}
    </section>
  );
}
