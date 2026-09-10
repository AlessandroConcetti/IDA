import { describe, expect, it } from "vitest";
import type { FridgeItem } from "./FridgePanel";
import { addRecipeShopping, fridgeRecipes, missingIngredients, normalizeFood, shoppingText } from "./fridge-recipes";

const pasta = fridgeRecipes[0];
const smoothie = fridgeRecipes[3];
describe("Aide recettes du brouillon Frigo", () => {
  it("ne simule aucun stock depuis l’illustration", () => {
    expect(missingIngredients(pasta, [])).toHaveLength(4);
  });
  it("normalise accents et ligatures sans envoyer les données ailleurs", () => {
    expect(normalizeFood("  ŒUFS — PÂTES  ")).toBe("oeufs pates");
    expect(missingIngredients(pasta, [{ id: 1, name: "Spaghetti", quantity: "", toBuy: false }])).toHaveLength(3);
  });
  it("ne considère pas une course manquante comme disponible", () => {
    expect(missingIngredients(pasta, [{ id: 1, name: "Pâtes", quantity: "200 g", toBuy: true }])).toHaveLength(4);
  });
  it("reconnaît un mot entier, pas un fragment de nom", () => {
    const item: FridgeItem = { id: 1, name: "Bananeraie", quantity: "", toBuy: false };
    expect(missingIngredients(smoothie, [item])).toHaveLength(3);
  });
  it("ne confond pas un produit transformé avec ses ingrédients", () => {
    expect(missingIngredients(smoothie, [{ id: 1, name: "Yaourt fraise", quantity: "", toBuy: false }])).toHaveLength(
      3,
    );
    expect(missingIngredients(pasta, [{ id: 1, name: "Sauce tomate", quantity: "", toBuy: false }])).toHaveLength(4);
  });
  it("ajoute les ingrédients manquants sans toucher à l’inventaire reçu", () => {
    const original: FridgeItem[] = [{ id: 5, name: "Pâtes", quantity: "200 g", toBuy: false }];
    const result = addRecipeShopping(pasta, original);
    expect(result.added).toBe(3);
    expect(result.items.map((item) => item.id)).toEqual([5, 6, 7, 8]);
    expect(result.items.slice(1).every((item) => item.toBuy)).toBe(true);
    expect(original).toHaveLength(1);
  });
  it("est sans doublon sur un second ajout de la même recette", () => {
    const first = addRecipeShopping(pasta, []);
    const second = addRecipeShopping(pasta, first.items);
    expect(second.added).toBe(0);
    expect(second.items).toEqual(first.items);
    expect(missingIngredients(pasta, second.items)).toHaveLength(4);
  });
  it("respecte la limite commune et signale les ajouts impossibles", () => {
    const items = Array.from({ length: 99 }, (_, index) => ({
      id: index + 1,
      name: `Produit ${index}`,
      quantity: "",
      toBuy: false,
    }));
    const result = addRecipeShopping(pasta, items);
    expect(result.items).toHaveLength(100);
    expect(result.added).toBe(1);
    expect(result.full).toBe(true);
  });
  it("exporte seulement la liste à racheter", () => {
    expect(
      shoppingText([
        { id: 1, name: "Pommes", quantity: "2", toBuy: false },
        { id: 2, name: "Yaourt", quantity: "4 pots", toBuy: true },
      ]),
    ).toBe("☐ Yaourt — 4 pots");
  });
});
