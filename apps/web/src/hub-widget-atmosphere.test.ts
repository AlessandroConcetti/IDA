import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { classifyHubWeather, HubWidgetAtmosphere } from "./HubWidgetAtmosphere";

describe("Hub widget decorative atmosphere", () => {
  it.each([
    [[0, 1], "sun"],
    [[2, 3], "cloud"],
    [[45, 48], "fog"],
    [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], "rain"],
    [[71, 73, 75, 77, 85, 86], "snow"],
    [[95, 96, 99], "storm"],
  ] as const)("classifies only actual WMO readings %j as %s", (codes, expected) => {
    for (const code of codes) expect(classifyHubWeather(code)).toBe(expected);
  });

  it("does not infer sunshine or rain from missing, invalid or unsupported codes", () => {
    for (const code of [undefined, null, Number.NaN, Infinity, -1, 0.5, 4, 52, 68, 72, 97, 100]) {
      expect(classifyHubWeather(code)).toBe("neutral");
      const html = renderToStaticMarkup(createElement(HubWidgetAtmosphere, { kind: "weather", weatherCode: code }));
      expect(html).toContain('data-weather="neutral"');
      expect(html).not.toContain("__sun");
      expect(html).not.toContain("__fall");
    }
  });

  it("renders all atmospheres as noninteractive decoration without data or activity claims", () => {
    for (const kind of ["agenda", "house", "weather", "messages", "finance", "care", "music", "agents", "activity"]) {
      const html = renderToStaticMarkup(createElement(HubWidgetAtmosphere, { kind, weatherCode: 63 }));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-widget-atmosphere="${kind}"`);
      expect(html).not.toMatch(/<(button|input|audio|video)|role="(status|progressbar)"|https?:|%|€|En cours|Connecté/);
    }
  });

  it("keeps unknown widget types neutral and renders deterministically on the server", () => {
    const render = () => renderToStaticMarkup(createElement(HubWidgetAtmosphere, { kind: "future" }));
    expect(render()).toContain('data-widget-atmosphere="neutral"');
    expect(render()).not.toContain("<svg");
    expect(render()).toBe(render());
  });
});
