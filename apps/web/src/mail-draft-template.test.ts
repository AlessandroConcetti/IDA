import { afterEach, expect, it, vi } from "vitest";
import { invalidateWorkspaceRequests } from "./api-transport";
import { consumeMailDraftNavigation, queueMailDraftNavigation } from "./mail-draft-navigation";
import { proposeMusicMail } from "./mail-draft-template";

afterEach(() => {
  consumeMailDraftNavigation();
  vi.restoreAllMocks();
});
it("suggests editable factual text without credentials, invented experience, fee or promised booking", () => {
  const base = { projectName: "Projet réel", presentation: "", listeningUrl: "" };
  const privateEvent = proposeMusicMail({ ...base, purpose: "PRIVATE_EVENT" });
  expect(privateEvent.body).toContain("mariages, baptêmes et anniversaires privés");
  expect(privateEvent.body).not.toMatch(/années|matériel|€|disponible|témoignage/u);
  expect(privateEvent.subject).toContain(base.projectName);
  const label = proposeMusicMail({
    ...base,
    purpose: "LABEL_DEMO",
    trackTitle: "Titre choisi",
    listeningUrl: "https://music.example.com/demo",
  });
  expect(label.body).toContain("Titre choisi");
  expect(label.body).toContain("https://music.example.com/demo");
  expect(label.body).not.toContain("mariage");
  const gig = proposeMusicMail({ ...base, purpose: "GIG", presentation: "Je dispose de mon matériel." });
  expect(gig.body).toContain("Je dispose de mon matériel.");
  expect(gig.body).toContain("programmation DJ");
});
it("passes only a short-lived draft ID to Workspace and clears it with the session", () => {
  const id = `wmd_${"a".repeat(32)}`;
  queueMailDraftNavigation(id);
  expect(consumeMailDraftNavigation()).toBe(id);
  expect(consumeMailDraftNavigation()).toBeUndefined();
  for (const invalid of ["https://host.com", "../../path", "wmd_wrong"]) {
    queueMailDraftNavigation(invalid);
    expect(consumeMailDraftNavigation()).toBeUndefined();
  }
  const clock = vi.spyOn(Date, "now").mockReturnValue(1);
  queueMailDraftNavigation(id);
  clock.mockReturnValue(300001);
  expect(consumeMailDraftNavigation()).toBeUndefined();
  queueMailDraftNavigation(id);
  invalidateWorkspaceRequests();
  expect(consumeMailDraftNavigation()).toBeUndefined();
});
