import { afterEach, expect, it, vi } from "vitest";
import { invalidateWorkspaceRequests } from "./api-transport";
import { followupDueUtc } from "./music-followup-date";
import { consumeMusicFollowupNavigation, queueMusicFollowupNavigation } from "./music-followup-navigation";

afterEach(() => {
  invalidateWorkspaceRequests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("keeps only a validated one-shot reference, bound to the target and the current session", () => {
  const task = `task_${"a".repeat(32)}`;
  const contact = `mct_${"b".repeat(32)}`;
  queueMusicFollowupNavigation("workspace", task);
  expect(consumeMusicFollowupNavigation("music")).toBeUndefined();
  expect(consumeMusicFollowupNavigation("workspace")).toBe(task);
  expect(consumeMusicFollowupNavigation("workspace")).toBeUndefined();
  queueMusicFollowupNavigation("music", contact);
  expect(consumeMusicFollowupNavigation("music")).toBe(contact);
  for (const invalid of ["https://example.com", "../../etc", "mct_bad", "task_bad/input"]) {
    queueMusicFollowupNavigation("music", invalid);
    expect(consumeMusicFollowupNavigation("music")).toBeUndefined();
  }
  queueMusicFollowupNavigation("workspace", task);
  invalidateWorkspaceRequests();
  expect(consumeMusicFollowupNavigation("workspace")).toBeUndefined();
});
it("expires navigation without copying task content", () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1);
  queueMusicFollowupNavigation("workspace", "task_example");
  clock.mockReturnValue(300001);
  expect(consumeMusicFollowupNavigation("workspace")).toBeUndefined();
});
it("converts valid local dates and rejects normalized dates and arbitrary input", () => {
  expect(followupDueUtc("2026-10-15T10:30")).toBe(new Date(2026, 9, 15, 10, 30).toISOString());
  expect(followupDueUtc("2024-02-29T12:00")).toBe(new Date(2024, 1, 29, 12).toISOString());
  for (const bad of [
    "",
    "2026-02-30T09:00",
    "2026-02-29T12:00",
    "2026-13-01T12:00",
    "2026-10-15T25:00",
    "2026-10-15T10:30Z",
    "tomorrow",
  ])
    expect(followupDueUtc(bad)).toBeNull();
});
it("rejects the spring gap and documents the earlier occurrence at the autumn overlap in Paris", () => {
  vi.stubEnv("TZ", "Europe/Paris");
  expect(followupDueUtc("2026-03-29T02:30")).toBeNull();
  expect(followupDueUtc("2026-10-25T02:30")).toBe("2026-10-25T00:30:00.000Z");
});
