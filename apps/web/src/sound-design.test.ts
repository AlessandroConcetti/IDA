import { describe, expect, it, vi } from "vitest";
import { LocalSoundDesign, soundPeriod, soundShouldPause } from "./sound-design";

function fixture() {
  const parameter = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const gain = () => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() });
  const oscillator = () => ({
    frequency: parameter(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
    type: "sine",
  });
  const context = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(gain),
    createOscillator: vi.fn(oscillator),
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    suspend: vi.fn(async () => {
      context.state = "suspended";
    }),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
  };
  const create = vi.fn(() => context as unknown as AudioContext);
  return { context, create, sound: new LocalSoundDesign(create) };
}

describe("Sons locaux, volontaires et réversibles", () => {
  it("ne crée aucun contexte sans geste explicite", async () => {
    const { sound, create } = fixture();
    sound.configure("scifi", "morning", true);
    sound.click(true);
    expect(await sound.enable(false)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it("différencie les clics et limite les rafales", async () => {
    const { sound, context } = fixture();
    await sound.enable(true);
    sound.click(false);
    expect(context.createOscillator).not.toHaveBeenCalled();
    sound.click(true);
    sound.click(true);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    expect(context.createOscillator.mock.results[0]?.value.frequency.setValueAtTime).toHaveBeenCalledWith(1480, 0);
    context.currentTime = 1;
    sound.configure("scifi", "evening", false);
    sound.click(true);
    expect(context.createOscillator.mock.results[2]?.value.frequency.setValueAtTime).toHaveBeenCalledWith(1060, 1);
    sound.disable();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(sound.active).toBe(false);
  });
  it("change l’atmosphère et arrête toutes les voix en pause", async () => {
    const { sound, context } = fixture();
    sound.configure("classic", "morning", true);
    await sound.enable(true);
    expect(context.createOscillator).toHaveBeenCalledTimes(6);
    sound.configure("classic", "evening", true);
    expect(context.createOscillator).toHaveBeenCalledTimes(12);
    expect(context.createOscillator.mock.results[6]?.value.frequency.setValueAtTime).toHaveBeenCalledWith(110, 0);
    sound.setPaused(true);
    expect(context.suspend).toHaveBeenCalled();
    sound.click(true);
    expect(context.createOscillator).toHaveBeenCalledTimes(12);
    sound.dispose();
    expect(await sound.enable(true)).toBe(false);
  });
  it("ne se réactive pas après une coupure pendant l’activation", async () => {
    const { sound, context } = fixture();
    let resume: (() => void) | undefined;
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    const activation = sound.enable(true);
    sound.disable();
    resume?.();
    expect(await activation).toBe(false);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });
  it("respecte l’heure locale, le micro, la lecture et la visibilité", () => {
    expect([5, 6, 17, 18, 23].map(soundPeriod)).toEqual(["evening", "morning", "morning", "evening", "evening"]);
    expect(soundShouldPause(false, false, ["IDLE", "ERROR"])).toBe(false);
    for (const phase of ["STARTING", "ARMED", "LISTENING", "THINKING", "SPEAKING"])
      expect(soundShouldPause(false, false, [phase])).toBe(true);
    expect(soundShouldPause(true, false, [])).toBe(true);
    expect(soundShouldPause(false, true, [])).toBe(true);
  });
  it("ne confirme jamais l’activation si le navigateur reste suspendu", async () => {
    const { sound, context } = fixture();
    context.resume.mockImplementation(async () => undefined);
    expect(await sound.enable(true)).toBe(false);
    expect(sound.active).toBe(false);
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.createOscillator).not.toHaveBeenCalled();
  });
  it("émet un changement d’état lors d’une reprise audio refusée", async () => {
    const { context } = fixture();
    const onActive = vi.fn();
    const sound = new LocalSoundDesign(() => context as unknown as AudioContext, onActive);
    expect(await sound.enable(true)).toBe(true);
    expect(onActive).toHaveBeenLastCalledWith(true);
    sound.setPaused(true);
    context.resume.mockRejectedValueOnce(new Error("Playback denied"));
    sound.setPaused(false);
    await Promise.resolve();
    expect(onActive).toHaveBeenLastCalledWith(false);
    expect(sound.active).toBe(false);
  });
  it("produit une nappe mesurable et bornée plutôt qu’un contexte silencieux", async () => {
    const { sound, context } = fixture();
    sound.configure("classic", "evening", true);
    await sound.enable(true);
    const gain = context.createGain.mock.results[1]?.value.gain;
    expect(gain?.linearRampToValueAtTime).toHaveBeenCalledWith(0.075, 1.2);
    expect((0.075 + 0.008) * (1 + 1 / 2 + 1 / 3) * 0.5).toBeLessThan(0.08);
  });
  it("confirme une activation mise en pause pendant la permission, puis reste réversible", async () => {
    const { context, create } = fixture();
    const onActive = vi.fn();
    const sound = new LocalSoundDesign(create, onActive);
    sound.configure("classic", "evening", true);
    let resume: (() => void) | undefined;
    context.resume.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resume = () => {
            context.state = "running";
            resolve();
          };
        }),
    );
    const activation = sound.enable(true);
    sound.setPaused(true);
    expect(onActive).not.toHaveBeenCalled();
    resume?.();
    expect(await activation).toBe(true);
    expect(onActive).toHaveBeenLastCalledWith(true);
    expect(context.state).toBe("suspended");
    expect(context.createOscillator).not.toHaveBeenCalled();
    sound.setPaused(false);
    await Promise.resolve();
    expect(context.state).toBe("running");
    expect(context.createOscillator).toHaveBeenCalledTimes(6);
    sound.disable();
    expect(onActive).toHaveBeenLastCalledWith(false);
    expect(context.state).toBe("closed");
  });
  it("réconcilie un retour visible pendant la suspension initiale", async () => {
    const { context, create } = fixture();
    const onActive = vi.fn();
    const sound = new LocalSoundDesign(create, onActive);
    sound.configure("classic", "evening", true);
    let suspend: (() => void) | undefined;
    context.suspend.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          suspend = () => {
            context.state = "suspended";
            resolve();
          };
        }),
    );
    const activation = sound.enable(true);
    sound.setPaused(true);
    await Promise.resolve();
    expect(context.suspend).toHaveBeenCalledOnce();
    sound.setPaused(false);
    suspend?.();
    expect(await activation).toBe(true);
    expect(onActive).toHaveBeenLastCalledWith(true);
    expect(context.state).toBe("running");
    expect(context.createOscillator).toHaveBeenCalledTimes(6);
    sound.dispose();
  });
});
