import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuroraHome } from "./AuroraHome";
import type { CommandCenterSummary } from "./api";

const summary: CommandCenterSummary = {
  generatedAt: "2026-09-05T12:00:00.000Z",
  workspaceDate: "2026-09-05",
  timezone: "Europe/Paris",
  pendingApprovals: 37,
  activeInternalSchedules: 4,
  activeCampaigns: 0,
  upcomingReleases: 11,
};
function render(source: "api" | "loading" | "local", onLock?: () => void) {
  const onNavigate = vi.fn();
  const onCommand = vi.fn();
  const html = renderToStaticMarkup(
    createElement(AuroraHome, { source, summary, onNavigate, onCommand, onLock, isSubmitting: false }),
  );
  expect(onNavigate).not.toHaveBeenCalled();
  expect(onCommand).not.toHaveBeenCalled();
  return html;
}
describe("Accueil Aurora : présentation sans nouveaux pouvoirs", () => {
  it("présente les cinq espaces existants et les entrées classiques sans agent actif implicite", () => {
    const html = render("api");
    for (const title of [
      "Command Center",
      "Artist Brain",
      "Music Brain",
      "Content Library",
      "Social Brain",
      "Explorer tous les espaces",
      "Navigation mobile",
      "Votre demande à IDA",
    ])
      expect(html).toContain(title);
    expect(html).toContain("37 propositions");
    expect(html).toContain("11 releases");
    expect(html).toContain("Démo locale");
    expect(html).not.toContain("Verrouiller IDA");
    expect(html).not.toMatch(/agents actifs|microphone|camera|autoplay/iu);
  });
  it("n’affiche pas de chiffres en cas de chargement ou d’indisponibilité même si un snapshot subsiste", () => {
    expect(render("loading")).toContain("Connexion à votre univers");
    expect(render("local")).toContain("Les données sont momentanément indisponibles");
    expect(render("local")).not.toContain("37 propositions");
  });
  it("montre le verrou uniquement quand la frontière d’accès le permet, sans l’appeler au rendu", () => {
    const onLock = vi.fn();
    expect(render("api", onLock)).toContain("Verrouiller IDA");
    expect(onLock).not.toHaveBeenCalled();
  });
});
