export type SoundTheme = "classic" | "scifi";
export type SoundPeriod = "morning" | "evening";
export type SoundPeriodChoice = "auto" | SoundPeriod;

/** The device's local clock affects presentation only. No durable preference is created. */
export function soundPeriod(hour: number): SoundPeriod {
  return hour >= 6 && hour < 18 ? "morning" : "evening";
}

export function soundShouldPause(hidden: boolean, modal: boolean, voiceActivities: readonly string[]): boolean {
  return hidden || modal || voiceActivities.some((activity) => activity !== "IDLE" && activity !== "ERROR");
}

type Voice = { oscillators: OscillatorNode[]; gains: GainNode[] };

/** Local procedural audio. Construction and configuration never create an AudioContext. */
export class LocalSoundDesign {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private ambient: Voice | null = null;
  private enabled = false;
  private activating = false;
  private paused = false;
  private disposed = false;
  private volume = 0.18;
  private atmosphere = false;
  private theme: SoundTheme = "classic";
  private period: SoundPeriod = "morning";
  private lastClick = -Infinity;
  private revision = 0;

  constructor(
    private readonly createContext: () => AudioContext | null,
    private readonly onActiveChange: (active: boolean) => void = () => undefined,
  ) {}

  get active(): boolean {
    return this.enabled;
  }

  async enable(trusted: boolean): Promise<boolean> {
    if (!trusted || this.disposed) return false;
    if (this.enabled) return true;
    const revision = ++this.revision;
    let activationContext: AudioContext | null = null;
    try {
      const context = this.createContext();
      if (!context) return false;
      activationContext = context;
      this.context = context;
      this.activating = true;
      this.master = context.createGain();
      this.master.gain.setValueAtTime(0, context.currentTime);
      this.master.connect(context.destination);
      this.enabled = true;
      await context.resume();
      if (revision !== this.revision || !this.enabled || this.disposed) return false;
      if (context.state !== "running") {
        this.disable();
        return false;
      }
      // Visibility may change while the browser is granting playback. Reconcile
      // the latest desired state before confirming activation, without allowing
      // setPaused() to invalidate this activation or start an overlapping resume.
      while (this.paused) {
        await context.suspend();
        if (revision !== this.revision || !this.enabled || this.disposed) return false;
        if (this.paused) break;
        await context.resume();
        if (revision !== this.revision || !this.enabled || this.disposed) return false;
        if (context.state !== "running") {
          this.disable();
          return false;
        }
      }
      if (!this.paused) {
        this.master.gain.setValueAtTime(this.volume, context.currentTime);
        this.startAtmosphere();
      }
      this.onActiveChange(this.enabled);
      return this.enabled;
    } catch {
      if (revision === this.revision) this.disable();
      return false;
    } finally {
      if (this.context === activationContext) this.activating = false;
    }
  }

  /** Immediate mute also releases the context; another explicit action is required to enable. */
  disable(): void {
    this.revision++;
    this.enabled = false;
    this.activating = false;
    this.onActiveChange(false);
    const context = this.context;
    if (context && this.master) {
      this.master.gain.cancelScheduledValues(context.currentTime);
      this.master.gain.setValueAtTime(0, context.currentTime);
    }
    this.stopVoices();
    this.master?.disconnect();
    this.master = null;
    this.context = null;
    this.lastClick = -Infinity;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }

  dispose(): void {
    this.disposed = true;
    this.disable();
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(0.5, volume)) : 0;
    if (this.context && this.master && this.enabled && !this.paused) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  configure(theme: SoundTheme, period: SoundPeriod, atmosphere: boolean): void {
    const changed = this.period !== period || this.atmosphere !== atmosphere;
    this.theme = theme;
    this.period = period;
    this.atmosphere = atmosphere;
    if (changed && this.ambient) this.stopVoice(this.ambient);
    this.startAtmosphere();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.enabled || this.activating) return;
    const revision = ++this.revision;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(0, context.currentTime);
    this.stopVoices();
    if (paused) {
      void context.suspend().catch(() => undefined);
    } else {
      void context.resume().then(
        () => {
          if (revision !== this.revision || !this.enabled || this.paused || this.disposed) return;
          if (context.state !== "running") {
            this.disable();
            return;
          }
          master.gain.setValueAtTime(this.volume, context.currentTime);
          this.startAtmosphere();
        },
        () => {
          if (revision === this.revision) this.disable();
        },
      );
    }
  }

  /** Trusted native click only, including keyboard activation of a native button. */
  click(trusted: boolean): void {
    const context = this.context;
    if (!trusted || !this.enabled || this.paused || this.disposed || !context || context.state !== "running") return;
    if (context.currentTime - this.lastClick < 0.09) return;
    this.lastClick = context.currentTime;
    if (this.theme === "classic") {
      this.tone(1480, 1120, 0.032, 0.12, "triangle");
      this.tone(740, 690, 0.055, 0.055, "sine");
    } else {
      this.tone(1060, 620, 0.075, 0.12, "sine");
      this.tone(2120, 1520, 0.043, 0.035, "triangle");
    }
  }

  private tone(frequency: number, endFrequency: number, duration: number, peak: number, type: OscillatorType): void {
    const context = this.context;
    if (!context || !this.master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    const voice = { oscillators: [oscillator], gains: [gain] };
    this.voices.add(voice);
    oscillator.onended = () => this.stopVoice(voice);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  private startAtmosphere(): void {
    const context = this.context;
    if (!this.enabled || this.paused || !this.atmosphere || this.ambient || !context || !this.master) return;
    if (context.state !== "running") return;
    const frequencies = this.period === "morning" ? [174.61, 261.63, 349.23] : [110, 164.81, 220];
    const voice: Voice = { oscillators: [], gains: [] };
    this.ambient = voice;
    this.voices.add(voice);
    for (const [index, frequency] of frequencies.entries()) {
      const tone = context.createOscillator();
      const envelope = context.createGain();
      const breath = context.createOscillator();
      const depth = context.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(frequency, context.currentTime);
      envelope.gain.setValueAtTime(0, context.currentTime);
      // Three soft sine voices, bounded to < 0.08 combined peak even at 50% master.
      // The previous 0.014 amplitude was almost inaudible at the default 18% volume.
      envelope.gain.linearRampToValueAtTime(0.075 / (index + 1), context.currentTime + 1.2);
      breath.frequency.setValueAtTime((this.period === "morning" ? 0.067 : 0.035) + index * 0.009, context.currentTime);
      depth.gain.setValueAtTime(0.008 / (index + 1), context.currentTime);
      tone.connect(envelope);
      breath.connect(depth);
      depth.connect(envelope.gain);
      envelope.connect(this.master);
      voice.oscillators.push(tone, breath);
      voice.gains.push(envelope, depth);
      tone.start();
      breath.start();
    }
  }

  private stopVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    if (voice === this.ambient) this.ambient = null;
    for (const oscillator of voice.oscillators) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        // A short click may already have ended before pause or disposal.
      }
      oscillator.disconnect();
    }
    for (const gain of voice.gains) gain.disconnect();
  }

  private stopVoices(): void {
    for (const voice of this.voices) this.stopVoice(voice);
  }
}
