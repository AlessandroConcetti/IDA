import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoiceControls } from "./VoiceControls";

describe("Commandes vocales — rendu passif", () => {
  it("n'active ni voix, micro, caméra, provider ni transcript au rendu", () => {
    const start = vi.fn();
    const speak = vi.fn();
    const getUserMedia = vi.fn();
    const onTranscript = vi.fn();
    vi.stubGlobal("window", { SpeechRecognition: start, speechSynthesis: { speak } });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    try {
      const html = renderToStaticMarkup(
        createElement(VoiceControls, { answer: "Bonjour", disabled: false, onTranscript }),
      );
      expect(html).toContain("micro fermé");
      expect(html).toContain('disabled="">Parler à IDA');
      expect(html).toContain('disabled="">Écouter la réponse');
      expect(start).not.toHaveBeenCalled();
      expect(speak).not.toHaveBeenCalled();
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(onTranscript).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
