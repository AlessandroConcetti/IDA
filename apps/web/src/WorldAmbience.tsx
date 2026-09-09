import { useEffect, useRef, useState } from "react";
import { canPlayAmbience } from "./worlds";

/** Décor muet : source montée uniquement si visible et autorisée par les préférences. */
export function WorldAmbience({ src, paused = false }: { src: string; paused?: boolean }) {
  const container = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [saveData, setSaveData] = useState(true);
  useEffect(() => {
    let inViewport = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const update = () => {
      const allowed = !document.hidden && inViewport && !motion.matches && !connection?.saveData;
      setVisible(!document.hidden && inViewport);
      setReducedMotion(motion.matches);
      setSaveData(connection?.saveData === true);
      if (!allowed) {
        video.current?.pause();
      }
    };
    update();
    const surface = container.current?.closest(".world-card, .world-environment");
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
  const playing = canPlayAmbience({ paused, visible, reducedMotion, saveData, failed });
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let current = true;
    if (playing) {
      element.muted = true;
      void element.play().catch(() => {
        if (current) {
          setFailed(true);
        }
      });
    } else element.pause();
    return () => {
      current = false;
      element.pause();
    };
  }, [playing]);
  return (
    <span
      className="world-ambience"
      ref={container}
      aria-hidden="true"
      data-state={playing && ready ? "playing" : "poster"}
    >
      {playing ? (
        <video
          ref={video}
          src={src}
          muted
          autoPlay
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
