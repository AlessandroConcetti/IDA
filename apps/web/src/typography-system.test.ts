import { describe, expect, it } from "vitest";
import {
  brandIds,
  defaultTypography,
  duplicateOf,
  parseTypography,
  sameTypefacePair,
  sameTypography,
  typographyCss,
} from "./typography-system";

describe("La Fabrique — typographie", () => {
  it("livre quatre identités distinctes", () => {
    for (const brand of brandIds) {
      expect(defaultTypography[brand].brand).toBe(brand);
      expect(duplicateOf(defaultTypography[brand], defaultTypography)).toBeNull();
    }
  });
  it("refuse les valeurs corrompues ou CSS non autorisé", () => {
    const invalid = parseTypography(
      { display: "url(https://evil)", tracking: 999, scale: NaN, uppercase: "true", motion: "spin" },
      "ida-studio",
    );
    expect(invalid).toEqual(defaultTypography["ida-studio"]);
    expect(typographyCss(invalid)).not.toContain("evil");
  });
  it("bloque une identité dupliquée indépendamment du nom", () => {
    const same = { ...defaultTypography.alessandro, brand: "egeri" as const };
    expect(sameTypography(same, defaultTypography.alessandro)).toBe(true);
    expect(duplicateOf(same, defaultTypography)).toBe("alessandro");
    const changedOnlyMotion = { ...same, motion: "rise" as const, weight: 700 as const };
    expect(sameTypography(changedOnlyMotion, defaultTypography.alessandro)).toBe(false);
    expect(sameTypefacePair(changedOnlyMotion, defaultTypography.alessandro)).toBe(true);
    expect(duplicateOf(changedOnlyMotion, defaultTypography)).toBe("alessandro");
  });
  it("exporte des tokens adaptatifs sans requête réseau ni animation imposée", () => {
    const css = typographyCss({ ...defaultTypography.egeri, motion: "none" });
    expect(css).toContain("clamp(");
    expect(css).toContain("--site-font-display:");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("animation: ida-type");
    const animated = typographyCss(defaultTypography["ida-studio"]);
    expect(animated).toContain("prefers-reduced-motion");
  });
});
