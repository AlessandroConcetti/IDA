import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuroraHome } from "./AuroraHome";
import type { ActivityLogPage, CommandCenterSummary, TaskRecord } from "./api";
import { HomeActivityCard, HomeMetrics, HomeOverview, HomeTasksCard } from "./HomeOverview";
import { homeActivityLabel, homeMetrics, homeTimestamp, homeWorkspaceDate, openHomeTasks } from "./home-overview";
import { readHomeStart, saveHomeStart } from "./home-start";

const summary: CommandCenterSummary = {
  generatedAt: "2026-09-07T12:00:00Z",
  workspaceDate: "2026-09-07",
  timezone: "Europe/Paris",
  pendingApprovals: 7,
  activeInternalSchedules: 3,
  activeCampaigns: 0,
  upcomingReleases: 2,
};
const tasks: TaskRecord[] = [
  { id: "no-date", title: "Sans date", status: "TODO" },
  { id: "done", title: "Déjà terminée", status: "DONE", dueAt: "2026-01-01T12:00:00Z" },
  { id: "later", title: "En cours", status: "IN_PROGRESS", dueAt: "2026-10-01T12:00:00Z" },
  { id: "cancelled", title: "Annulée", status: "CANCELLED" },
  { id: "first", title: "À préparer", status: "TODO", dueAt: "2026-09-07T12:00:00Z" },
  { id: "invalid-date", title: "Date invalide", status: "TODO", dueAt: "not-a-date" },
];
const noAction = () => undefined;

