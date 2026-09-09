import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceRequests, onWorkspaceMutation } from "./api-transport";
import type { MediaAsset } from "./data";
import { MediaProposalComposer } from "./MediaProposalComposer";
import { canPrepareMedia, PostProposalSubmission, type ProposalFields, validateProposalFields } from "./post-proposal";

const input: ProposalFields = {
  mediaId: "med_night-drive",
  postTitle: "  Titre  ",
  platform: "INSTAGRAM",
  caption: " Texte ",
  objective: "Objectif",
  hashtags: ["#Studio"],
};
const key = "c9263d8a-51f5-4eb7-a3ce-8b87379d7c0e";
const receipt = {
  postId: `post_${"a".repeat(64)}`,
  variantId: `variant_${"a".repeat(64)}`,
  approvalId: `apr_${"a".repeat(64)}`,
  replayed: false,
};
afterEach(() => {
  invalidateWorkspaceRequests();
  vi.unstubAllGlobals();
});
describe("Préparer une publication sans effet implicite", () => {
  it("le rendu initial ne lit aucun média et ne crée aucune proposition", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const approvals = vi.fn();
    const html = renderToStaticMarkup(
      createElement(MediaProposalComposer, { mediaId: input.mediaId, onClose: vi.fn(), renderApprovals: approvals }),
    );
    expect(html).toContain("Préparer une publication.");
    expect(html).toContain("fieldset disabled");
    expect(html).toContain("Vérification du média");
    expect(html).not.toMatch(/<(video|audio|img)\b/);
    expect(fetch).not.toHaveBeenCalled();
    expect(approvals).not.toHaveBeenCalled();
  });
  it("n'autorise dans l'UI que des médias identifiés image/vidéo non archivés", () => {
    const media: MediaAsset = {
      id: input.mediaId,
      filename: "test.mp4",
      kind: "VIDEO",
      status: "UNUSED",
      detail: "",
      tone: "blue",
    };
    expect(canPrepareMedia(media)).toBe(true);
    expect(canPrepareMedia({ ...media, status: "PUBLISHED" })).toBe(true);
    expect(canPrepareMedia({ ...media, kind: "IMAGE" })).toBe(true);
    expect(canPrepareMedia({ ...media, status: "ARCHIVED" })).toBe(false);
    expect(canPrepareMedia({ ...media, kind: "AUDIO" })).toBe(false);
    expect(canPrepareMedia({ ...media, id: undefined })).toBe(false);
  });
  it("soumet seulement les champs connus via le transport partagé puis notifie le dashboard", async () => {
    const changed = vi.fn();
    const unsubscribe = onWorkspaceMutation(changed);
    try {
      const fetch = vi.fn().mockResolvedValue(Response.json({ data: receipt }, { status: 201 }));
      vi.stubGlobal("fetch", fetch);
      const submission = new PostProposalSubmission(() => key);
      expect(submission.locked).toBe(false);
      await expect(submission.submit({ ...input, secret: "ignored" } as ProposalFields)).resolves.toEqual(receipt);
      expect(submission.locked).toBe(true);
      const [url, init] = fetch.mock.calls[0] ?? [];
      expect(url).toBe("/v1/post-proposals");
      expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" });
      expect(JSON.parse(init.body)).toEqual({ requestId: key, ...validateProposalFields(input) });
      expect(init.body).not.toContain("ignored");
      expect(changed).toHaveBeenCalledTimes(1);
      await submission.submit(input);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
  it("un double clic partage la même requête en cours", async () => {
    let deliver: (response: Response) => void = () => {};
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const submission = new PostProposalSubmission(() => key);
    const a = submission.submit(input);
    const b = submission.submit(input);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    deliver(Response.json({ data: receipt }));
    await a;
  });
  it("après une réponse perdue, le retry explicite conserve clé ET contenu sans nouvel envoi automatique", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(Response.json({ data: { ...receipt, replayed: true } }));
    vi.stubGlobal("fetch", fetch);
    const submission = new PostProposalSubmission(() => key);
    await expect(submission.submit(input)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(submission.submit({ ...input, caption: "Ne pas remplacer" })).resolves.toMatchObject({
      replayed: true,
    });
    expect(fetch.mock.calls[0]?.[1].body).toBe(fetch.mock.calls[1]?.[1].body);
  });
  it.each([
    { postTitle: " " },
    { caption: "" },
    { objective: "x".repeat(2001) },
    { hashtags: Array(31).fill("#Test") },
    { mediaId: "../file" },
  ])("refuse la saisie invalide sans verrouillage ni POST : %j", (change) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const submission = new PostProposalSubmission(() => key);
    expect(() => submission.submit({ ...input, ...change })).toThrow();
    expect(submission.locked).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 409, 500])("garde la tentative et ne contourne pas un refus %s", async (status) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: "Refus" } }, { status }));
    vi.stubGlobal("fetch", fetch);
    const submission = new PostProposalSubmission(() => key);
    await expect(submission.submit(input)).rejects.toMatchObject({ status });
    expect(submission.locked).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("un reçu incohérent n'affiche pas une création confirmée", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: { ...receipt, variantId: "https://invalid" } })),
    );
    await expect(new PostProposalSubmission(() => key).submit(input)).rejects.toThrow("reçu");
  });
  it("rejette une réponse après invalidation de session", async () => {
    let deliver: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            deliver = resolve;
          }),
      ),
    );
    const pending = new PostProposalSubmission(() => key).submit(input);
    invalidateWorkspaceRequests();
    deliver(Response.json({ data: receipt }));
    await expect(pending).rejects.toThrow("interrompue");
  });
});
