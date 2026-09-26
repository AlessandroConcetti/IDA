import { describe, expect, it } from "vitest";
import type { HomeDeviceStatus } from "../../../packages/contracts/src/home-device";
import type { WeatherBulletin } from "../../../packages/contracts/src/weather";
import {
  hubAgendaSection,
  hubHomeSummary,
  hubMessagesSection,
  hubNextDayBoundary,
  hubReady,
  hubWeatherSummary,
  initialHubData,
  parseHubActivity,
  parseHubAgenda,
  parseHubApprovals,
  parseHubMessages,
  parseHubMusic,
  redactedHubData,
} from "./hub-data";

const now = Date.parse("2026-09-26T08:00:00Z");
const status: HomeDeviceStatus = { provider: "HOME_ASSISTANT", mode: "READ_ONLY_PILOT", state: "CONFIGURED" };
const event = (id: string, start: string, end: string) => ({
  id,
  title: `Événement de test ${id}`,
  source: "google",
  start,
  end,
  calendar: "Test",
  location: "Lieu test",
});
const calendar = (externalEvents: unknown[]) => ({
  data: {
    tool: "CALENDAR_READ",
    range: { view: "WEEK", from: "2026-09-21T00:00:00Z", to: "2026-09-28T00:00:00Z", timezone: "Europe/Paris" },
    items: [],
    externalEvents,
  },
});

