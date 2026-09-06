import { useEffect, useRef, useState } from "react";
import { canPlayAmbience } from "./worlds";

/** Une seule instance montée, aucune lecture avant un clic, aucun capteur. */
export function WorldAmbience({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [saveData, setSaveData] = useState(true);
  useEffect(() => {
    let inViewport = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const update = () => {
      const allowed = !document.hidden && inViewport && !motion.matches && !connection?.saveData;
      setVisible(!document.hidden && inViewport);
      setReducedMotion(motion.matches);
      setSaveData(connection?.saveData === true);
      if (!allowed) {
        video.current?.pause();
        setRequested(false);
      }
    };
    update();
    const surface = container.current?.closest(".world-environment");
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver((entries) => {
            inViewport = entries.some((entry) => entry.isIntersecting);
            update();
          });
    if (surface) observer?.observe(surface);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    connection?.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
    };
  }, []);
  const playing = canPlayAmbience({ requested, visible, reducedMotion, saveData, failed });
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let current = true;
    if (playing) {
      element.muted = true;
      void element.play().catch(() => {
        if (current) {
          setFailed(true);
          setRequested(false);
        }
      });
    } else element.pause();
    return () => {
      current = false;
      element.pause();
    };
  }, [playing]);
  return (
    <div className="world-ambience" ref={container}>
      {requested && !failed ? (
        <video
          ref={video}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onError={() => {
            setFailed(true);
            setRequested(false);
          }}
        />
      ) : null}
      <button
        type="button"
        className="world-media-toggle"
        disabled={reducedMotion || saveData}
        aria-pressed={playing}
        onClick={() => {
          setFailed(false);
          setRequested(!requested);
        }}
      >
        {playing ? "Arrêter l’ambiance vidéo" : failed ? "Réessayer la vidéo" : "Lire l’ambiance vidéo"}
      </button>
      {failed ? (
        <p role="status">Vidéo indisponible. Vos espaces restent accessibles.</p>
      ) : reducedMotion || saveData ? (
        <p>Vidéo désactivée : mouvement réduit ou économie de données.</p>
      ) : null}
    </div>
  );
}
