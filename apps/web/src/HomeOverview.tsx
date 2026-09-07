import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type ActivityLogPage, type CommandCenterSummary, fetchActivityLogs, fetchTasks, type TaskRecord } from "./api";
import { onWorkspaceMutation } from "./api-transport";
import type { NavigationId } from "./data";
import { homeActivityLabel, homeMetrics, homeTimestamp, openHomeTasks } from "./home-overview";
import { SnapshotReader, type SnapshotState } from "./snapshot-reader";

const loadHomeActivity = () => fetchActivityLogs({ limit: 3 });

function useHomeReader<T>(load: () => Promise<T>, source: "api" | "local" | "loading") {
  const enabled = source === "api";
  const reader = useMemo(() => new SnapshotReader(load), [load]);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    const disconnect = reader.connect();
    const unsubscribe = onWorkspaceMutation(reader.refresh);
    return () => {
      unsubscribe();
      disconnect();
    };
  }, [reader, enabled]);
  return {
    state: enabled ? state : ({ phase: source === "loading" ? "loading" : "unavailable" } as SnapshotState<T>),
    refresh: reader.refresh,
  };
}

export function HomeMetrics({
  summary,
  source,
  onNavigate,
}: {
  summary?: CommandCenterSummary | undefined;
  source: "api" | "local" | "loading";
  onNavigate: (id: NavigationId) => void;
}) {
  const ready = source === "api" && summary !== undefined;
  return (
    <nav className="home-metrics" aria-label="Votre activité en un regard" aria-busy={source === "loading"}>
      {homeMetrics.map((metric, index) => (
        <button key={metric.key} type="button" onClick={() => onNavigate(metric.target)}>
          <span className="home-metric-number">{ready ? summary[metric.key] : "—"}</span>
          <span className="home-metric-label">{metric.label}</span>
          <span className="home-metric-index" aria-hidden="true">
            0{index + 1} ↗
          </span>
        </button>
      ))}
    </nav>
  );
}

function ReaderMessage({
  phase,
  empty,
  retry,
}: {
  phase: SnapshotState<unknown>["phase"];
  empty: string;
  retry: () => void;
}) {
  return (
    <div className="home-reader-message" role="status">
      <p>
        {phase === "ready"
          ? empty
          : phase === "unavailable"
            ? "Ces données sont momentanément indisponibles."
            : "Chargement de votre espace…"}
      </p>
      {phase === "unavailable" ? (
        <button type="button" onClick={retry}>
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

export function HomeTasksCard({
  state,
  timezone,
  refresh,
  onNavigate,
}: {
  state: SnapshotState<TaskRecord[]>;
  timezone: string | undefined;
  refresh: () => void;
  onNavigate: (id: NavigationId) => void;
}) {
  const tasks = state.phase === "ready" ? openHomeTasks(state.data) : [];
  return (
    <section
      className="home-daily-card"
      aria-labelledby="home-tasks-title"
      aria-busy={state.phase === "loading" || state.phase === "idle"}
    >
      <header>
        <span className="home-card-symbol" aria-hidden="true">
          ✓
        </span>
        <h2 id="home-tasks-title">À reprendre</h2>
        <span className="home-count">
          <span aria-hidden="true">{state.phase === "ready" ? tasks.length : "—"}</span>
          <span className="sr-only">
            {state.phase === "ready" ? `${tasks.length} tâches ouvertes` : "Nombre de tâches indisponible"}
          </span>
        </span>
      </header>
      {tasks.length ? (
        <ul className="home-task-list">
          {tasks.slice(0, 3).map((task) => (
            <li key={task.id}>
              <span className="home-task-mark" aria-hidden="true">
                {task.status === "IN_PROGRESS" ? "◐" : "○"}
              </span>
              <div>
                <strong>{task.title}</strong>
                <span>
                  {task.status === "IN_PROGRESS" ? "En cours · " : ""}
                  {task.dueAt ? homeTimestamp(task.dueAt, timezone) : "Sans échéance"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ReaderMessage
          phase={state.phase}
          empty="Aucune tâche ouverte. Un peu d’espace pour la suite."
          retry={refresh}
        />
      )}
      <footer>
        <button type="button" onClick={() => onNavigate("tasks")}>
          Voir mes tâches <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="home-refresh"
          aria-label="Actualiser les tâches"
          onClick={refresh}
          disabled={state.phase === "loading"}
        >
          ↻
        </button>
      </footer>
    </section>
  );
}

export function HomeActivityCard({
  state,
  timezone,
  refresh,
  onNavigate,
}: {
  state: SnapshotState<ActivityLogPage>;
  timezone: string | undefined;
  refresh: () => void;
  onNavigate: (id: NavigationId) => void;
}) {
  const items = state.phase === "ready" ? state.data.items.slice(0, 3) : [];
  return (
    <section
      className="home-daily-card"
      aria-labelledby="home-activity-title"
      aria-busy={state.phase === "loading" || state.phase === "idle"}
    >
      <header>
        <span className="home-card-symbol" aria-hidden="true">
          ◷
        </span>
        <h2 id="home-activity-title">Dernière activité</h2>
        <span className="home-card-note">Dans IDA</span>
      </header>
      {items.length ? (
        <ul className="home-activity-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="home-activity-dot" aria-hidden="true" />
              <div>
                <strong>{homeActivityLabel(item.action)}</strong>
                <time dateTime={item.createdAt}>{homeTimestamp(item.createdAt, timezone)}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ReaderMessage phase={state.phase} empty="Votre historique commence ici." retry={refresh} />
      )}
      <footer>
        <button type="button" onClick={() => onNavigate("system")}>
          Ouvrir le journal <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="home-refresh"
          aria-label="Actualiser l’activité"
          onClick={refresh}
          disabled={state.phase === "loading"}
        >
          ↻
        </button>
      </footer>
    </section>
  );
}

export function HomeOverview({
  source,
  timezone,
  onNavigate,
}: {
  source: "api" | "local" | "loading";
  timezone: string | undefined;
  onNavigate: (id: NavigationId) => void;
}) {
  const tasks = useHomeReader(fetchTasks, source);
  const activity = useHomeReader(loadHomeActivity, source);
  return (
    <div className="home-daily-grid">
      <HomeTasksCard {...tasks} timezone={timezone} onNavigate={onNavigate} />
      <HomeActivityCard {...activity} timezone={timezone} onNavigate={onNavigate} />
      <section className="home-continuity-card" aria-labelledby="home-continuity-title">
        <span className="home-continuity-star" aria-hidden="true">
          ✦
        </span>
        <p>UN SEUL SYSTÈME.</p>
        <h2 id="home-continuity-title">Tous vos mondes.</h2>
        <span>
          Musique, projets, idées.
          <br />
          Retrouvez le fil avec IDA.
        </span>
        <button type="button" onClick={() => onNavigate("ida")}>
          Ouvrir la conversation <span aria-hidden="true">↗</span>
        </button>
      </section>
    </div>
  );
}
