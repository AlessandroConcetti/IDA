import { describe, expect, it } from "vitest";
import { hubClock, hubTemperature, hubTime, romanNumber } from "./hub-presentation";

describe("Le Hub presentation", () => {
  it("renders real clock minutes including midnight without a fake reference time", () => {
    expect(romanNumber(41)).toBe("XLI");
    expect(romanNumber(59)).toBe("LIX");
    expect(romanNumber(0)).toBe("N");
    expect(romanNumber(-1)).toBe("—");
    expect(hubClock(new Date(2026, 8, 26, 8, 41)).roman).toBe("VIII · XLI");
  });
  it("never invents weather readings", () => {
    expect(hubTemperature(null)).toBe("—°");
    expect(hubTemperature(Number.NaN)).toBe("—°");
    expect(hubTemperature(21.5)).toBe("21,5°");
    expect(hubTime("invalid")).toBe("—");
  });
  it("displays appointment time in its workspace timezone", () => {
    expect(hubTime("2026-09-26T08:00:00Z", "Europe/Paris")).toBe("10:00");
    expect(hubTime("2026-09-26T08:00:00Z", "America/New_York")).toBe("04:00");
    expect(hubTime("2026-09-26T08:00:00Z", "Invalid/Timezone")).toBe("—");
  });
});
