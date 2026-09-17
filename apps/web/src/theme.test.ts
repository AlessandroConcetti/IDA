import { describe, expect, it, vi } from "vitest";
import { applyTheme, readTheme } from "./theme";

describe("Thème global, préférence purement visuelle", () => {
  it("restaure uniquement un thème reconnu et tolère un stockage indisponible", () => {
    expect(readTheme()).toBe("classic");
    expect(readTheme({ getItem: () => "scifi" })).toBe("scifi");
    expect(readTheme({ getItem: () => "unknown" })).toBe("classic");
    expect(
      readTheme({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe("classic");
  });
  it("applique la palette globale et ne persiste que le thème", () => {
    const root = { dataset: {} } as HTMLElement;
    const setItem = vi.fn();
    applyTheme("scifi", root, { setItem });
    expect(root.dataset).toEqual({ theme: "scifi", experience: "scifi" });
    expect(setItem).toHaveBeenCalledExactlyOnceWith("ida.ui.theme.v1", "scifi");
    applyTheme("classic", root, {
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(root.dataset.theme).toBe("classic");
  });
});
