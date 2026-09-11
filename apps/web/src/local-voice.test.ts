import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DeviceRecognition,
  frenchLocalVoices,
  inspectLocalDictation,
  LocalDictation,
  type RecognitionResultEvent,
} from "./local-voice";

class Recognition implements DeviceRecognition {
  static instances: Recognition[] = [];
  static available = vi.fn().mockResolvedValue("available");
  processLocally = false;
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 0;
  onresult: DeviceRecognition["onresult"] = null;
  onerror: DeviceRecognition["onerror"] = null;
  onend: DeviceRecognition["onend"] = null;
  start = vi.fn(() => {
    expect(this.processLocally).toBe(true);
  });
  abort = vi.fn();
  constructor() {
    Recognition.instances.push(this);
  }
}
afterEach(() => {
  vi.useRealTimers();
  Recognition.instances.length = 0;
  Recognition.available.mockResolvedValue("available");
});
function fixture() {
  const callbacks = { text: vi.fn(), ended: vi.fn(), failed: vi.fn() };
  return { callbacks, dictation: new LocalDictation(Recognition, callbacks) };
}
describe("Voix locale — pas de capteur ou cloud implicite", () => {
  it("la construction et la vérification n'ouvrent pas le micro", async () => {
    fixture();
    expect(Recognition.instances).toHaveLength(0);
    expect(await inspectLocalDictation(Recognition)).toBe("AVAILABLE");
    expect(Recognition.available).toHaveBeenCalledWith({ langs: ["fr-FR"], processLocally: true });
    expect(Recognition.instances[0]?.start).not.toHaveBeenCalled();
  });
  it("refuse une disponibilité inconnue, absente ou non locale", async () => {
    expect(await inspectLocalDictation(undefined)).toBe("UNSUPPORTED");
    Recognition.available.mockResolvedValueOnce("unavailable");
    expect(await inspectLocalDictation(Recognition)).toBe("UNSUPPORTED");
    Recognition.available.mockResolvedValueOnce("downloadable");
    expect(await inspectLocalDictation(Recognition)).toBe("PACK_MISSING");
    for (const item of Recognition.instances) expect(item.start).not.toHaveBeenCalled();
  });
  it("refuse un moteur ancien avant start", () => {
    class Old extends Recognition {
      constructor() {
        super();
        Reflect.deleteProperty(this, "processLocally");
      }
    }
    expect(() => new LocalDictation(Old, fixture().callbacks).start()).toThrow("LOCAL_RECOGNITION_REQUIRED");
    expect(Recognition.instances[0]?.start).not.toHaveBeenCalled();
  });
  it("start est explicite, français et strictement local, sans double ouverture", () => {
    const f = fixture();
    f.dictation.start();
    f.dictation.start();
    const engine = Recognition.instances[0];
    expect(engine?.start).toHaveBeenCalledTimes(1);
    expect(engine).toMatchObject({ processLocally: true, lang: "fr-FR", continuous: false, interimResults: false });
    f.dictation.stop();
  });
  it("coupe au bout de 25 secondes et ne redémarre jamais", () => {
    vi.useFakeTimers();
    const f = fixture();
    f.dictation.start();
    vi.advanceTimersByTime(25_000);
    expect(Recognition.instances[0]?.abort).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(Recognition.instances).toHaveLength(1);
    expect(f.callbacks.text).not.toHaveBeenCalled();
  });
  it("ignore les résultats et erreurs tardifs après fermeture", () => {
    const f = fixture();
    f.dictation.start();
    const engine = Recognition.instances[0];
    const late = engine?.onresult;
    const lateError = engine?.onerror;
    f.dictation.stop();
    f.dictation.stop();
    late?.({ results: [{ isFinal: true, 0: { transcript: "texte tardif" } }] });
    lateError?.();
    expect(f.callbacks.text).not.toHaveBeenCalled();
    expect(f.callbacks.failed).not.toHaveBeenCalled();
    expect(engine?.abort).toHaveBeenCalledTimes(1);
    expect(engine?.onresult).toBeNull();
  });
  it("termine la capture avant de restituer le texte, sans commande ni envoi", () => {
    const f = fixture();
    f.dictation.start();
    const engine = Recognition.instances[0];
    engine?.onresult?.({
      results: [{ isFinal: true, 0: { transcript: " Bonjour IDA " } }],
    } satisfies RecognitionResultEvent);
    expect(engine?.abort).toHaveBeenCalledTimes(1);
    expect(f.callbacks.text).toHaveBeenCalledWith("Bonjour IDA");
    expect(f.callbacks.ended.mock.invocationCallOrder[0]).toBeLessThan(
      f.callbacks.text.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it("une erreur abort ne casse pas le nettoyage", () => {
    const f = fixture();
    f.dictation.start();
    Recognition.instances[0]?.abort.mockImplementation(() => {
      throw new Error("ABORT_FAILED");
    });
    expect(() => f.dictation.stop()).not.toThrow();
    expect(f.callbacks.ended).toHaveBeenCalledTimes(1);
    expect(Recognition.instances[0]?.onresult).toBeNull();
  });
  it("exclut les voix distantes même françaises", () => {
    const local = { lang: "fr-FR", localService: true };
    expect(
      frenchLocalVoices([local, { lang: "fr-CA", localService: false }, { lang: "en-US", localService: true }]),
    ).toEqual([local]);
  });
});
