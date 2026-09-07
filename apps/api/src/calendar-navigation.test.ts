import type { CalendarView } from "@ida/contracts";
import { describe, expect, it } from "vitest";
import { defaultCalendarRange } from "./workspace-time";

describe("Fenêtres civiles calculées par le serveur", () => {
  it("préserve un même instant focal quand la semaine chevauche deux mois", () => {
    const instant = new Date("2026-10-01T12:00:00.000Z");
    expect(defaultCalendarRange(instant, "Europe/Paris", "WEEK").from).toBe("2026-09-27T22:00:00.000Z");
    expect(defaultCalendarRange(instant, "Europe/Paris", "MONTH").from).toBe("2026-09-30T22:00:00.000Z");
    expect(defaultCalendarRange(instant, "Europe/Paris", "DAY").from).toBe("2026-09-30T22:00:00.000Z");
  });
  it.each<[CalendarView, string, string, string]>([
    ["DAY", "2026-03-29T12:00:00Z", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"],
    ["DAY", "2026-10-25T12:00:00Z", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"],
    ["WEEK", "2026-03-29T12:00:00Z", "2026-03-22T23:00:00.000Z", "2026-03-29T22:00:00.000Z"],
    ["WEEK", "2026-10-25T12:00:00Z", "2026-10-18T22:00:00.000Z", "2026-10-25T23:00:00.000Z"],
    ["MONTH", "2026-02-28T12:00:00Z", "2026-01-31T23:00:00.000Z", "2026-02-28T23:00:00.000Z"],
    ["MONTH", "2028-02-29T12:00:00Z", "2028-01-31T23:00:00.000Z", "2028-02-29T23:00:00.000Z"],
    ["MONTH", "2026-04-30T12:00:00Z", "2026-03-31T22:00:00.000Z", "2026-04-30T22:00:00.000Z"],
    ["MONTH", "2026-12-31T12:00:00Z", "2026-11-30T23:00:00.000Z", "2026-12-31T23:00:00.000Z"],
  ])("%s autour de %s respecte les bornes et revient à la période de départ", (view, instant, from, to) => {
    const range = defaultCalendarRange(new Date(instant), "Europe/Paris", view);
    expect(range).toMatchObject({ view, from, to, timezone: "Europe/Paris" });
    const next = defaultCalendarRange(new Date(range.to), range.timezone, view);
    expect(next.from).toBe(range.to);
    const previous = defaultCalendarRange(new Date(Date.parse(next.from) - 1), range.timezone, view);
    expect(previous).toMatchObject({ view, from, to });
  });
  it("respecte aussi un workspace dont le jour civil diffère de la date UTC", () => {
    expect(defaultCalendarRange(new Date("2026-09-01T01:00:00Z"), "America/New_York", "DAY")).toMatchObject({
      from: "2026-08-31T04:00:00.000Z",
      to: "2026-09-01T04:00:00.000Z",
    });
  });
});
