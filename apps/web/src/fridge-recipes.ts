import type { FridgeCategory, FridgeItem } from "./FridgePanel";

export const fridgeCategories: { id: FridgeCategory; label: string }[] = [
  { id: "vegetables", label: "Légumes" },
  { id: "meat", label: "Viandes" },
  { id: "dairy", label: "Produits laitiers" },
  { id: "fruit", label: "Fruits" },
  { id: "other", label: "Autres" },
];
type Ingredient = { name: string; quantity: string; category: FridgeCategory; aliases: string[] };
export type FridgeRecipe = {
  id: string;
  title: string;
  minutes: number;
  difficulty: string;
  ingredients: Ingredient[];
  steps: string[];
  allergens: string;
};
const tomato: Ingredient = {
  name: "Tomates",
  quantity: "250 g",
  category: "vegetables",
  aliases: ["tomate", "tomates"],
};
const greens: Ingredient = {
  name: "Salade",
  quantity: "100 g",
  category: "vegetables",
  aliases: ["salade", "laitue", "mesclun"],
};
const courgette: Ingredient = {
  name: "Courgette",
  quantity: "1",
  category: "vegetables",
  aliases: ["courgette", "courgettes"],
};
export const fridgeRecipes: [FridgeRecipe, FridgeRecipe, FridgeRecipe, FridgeRecipe] = [
  {
    id: "pasta",
    title: "Pâtes tomates mozzarella",
    minutes: 15,
    difficulty: "Facile",
    allergens: "Gluten et lait, selon les produits choisis.",
    ingredients: [
      { name: "Pâtes", quantity: "200 g", category: "other", aliases: ["pates", "spaghetti", "penne", "fusilli"] },
      tomato,
      { name: "Mozzarella", quantity: "125 g", category: "dairy", aliases: ["mozzarella"] },
      { name: "Basilic", quantity: "Quelques feuilles", category: "vegetables", aliases: ["basilic"] },
    ],
    steps: [
      "Cuire les pâtes en suivant les indications de leur emballage.",
      "Laver et couper les tomates, puis les faire revenir dans un peu d’huile d’olive.",
      "Mélanger aux pâtes égouttées. Ajouter la mozzarella et le basilic lavé juste avant de servir.",
    ],
  },
  {
    id: "bowl",
    title: "Bowl poulet avocat",
    minutes: 25,
    difficulty: "Facile",
    allergens: "Vérifier les assaisonnements et les produits utilisés.",
    ingredients: [
      {
        name: "Poulet",
        quantity: "250 g",
        category: "meat",
        aliases: ["poulet", "filet de poulet", "blanc de poulet"],
      },
      { name: "Avocat", quantity: "1", category: "fruit", aliases: ["avocat", "avocats"] },
      greens,
    ],
    steps: [
      "Laver la salade et préparer l’avocat avec des ustensiles propres.",
      "Cuire le poulet complètement en suivant les indications du produit. Garder les ustensiles du poulet cru séparés des aliments prêts à manger.",
      "Répartir la salade et l’avocat dans deux bols, ajouter le poulet cuit et assaisonner à votre goût.",
    ],
  },
  {
    id: "omelette",
    title: "Omelette aux légumes",
    minutes: 15,
    difficulty: "Facile",
    allergens: "Œufs.",
    ingredients: [{ name: "Œufs", quantity: "4", category: "other", aliases: ["oeuf", "oeufs"] }, courgette, tomato],
    steps: [
      "Laver et couper les légumes en petits morceaux.",
      "Les faire revenir dans une poêle avec un peu d’huile.",
      "Battre les œufs, verser sur les légumes et cuire jusqu’à ce que les œufs soient pris.",
    ],
  },
  {
    id: "smoothie",
    title: "Smoothie banane fruits rouges",
    minutes: 5,
    difficulty: "Très facile",
    allergens: "Lait si vous choisissez un yaourt laitier.",
    ingredients: [
      { name: "Banane", quantity: "1", category: "fruit", aliases: ["banane", "bananes"] },
      {
        name: "Fruits rouges",
        quantity: "150 g",
        category: "fruit",
        aliases: ["fruits rouges", "fraises", "fraise", "framboises", "framboise"],
      },
      { name: "Yaourt", quantity: "125 g", category: "dairy", aliases: ["yaourt", "yaourts", "yogourt"] },
    ],
    steps: [
      "Laver les fruits frais et éplucher la banane. Pour des fruits surgelés, suivre les instructions de l’emballage.",
      "Mixer les fruits et le yaourt, ajouter un peu d’eau pour ajuster la texture.",
      "Servir immédiatement dans deux petits verres.",
    ],
  },
];

export function normalizeFood(value: string): string {
  return value
    .toLocaleLowerCase("fr")
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function matches(item: FridgeItem, ingredient: Ingredient): boolean {
  const name = normalizeFood(item.name);
  return ingredient.aliases.some((alias) => name === normalizeFood(alias));
}
/** Aide de brouillon seulement : présence par nom, jamais une validation de quantité/fraîcheur. */
export function missingIngredients(recipe: FridgeRecipe, items: readonly FridgeItem[]): Ingredient[] {
  return recipe.ingredients.filter((ingredient) => !items.some((item) => !item.toBuy && matches(item, ingredient)));
}
export function addRecipeShopping(
  recipe: FridgeRecipe,
  items: readonly FridgeItem[],
): { items: FridgeItem[]; added: number; full: boolean } {
  const next = [...items];
  let id = Math.max(0, ...items.map((item) => item.id));
  let added = 0;
  let full = false;
  for (const ingredient of missingIngredients(recipe, items)) {
    if (next.some((item) => matches(item, ingredient))) continue;
    if (next.length >= 100) {
      full = true;
      continue;
    }
    next.push({
      id: ++id,
      name: ingredient.name,
      quantity: ingredient.quantity,
      category: ingredient.category,
      toBuy: true,
    });
    added++;
  }
  return { items: next, added, full };
}
export function shoppingText(items: readonly FridgeItem[]): string {
  return items
    .filter((item) => item.toBuy)
    .map((item) => `☐ ${item.name}${item.quantity ? ` — ${item.quantity}` : ""}`)
    .join("\n");
}
