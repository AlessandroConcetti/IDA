export type RecognitionResultEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
export interface DeviceRecognition {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
export interface DeviceRecognitionConstructor {
  new (): DeviceRecognition;
  available?: (options: { langs: string[]; processLocally: true }) => Promise<string>;
}
export function deviceRecognitionConstructor(): DeviceRecognitionConstructor | undefined {
  const host = window as Window & {
    SpeechRecognition?: DeviceRecognitionConstructor;
    webkitSpeechRecognition?: DeviceRecognitionConstructor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition;
}

export async function inspectLocalDictation(
  Recognition: DeviceRecognitionConstructor | undefined,
): Promise<"AVAILABLE" | "PACK_MISSING" | "UNSUPPORTED"> {
  if (!Recognition?.available) return "UNSUPPORTED";
  const recognition = new Recognition();
  if (!("processLocally" in recognition)) return "UNSUPPORTED";
  const status = await Recognition.available({ langs: ["fr-FR"], processLocally: true });
  return status === "available"
    ? "AVAILABLE"
    : status === "downloadable" || status === "downloading"
      ? "PACK_MISSING"
      : "UNSUPPORTED";
}

/** Construction passive. Seul start(), appelé depuis le geste utilisateur, ouvre le micro. */
export class LocalDictation {
  private active: DeviceRecognition | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly constructorType: DeviceRecognitionConstructor,
    private readonly callbacks: {
      text: (text: string) => void;
      ended: () => void;
      failed: () => void;
    },
  ) {}
  start(): void {
    if (this.active) return;
    const recognition = new this.constructorType();
    if (!("processLocally" in recognition)) throw new Error("LOCAL_RECOGNITION_REQUIRED");
    recognition.processLocally = true;
    if (recognition.processLocally !== true) throw new Error("LOCAL_RECOGNITION_REQUIRED");
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    this.active = recognition;
    recognition.onresult = (event) => {
      if (this.active !== recognition) return;
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim()
        .slice(0, 3000);
      this.stop();
      if (text) this.callbacks.text(text);
    };
    recognition.onerror = () => {
      if (this.active === recognition) {
        this.stop();
        this.callbacks.failed();
      }
    };
    recognition.onend = () => {
      if (this.active === recognition) this.stop();
    };
    this.timer = setTimeout(() => this.stop(), 25_000);
    try {
      recognition.start();
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const recognition = this.active;
    this.active = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
    try {
      recognition.abort();
    } catch {
      /* Le nettoyage ne doit jamais échouer. */
    } finally {
      this.callbacks.ended();
    }
  }
}

export function frenchLocalVoices<T extends { lang: string; localService: boolean }>(voices: readonly T[]): T[] {
  return voices.filter((voice) => voice.localService === true && /^fr(?:-|_|$)/i.test(voice.lang));
}
