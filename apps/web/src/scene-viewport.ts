import { useEffect, useRef } from "react";

/** Plein viewport client, pas de capteur ni de permission native. */
export function useSceneViewport() {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    title.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previous; };
  }, []);
  return title;
}
