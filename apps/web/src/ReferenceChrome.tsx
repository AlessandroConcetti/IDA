import { type ReactNode, useEffect, useRef } from "react";
import type { NavigationId } from "./data";

export function LineIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    home: "m2 11 10-9 10 9M5 9v12h5v-7h4v7h5V9",
    fridge: "M5 2h14v20H5V2Zm0 8h14M8 5v2m0 6v4",
    calendar: "M3 5h18v17H3V5Zm4-3v6m10-6v6M3 11h18m-14 5h3m4 0h3",
    heart: "M12 21 3 12C-3 5 7-1 12 6c5-7 15-1 9 6l-9 9Z",
    plane: "m3 4 3-1 6 6 7-3c4-2 5 1 1 3l-7 4-2 8-3 1 1-8-6-2-1-3 5 1-4-6Z",
    pin: "M18 9c0 5-6 12-6 12S6 14 6 9a6 6 0 1 1 12 0Zm-4 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
    cloud: "M6 18a4 4 0 1 1 0-8 6 6 0 0 1 12-1 4.5 4.5 0 1 1 0 9H6Z",
    rain: "M5 15a4 4 0 0 1 0-8 6 6 0 0 1 12-1 4.5 4.5 0 1 1 1 9M6 18l-1 3m7-3-1 3m7-3-1 3",
    storm: "M5 15a4 4 0 0 1 0-8 6 6 0 0 1 12-1 4.5 4.5 0 1 1 1 9M13 13l-4 6h4l-2 4",
    snow: "M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3m-6 16 3-3 3 3M3 10l4-1-1-4m12 14-1-4 4-1M3 14l4 1-1 4m12-14-1 4 4 1",
    thermometer: "M9 14V5a3 3 0 1 1 6 0v9a5 5 0 1 1-6 0ZM12 8v10m-1 0h2",
    drop: "M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13ZM8 15c0 2 1 3 3 3",
    wind: "M2 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M2 16h6a3 3 0 1 1-3 3",
    gauge: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 12l4-5M6 12h1m10 0h1M9 17h6",
    leaf: "M20 3S4 0 3 12a7 7 0 0 0 13 4c3-4 4-13 4-13ZM4 21 15 9",
    alert: "M12 2 1 21h22L12 2Zm0 7v5m0 3v1",
    unknown: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 12h8",
    search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6",
    book: "M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-7-2-10 1Zm0 0v15M5 7h4M5 10h4m6-3h4m-4 3h4",
    ideas: "M10 21h4M9 18h6M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2ZM12 1v1M1 7h2m18 0h2",
    map: "m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3V5Zm6-3v17m8-14v17",
    globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z",
    music: "M2 10v4m4-8v12m4-15v18m4-15v12m4-10v8m4-6v4",
    sliders: "M5 2v8m0 4v8M12 2v3m0 4v13M19 2v12m0 4v6M2 10h6v4H2v-4Zm7-5h6v4H9V5Zm7 9h6v4h-6v-4Z",
    users: "M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 22v-3a6 6 0 0 1 12 0v3m1-19a4 4 0 0 1 0 8m2 3a6 6 0 0 1 4 5v3",
    export: "M12 16V2m-5 5 5-5 5 5M3 10v12h18V10",
    chat: "M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 1 1 19 0ZM7 11h.01M12 11h.01M17 11h.01",
    case: "M3 7h18v14H3V7Zm5 0V3h8v4M3 12h18",
    plus: "M12 3v18M3 12h18",
    clock: "M3 8V3m0 5h5m-5 0a9 9 0 1 1 0 8M12 6v6l4 2",
    grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
    agent: "M8 6V3h8v3M4 7h16v13H4V7Zm4 5h1m6 0h1M8 16h8M1 10v7m22-7v7",
    tool: "m14 4 3-2-1 5 3 2 3-2-1 5-4 2-9 9-5-5 9-9 2-5Z",
    automation:
      "M8 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM15 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 8v4l7 5m7-9v4l-7 5",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind] ?? paths.book} />
    </svg>
  );
}

export function Sheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className="reference-sheet"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      aria-labelledby="reference-sheet-title"
    >
      <header>
        <div>
          <span className="scene-kicker">VOTRE ESPACE DE TRAVAIL</span>
          <h2 id="reference-sheet-title">{title}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Fermer l’espace de travail">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ReferenceRail({
  active,
  onBack,
  onSelect,
  onNavigate,
}: {
  active: string;
  onBack: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
}) {
  return (
    <aside className="reference-rail">
      <button className="reference-brand" type="button" onClick={onBack} aria-label="Retour à la roue des mondes">
        I D A
      </button>
      <p>
        INTELLIGENT
        <br />
        DIGITAL
        <br />
        AGENT
      </p>
      <nav aria-label="Environnements">
        {(
          [
            ["home", "Home", "⌂"],
            ["health", "Care", "♡"],
            ["music", "Music Studio", "♫"],
            ["creative", "Creative Lab", "✧"],
            ["research", "Knowledge", "▣"],
            ["workspace", "Productivity", "◇"],
            ["finance", "Finance", "▥"],
            ["social", "Social", "◌"],
            ["travel", "Explorer", "↗"],
            ["fabrique", "La Fabrique", "⬡"],
          ] as const
        ).map(([id, label, icon]) => (
          <button type="button" key={id} aria-current={id === active ? "page" : undefined} onClick={() => onSelect(id)}>
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => onNavigate("system")}>
          <span aria-hidden="true">◎</span>System
        </button>
      </nav>
      <p className="reference-signature">
        HUMAN
        <br />
        AI
        <br />
        TOGETHER
      </p>
    </aside>
  );
}
