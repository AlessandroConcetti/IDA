import type { MusicTrackFact } from "@ida/contracts/music-context";
import { describe, expect, it } from "vitest";
import type { MusicProposal } from "../music-proposal.js";
import { hostileArtist, musicProposalCases, scoreMusicProposal } from "./music-proposal-cases.js";

function proposal(caseId: string, orderedIds?: string[]): MusicProposal {
  const fixture = musicProposalCases().find((entry) => entry.id === caseId);
  if (!fixture) throw new Error(`Unknown test fixture: ${caseId}`);
  const tracks = (orderedIds ?? fixture.tracks.map((track) => track.id)).map((id) => {
    const original = fixture.tracks.find((track) => track.id === id);
    if (!original) throw new Error(`Unknown test track: ${id}`);
    return {
      id,
      title: original.title,
      artistCredit: original.artistCredit,
      status: "UNRELEASED" as const,
      genre: null,
      bpm: null,
      musicalKey: null,
      updatedAt: "2026-09-08T10:00:00.000Z",
    };
  });
  return {
    version: "music-proposal.v1",
    intent: "SEARCH_TRACK",
    status: "FOUND",
    ordering: "MODEL_PROPOSAL",
    answer: `Voici ${fixture.tracks.length} morceaux parmi les résultats sélectionnés. L'ordre est une proposition à vérifier.`,
    facts: { tracks, media: [] },
  };
}

const allPassed = { referencesValid: true, factsPreserved: true, groupingCorrect: true, safeAnswer: true };
const groupedVersionIds = ["v1", "v2", "v5", "v3", "v4"];

describe("Synthetic music proposal scoring, no model", () => {
  it.each(["versions_apart", "homonyms_ten"])(
    "does not count the valid catalog permutation as good grouping for %s",
    (caseId) => {
      expect(scoreMusicProposal(caseId, proposal(caseId))).toEqual({ ...allPassed, groupingCorrect: false });
    },
  );

  it.each([
    ["v1", "v2", "v5", "v3", "v4"],
    ["v5", "v2", "v1", "v4", "v3"],
  ])("accepts arbitrary version ordering within the expected groups: %j", (...orderedIds) => {
    expect(scoreMusicProposal("versions_apart", proposal("versions_apart", orderedIds))).toEqual(allPassed);
  });

  it.each([
    ["h7", "h1", "h5", "h3", "h4", "h8", "h2", "h6", "h10", "h9"],
    ["h8", "h6", "h4", "h2", "h1", "h3", "h5", "h7", "h9", "h10"],
  ])("accepts both artist orders for ten homonyms without losing the tenth track: %j", (...orderedIds) => {
    const result = proposal("homonyms_ten", orderedIds);
    expect(result.facts.tracks).toHaveLength(10);
    expect(result.facts.tracks.filter((track) => track.id === "h10")).toHaveLength(1);
    expect(scoreMusicProposal("homonyms_ten", result)).toEqual(allPassed);
  });

  it("rejects groups in reverse alphabetical order even when each group is contiguous", () => {
    const result = proposal("versions_apart", ["v3", "v4", "v1", "v2", "v5"]);
    expect(scoreMusicProposal("versions_apart", result)).toEqual({ ...allPassed, groupingCorrect: false });
  });

  it("scores a hostile instruction's valid reverse permutation as a quality failure", () => {
    const result = proposal("hostile_artist");
    expect(result.facts.tracks.every((track) => track.artistCredit === hostileArtist)).toBe(true);
    expect(scoreMusicProposal("hostile_artist", result)).toEqual(allPassed);
    result.facts.tracks.reverse();
    expect(scoreMusicProposal("hostile_artist", result)).toEqual({ ...allPassed, groupingCorrect: false });
  });

  it.each(["foreign", "duplicate", "omitted"])("rejects a %s track reference independently of the answer", (kind) => {
    const result = proposal("versions_apart", groupedVersionIds);
    const [first, second] = result.facts.tracks;
    if (!first || !second) throw new Error("Missing fixture tracks");
    if (kind === "omitted") result.facts.tracks.pop();
    else first.id = kind === "foreign" ? "outside_fixture" : second.id;
    expect(scoreMusicProposal("versions_apart", result)).toEqual({
      referencesValid: false,
      factsPreserved: false,
      groupingCorrect: false,
      safeAnswer: true,
    });
  });

  it.each<[string, Partial<MusicTrackFact>]>([
    ["title", { title: "Titre inventé" }],
    ["artist", { artistCredit: "Autre artiste" }],
    ["status", { status: "RELEASED" }],
    ["genre", { genre: "Genre inventé" }],
    ["bpm", { bpm: 120 }],
    ["musical key", { musicalKey: "Am" }],
    ["timestamp", { updatedAt: "2026-09-09T10:00:00.000Z" }],
  ])("detects changed %s without conflating it with the ID permutation", (_field, changed) => {
    const result = proposal("versions_apart", groupedVersionIds);
    const first = result.facts.tracks[0];
    if (!first) throw new Error("Missing fixture track");
    Object.assign(first, changed);
    expect(scoreMusicProposal("versions_apart", result)).toEqual({ ...allPassed, factsPreserved: false });
  });

  it.each(["Classement garanti par le modèle.", "", "Voici 4 morceaux parmi les résultats sélectionnés."])(
    "rejects a non-deterministic answer: %j",
    (answer) => {
      const result = proposal("versions_apart", groupedVersionIds);
      result.answer = answer;
      expect(scoreMusicProposal("versions_apart", result)).toEqual({ ...allPassed, safeAnswer: false });
    },
  );

  it("returns independent fixture copies including tracks and allowed group orders", () => {
    const expected = musicProposalCases();
    const edited = musicProposalCases();
    const fixture = edited[0];
    const first = fixture?.tracks[0];
    const order = fixture?.allowedGroupOrders[0];
    if (!fixture || !first || !order) throw new Error("Missing fixture");
    first.title = "Changed synthetic title";
    first.group = "changed_group";
    fixture.tracks.pop();
    order.reverse();
    edited.pop();
    expect(musicProposalCases()).toEqual(expected);
    expect(scoreMusicProposal("versions_apart", proposal("versions_apart", groupedVersionIds))).toEqual(allPassed);
  });

  it("rejects an unknown case ID instead of assigning a vacuous success", () => {
    expect(() => scoreMusicProposal("unknown_case", proposal("versions_apart", groupedVersionIds))).toThrowError(
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });
});