describe("IDA Home — aperçus factuels en lecture seule", () => {
  it("conserve les routes réelles pour les quatre compteurs", () => {
    expect(homeMetrics.map(({ target }) => target)).toEqual(["content", "calendar", "campaigns", "music"]);
    const html = renderToStaticMarkup(createElement(HomeMetrics, { summary, source: "api", onNavigate: noAction }));
    for (const value of [7, 3, 0, 2]) expect(html).toContain(`home-metric-number">${value}</span>`);
    expect(html).toContain("Planifications internes");
  });
  it.each(["loading", "local"] as const)("ne montre pas les anciens compteurs dans l’état %s", (source) => {
    const html = renderToStaticMarkup(createElement(HomeMetrics, { summary, source, onNavigate: noAction }));
    expect(html.match(/home-metric-number">—/g)).toHaveLength(4);
    expect(html).not.toMatch(/home-metric-number">[0-9]/);
  });
  it("trie seulement les tâches ouvertes, sans modifier les données du Core", () => {
    const before = tasks.map(({ id }) => id);
    expect(openHomeTasks(tasks).map(({ id }) => id)).toEqual(["first", "later", "no-date", "invalid-date"]);
    expect(tasks.map(({ id }) => id)).toEqual(before);
    const html = renderToStaticMarkup(
      createElement(HomeTasksCard, {
        state: { phase: "ready", data: tasks },
        timezone: "Europe/Paris",
        refresh: noAction,
        onNavigate: noAction,
      }),
    );
    expect(html).toContain("4 tâches ouvertes");
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain("Sans échéance");
    expect(html).not.toContain("Déjà terminée");
    expect(html).not.toContain("Annulée");
    expect(html).not.toContain("Date invalide");
    expect(html).not.toContain('type="checkbox"');
  });
  it("distingue tâches absentes, chargement et indisponibilité", () => {
    const props = { timezone: undefined, refresh: noAction, onNavigate: noAction };
    const empty = renderToStaticMarkup(createElement(HomeTasksCard, { ...props, state: { phase: "ready", data: [] } }));
    const missing = renderToStaticMarkup(createElement(HomeTasksCard, { ...props, state: { phase: "unavailable" } }));
    const loading = renderToStaticMarkup(createElement(HomeTasksCard, { ...props, state: { phase: "loading" } }));
    expect(empty).toContain("0 tâches ouvertes");
    expect(empty).toContain("Aucune tâche ouverte");
    expect(missing).toContain("Réessayer");
    expect(missing).toContain("Nombre de tâches indisponible");
    expect(missing).not.toContain("Aucune tâche ouverte");
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain("0 tâches ouvertes");
  });
  it("affiche les échéances dans le fuseau du workspace, jamais celui du navigateur", () => {
    expect(homeTimestamp("2026-09-07T23:00:00Z", "Europe/Paris")).toContain("8 sept.");
    expect(homeTimestamp("2026-09-07T23:00:00Z", "America/Los_Angeles")).toContain("7 sept.");
    expect(homeTimestamp("2026-09-07T23:00:00Z", "Europe/Paris", true)).toBe("01:00");
    expect(homeTimestamp("bad", "Europe/Paris")).toBe("Date indisponible");
    expect(homeTimestamp(summary.generatedAt, undefined)).toBe("Date indisponible");
    expect(homeTimestamp(summary.generatedAt, "invalid-timezone")).toBe("Date indisponible");
  });
  it("prend la date du workspace sans inventer l’heure locale ni le prénom", () => {
    expect(homeWorkspaceDate(summary)).toBe("lundi 7 septembre");
    expect(homeWorkspaceDate(undefined)).toBe("Votre espace personnel");
    expect(homeWorkspaceDate({ ...summary, workspaceDate: "2026-02-30" })).toBe("Votre espace personnel");
    expect(homeWorkspaceDate({ ...summary, workspaceDate: "bad" })).toBe("Votre espace personnel");
  });
  it("limite l’activité à trois événements dans l’ordre serveur, sans notification inventée ni payload libre", () => {
    const data: ActivityLogPage = {
      items: ["task.completed", "post_variant.internal_scheduled", "not_known", "release.created"].map((action, i) => ({
        id: `${i}`,
        action,
        entityId: "private-id",
        entityType: "PRIVATE_TYPE",
        createdAt: summary.generatedAt,
      })),
    };
    const html = renderToStaticMarkup(
      createElement(HomeActivityCard, {
        state: { phase: "ready", data },
        timezone: summary.timezone,
        refresh: noAction,
        onNavigate: noAction,
      }),
    );
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html.indexOf("Tâche terminée")).toBeLessThan(html.indexOf("Contenu planifié dans IDA"));
    expect(html).toContain("Activité enregistrée");
    for (const hidden of [
      "private-id",
      "PRIVATE_TYPE",
      "not_known",
      "Release ajoutée",
      "notification",
      "publié sur Instagram",
    ])
      expect(html).not.toContain(hidden);
    expect(homeActivityLabel("__proto__")).toBe("Activité enregistrée");
  });
  it("ne rend pas le texte d’une tâche comme du HTML exécutable", () => {
    const html = renderToStaticMarkup(
      createElement(HomeTasksCard, {
        state: { phase: "ready", data: [{ id: "one", status: "TODO", title: '<script>alert("secret")</script>' }] },
        timezone: summary.timezone,
        refresh: noAction,
        onNavigate: noAction,
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("ne retient que le choix explicite d’ouverture, sans créer de mémoire métier", () => {
    const getItem = vi.fn(() => "home");
    expect(readHomeStart({ getItem })).toBe("home");
    expect(getItem).toHaveBeenCalledWith("ida.ui.start-view.v1");
    for (const value of [null, "invalid", "worlds"]) {
      expect(readHomeStart({ getItem: () => value })).toBe("worlds");
    }
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    expect(readHomeStart({ getItem: unavailable })).toBe("worlds");
    expect(saveHomeStart({ setItem: unavailable }, "home")).toBe(false);
    const setItem = vi.fn();
    expect(saveHomeStart({ setItem }, "home")).toBe(true);
    expect(setItem).toHaveBeenCalledWith("ida.ui.start-view.v1", "home");
    expect(saveHomeStart({ setItem }, "worlds")).toBe(true);
    expect(setItem).toHaveBeenLastCalledWith("ida.ui.start-view.v1", "worlds");
  });
  it("ne déclenche aucune action, lecture serveur ni vidéo lors du rendu statique", () => {
    const fetchMock = vi.fn();
    const navigate = vi.fn();
    const command = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      for (const theme of ["classic", "scifi"] as const) {
        const html = renderToStaticMarkup(
          createElement(AuroraHome, {
            theme,
            source: "api",
            summary,
            onNavigate: navigate,
            onCommand: command,
            isSubmitting: false,
          }),
        );
        expect(html).toContain("Navigation IDA Home");
        expect(html).toContain("Suggestions de demande");
        expect(html).toContain('aria-label="Ouvrir IDA Home"');
        expect(html).not.toContain('id="home-tasks-title"');
        expect(html.match(/<main\b/g)).toHaveLength(1);
        expect(html).not.toMatch(/<video|<iframe|autoplay/iu);
      }
      renderToStaticMarkup(createElement(HomeOverview, { source: "local", timezone: undefined, onNavigate: navigate }));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
