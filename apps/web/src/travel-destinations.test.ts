import { describe, expect, it } from "vitest";
import { filterDestinations, travelDestinations } from "./travel-destinations";

describe("Suggestions de pays", () => {
  it("filtre les suggestions éditoriales sans dépendre de la casse ou des accents", () => {
    expect(filterDestinations(" thailande ", "Toutes").map((place) => place.name)).toEqual(["Thaïlande"]);
    expect(filterDestinations("NEW YORK", "Toutes").map((place) => place.name)).toEqual(["États-Unis"]);
    expect(filterDestinations("", "Toutes")).toHaveLength(6);
  });
  it("combine l'envie et la recherche sans inventer de destination", () => {
    expect(filterDestinations("", "Nature").map((place) => place.name)).toEqual(["Thaïlande", "Islande", "Bali"]);
    expect(filterDestinations("Japon", "Nature")).toEqual([]);
    expect(filterDestinations("inconnue", "Toutes")).toEqual([]);
    expect(travelDestinations).toHaveLength(6);
  });
});
