import { type ReactNode, useEffect, useRef } from "react";
import type { NavigationId } from "./data";

export function LineIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
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
