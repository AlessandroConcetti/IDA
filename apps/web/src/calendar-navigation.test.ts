import { describe, expect, it, vi } from "vitest";
import { type EditorialCalendarSnapshot, fetchEditorialCalendar } from "./api";
import { adjacentCalendarAnchor, createCalendarReader } from "./calendar-navigation";

const snapshot: EditorialCalendarSnapshot = {
  range: { view: "MONTH", timezone: "Europe/Paris", from: "2026-09-30T22:00:00.000Z", to: "2026-10-31T23:00:00.000Z" },
  items: [],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Navigation cliente sans calcul de durée civile", () => {
  it("désactive la navigation hors bornes plutôt que d’envoyer une query rejetée", () => {
    expect(adjacentCalendarAnchor({ ...snapshot.range, from: "1000-01-01T00:00:00.000Z" }, -1)).toBeUndefined();
    expect(adjacentCalendarAnchor({ ...snapshot.range, to: "9999-01-01T00:00:00.000Z" }, 1)).toBeUndefined();
    expect(adjacentCalendarAnchor({ ...snapshot.range, from: "invalid" }, -1)).toBeUndefined();
  });
  it("désigne la borne suivante et la milliseconde précédente, même sur un mois avec DST", () => {
    expect(adjacentCalendarAnchor(snapshot.range, 1)).toBe("2026-10-31T23:00:00.000Z");
    expect(adjacentCalendarAnchor(snapshot.range, -1)).toBe("2026-09-30T21:59:59.999Z");
  });
  it("transmet l’ancre au serveur et laisse Aujourd’hui à son horloge", async () => {
    const load = vi.fn().mockResolvedValue(snapshot);
    const request = { view: "MONTH" as const, anchor: "2026-10-31T23:00:00.000Z" };
    const reader = createCalendarReader(request, load);
    request.anchor = "2027-01-01T00:00:00.000Z";
    const disconnect = reader.connect();
    await settle();
    expect(load).toHaveBeenCalledWith({ view: "MONTH", anchor: "2026-10-31T23:00:00.000Z" });
    disconnect();
    const today = createCalendarReader({ view: "DAY" }, load);
    const stop = today.connect();
    await settle();
    expect(load).toHaveBeenLastCalledWith({ view: "DAY" });
    stop();
  });
  it.each(["success", "error"] as const)(
    "ignore une ancienne réponse %s après changement de période",
    async (outcome) => {
      const pending = deferred<EditorialCalendarSnapshot>();
      const oldReader = createCalendarReader({ view: "MONTH" }, () => pending.promise);
      const stopOld = oldReader.connect();
      stopOld();
      const current = createCalendarReader({ view: "DAY", anchor: snapshot.range.from }, async () => snapshot);
      expect(current.getSnapshot()).toEqual({ phase: "idle" });
      const stop = current.connect();
      await settle();
      if (outcome === "success") pending.resolve(snapshot);
      else pending.reject(new Error("ancienne erreur"));
      await settle();
      expect(oldReader.getSnapshot()).toEqual({ phase: "idle" });
      expect(current.getSnapshot()).toEqual({ phase: "ready", data: snapshot });
      stop();
    },
  );
  it("masque immédiatement range/items pendant actualisation et erreur puis permet un réessai", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(snapshot);
    const reader = createCalendarReader({ view: "MONTH" }, load);
    const stop = reader.connect();
    await settle();
    expect(reader.getSnapshot().phase).toBe("ready");
    reader.refresh();
    expect(reader.getSnapshot()).toEqual({ phase: "loading" });
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "unavailable" });
    reader.refresh();
    await settle();
    expect(reader.getSnapshot()).toEqual({ phase: "ready", data: snapshot });
    stop();
  });
  it("construit la query d’ancre sans fournir des bornes ni un fuseau client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: snapshot }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await fetchEditorialCalendar({ view: "MONTH", anchor: snapshot.range.from });
      const url = new URL(fetchMock.mock.calls[0]?.[0], "http://localhost");
      expect([...url.searchParams.entries()]).toEqual([
        ["view", "MONTH"],
        ["anchor", snapshot.range.from],
      ]);
      await expect(
        fetchEditorialCalendar({
          view: "MONTH",
          anchor: snapshot.range.from,
          from: snapshot.range.from,
          to: snapshot.range.to,
        }),
      ).rejects.toThrow("ne peuvent pas être combinées");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
