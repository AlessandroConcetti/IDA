import { describe, expect, it } from "vitest";
import { calendarQuerySchema } from "./index";

describe("Navigation du calendrier : query stricte", () => {
  it("accepte une ancre, les bornes historiques ou l’horloge serveur", () => {
    expect(calendarQuerySchema.safeParse({ view: "MONTH", anchor: "2026-12-31T23:30:00.000Z" }).success).toBe(true);
    expect(calendarQuerySchema.safeParse({ view: "WEEK" }).success).toBe(true);
    expect(
      calendarQuerySchema.safeParse({ from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }).success,
    ).toBe(true);
  });
  it.each([
    { anchor: "2026-02-30T00:00:00.000Z" },
    { anchor: "not-a-date" },
    { anchor: "2026-09-01" },
    { anchor: "0999-01-01T00:00:00.000Z" },
    { anchor: "9999-12-31T23:59:59.999Z" },
    { anchor: "2026-09-01T00:00:00.000Z", from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    { anchor: "2026-09-01T00:00:00.000Z", from: "2026-09-01T00:00:00.000Z" },
    { anchor: "2026-09-01T00:00:00.000Z", timezone: "UTC" },
    { anchor: "2026-09-01T00:00:00.000Z", workspaceId: "wsp_other" },
  ])("refuse une query ambiguë, invalide ou injectée : %j", (input) => {
    expect(calendarQuerySchema.safeParse(input).success).toBe(false);
  });
});