describe("Le Hub · données sourcées", () => {
  it("ne peuple aucune information personnelle depuis la maquette", () => {
    for (const section of Object.values(initialHubData())) expect(section.data).toBeNull();
    expect(hubReady([]).state).toBe("empty");
  });

  it("retire toutes les valeurs projetées du tableau masqué, badges et projet musical compris", () => {
    const redacted = redactedHubData();
    expect(Object.keys(redacted).sort()).toEqual(Object.keys(initialHubData()).sort());
    for (const section of Object.values(redacted)) {
      expect(section.data).toBeNull();
      expect(section.notice).toBe("Détails masqués dans ce tableau.");
    }
  });

  it("expire un agenda même vide à minuit workspace, pas après 24 heures", () => {
    expect(hubAgendaSection(calendar([]), now)).toMatchObject({
      state: "empty",
      data: [],
      validUntil: Date.parse("2026-09-26T22:00:00Z"),
    });
    expect(hubNextDayBoundary(Date.parse("2026-03-28T23:00:00Z"), "Europe/Paris")).toBe(
      Date.parse("2026-03-29T22:00:00Z"),
    );
    expect(hubNextDayBoundary(Date.parse("2026-10-24T22:00:00Z"), "Europe/Paris")).toBe(
      Date.parse("2026-10-25T23:00:00Z"),
    );
  });

  it("projette aujourd’hui dans le fuseau IDA et inclut une visite traversant minuit", () => {
    const entries = parseHubAgenda(
      calendar([
        event("later", "2026-09-26T10:00:00Z", "2026-09-26T11:00:00Z"),
        event("midnight", "2026-09-25T23:00:00Z", "2026-09-26T01:00:00Z"),
        event("overnight", "2026-09-25T21:00:00Z", "2026-09-25T23:00:00Z"),
        event("yesterday", "2026-09-25T18:00:00Z", "2026-09-25T22:00:00Z"),
        event("tomorrow", "2026-09-26T22:00:00Z", "2026-09-26T23:00:00Z"),
        event("invalid", "2026-09-26T10:00:00Z", "2026-09-26T09:00:00Z"),
      ]),
      now,
    );
    expect(entries.map((item) => item.id)).toEqual(["google:overnight", "google:midnight", "google:later"]);
    expect(entries[0]).toMatchObject({ timezone: "Europe/Paris", detail: "Test · Lieu test" });
  });

  it("rejette une source de calendrier inconnue et une réponse sans contrat", () => {
    expect(() =>
      parseHubAgenda(
        calendar([{ ...event("1", "2026-09-26T10:00:00Z", "2026-09-26T11:00:00Z"), source: "fabricated" }]),
        now,
      ),
    ).toThrow();
    expect(() => parseHubAgenda({ data: { items: [] } }, now)).toThrow();
  });

  it("affiche uniquement l’état observé de la lampe et jamais un total du logement ou une sécurité supposés", () => {
    expect(hubHomeSummary(status).data).toBeNull();
    const observed = hubHomeSummary(
      status,
      { state: "OFF", observedAt: new Date(now).toISOString(), providerUpdatedAt: new Date(now - 30000).toISOString() },
      now,
    );
    expect(observed.data).toMatchObject({
      lightsOn: 0,
      lightsTotal: 1,
      temperature: null,
      security: null,
      label: "Éteinte",
    });
    expect(hubHomeSummary({ ...status, state: "DISABLED" }).data).toBeNull();
    expect(
      hubHomeSummary(
        status,
        {
          state: "ON",
          observedAt: new Date(now - 60001).toISOString(),
          providerUpdatedAt: new Date(now).toISOString(),
        },
        now,
      ).data,
    ).toBeNull();
  });

  it("n’assimile pas un état indisponible à zéro lampe allumée", () => {
    const result = hubHomeSummary(
      status,
      { state: "UNAVAILABLE", observedAt: new Date(now).toISOString(), providerUpdatedAt: new Date(now).toISOString() },
      now,
    );
    expect(result.state).toBe("unavailable");
    expect(result.data?.lightsOn).toBeNull();
  });

  it("retire les bulletins expirés et conserve une température réelle de zéro", () => {
    const bulletin = {
      fetchedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 1000).toISOString(),
      current: { temperature: 0, code: 0 },
    } as WeatherBulletin;
    expect(hubWeatherSummary(bulletin, "Test", now).data?.temperatureC).toBe(0);
    expect(hubWeatherSummary(bulletin, "Test", now + 2000).data).toBeNull();
    expect(hubWeatherSummary(undefined, "Test", now).data).toBeNull();
  });

  it("projette uniquement l’aperçu texte réellement retourné sans télécharger le corps complet", () => {
    const result = parseHubMessages({
      data: {
        tool: "EMAIL_READ",
        messages: [
          {
            id: "1",
            subject: "<b>Test</b>",
            sender: "sender@example.test",
            receivedAt: "2026-09-26T07:00:00Z",
            preview: "Extrait synthétique réellement retourné par le connecteur.",
          },
        ],
      },
    });
    expect(result[0]?.title).toBe("<b>Test</b>");
    expect(result[0]?.preview).toBe("Extrait synthétique réellement retourné par le connecteur.");
    expect(parseHubMessages({ data: { tool: "EMAIL_READ", messages: [] } })).toEqual([]);
  });

  it("omet un aperçu vide et refuse un extrait au-delà du contrat de 1000 caractères", () => {
    const message = {
      id: "empty",
      subject: "Test",
      sender: "sender@example.test",
      receivedAt: "2026-09-26T07:00:00Z",
      preview: " ",
    };
    expect(parseHubMessages({ data: { tool: "EMAIL_READ", messages: [message] } })[0]).not.toHaveProperty("preview");
    expect(() =>
      parseHubMessages({ data: { tool: "EMAIL_READ", messages: [{ ...message, preview: "x".repeat(1001) }] } }),
    ).toThrow();
  });

  it("ne produit pas de validation ou d’activité de remplacement", () => {
    expect(parseHubApprovals({ data: [] })).toEqual([]);
    expect(parseHubActivity({ data: { items: [] } })).toEqual([]);
    expect(() => parseHubApprovals({ data: [{ approvalState: "APPROVED" }] })).toThrow();
    expect(() => parseHubActivity({ data: { items: [{ action: "invented" }] } })).toThrow();
  });

  it("conserve le statut partiel lorsqu’un compte mail n’a pas répondu", () => {
    const result = hubMessagesSection({
      data: {
        tool: "EMAIL_READ",
        partial: true,
        coverage: "BOUNDED_INBOX_PREVIEWS",
        sources: [
          { provider: "gmail", state: "READ", count: 0 },
          { provider: "outlook", state: "FAILED", count: 0 },
        ],
        messages: [],
      },
    });
    expect(result.state).toBe("empty");
    expect(result.notice).toContain("Lecture partielle");
    expect(result.notice).toContain("Outlook : lecture échouée");
  });

  it("le studio vide reste vide, les liens distants ne deviennent pas des sources audio", () => {
    expect(parseHubMusic({ data: [] })).toBeNull();
    const track = {
      id: "trk_test",
      workspaceId: "wsp_test",
      artistProjectId: "art_test",
      title: "Test",
      artistCredit: "Artiste test",
      status: "DEMO",
      createdAt: "2026-09-26T07:00:00Z",
      updatedAt: "2026-09-26T07:00:00Z",
      links: ["https://untrusted.example/song"],
    };
    expect(parseHubMusic({ data: [track] })).toEqual({
      id: "trk_test",
      title: "Test",
      detail: "Artiste test",
      status: "DEMO",
    });
    expect(parseHubMusic({ data: [{ ...track, status: "ARCHIVED" }] })).toBeNull();
  });
});
