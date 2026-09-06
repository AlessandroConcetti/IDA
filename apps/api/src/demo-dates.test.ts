import { describe, expect, it } from "vitest";
import { getDemoDates } from "./demo-dates.js";

describe("Dates reproductibles des nouvelles fixtures", () => {
  it("conserve le scénario historique lorsque son horloge est injectée", () => {
    expect(getDemoDates(new Date("2026-08-30T09:00:00Z"))).toEqual({
      studioPlannedAt: "2026-09-01T18:00:00.000Z",
      hookPlannedAt: "2026-09-03T17:30:00.000Z",
      upcomingReleaseDate: "2026-09-18",
    });
  });

  it.each([
    "2026-09-06T23:59:59Z",
    "2026-12-31T23:59:59Z",
    "2028-02-28T23:59:59Z",
    "2026-03-28T23:59:59Z",
    "2026-10-24T23:59:59Z",
  ])("reste futur, ordonné et sans mutation de l'horloge à %s", (instant) => {
    const now = new Date(instant);
    const before = now.getTime();
    const dates = getDemoDates(now);
    expect(now.getTime()).toBe(before);
    expect(Date.parse(dates.studioPlannedAt)).toBeGreaterThan(before + 24 * 60 * 60 * 1000);
    expect(Date.parse(dates.hookPlannedAt)).toBeGreaterThan(Date.parse(dates.studioPlannedAt));
    expect(Date.parse(dates.upcomingReleaseDate)).toBeGreaterThan(Date.parse(dates.hookPlannedAt));
    expect(getDemoDates(new Date(instant))).toEqual(dates);
  });

  it("refuse une horloge invalide", () => {
    expect(() => getDemoDates(new Date("invalid"))).toThrow(RangeError);
  });
});
