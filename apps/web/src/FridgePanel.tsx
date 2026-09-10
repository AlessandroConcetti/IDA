import { type FormEvent, useState } from "react";

export type FridgeCategory = "vegetables" | "meat" | "dairy" | "fruit" | "other";
export type FridgeItem = { id: number; name: string; quantity: string; toBuy: boolean; category?: FridgeCategory };
export function FridgePanel({ items, onChange, compact = false }: { items: FridgeItem[]; onChange: (items: FridgeItem[]) => void; compact?: boolean }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<FridgeCategory>("other");
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || items.length >= 100) return;
    onChange([...items, { id: Math.max(0, ...items.map((item) => item.id)) + 1, name: name.trim(), quantity: quantity.trim(), toBuy: false, category }]);
    setName(""); setQuantity("");
  }
  return <section className={compact ? "fridge-panel fridge-editor" : "scene-panel fridge-panel"} aria-label="Produits du frigo">
    {!compact ? <><p className="scene-kicker">IDA HOME / CUISINE</p><h2>Mon frigo</h2></> : null}
    <p>Ajoutez un produit et marquez ce qu’il faut racheter.</p>
    <p className="scene-notice">Inventaire manuel de démonstration, effacé en quittant ce monde. Aucun frigo ni service de courses connecté.</p>
    <form onSubmit={add} className="fridge-form">
      <label>Produit<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoComplete="off" placeholder="Ex. Yaourts" /></label>
      <label>Quantité<input value={quantity} onChange={(event) => setQuantity(event.target.value)} maxLength={40} autoComplete="off" placeholder="Ex. 4 pots" /></label>
      <label>Rayon<select value={category} onChange={(event) => setCategory(event.target.value as FridgeCategory)}>
        <option value="vegetables">Légumes</option><option value="meat">Viandes</option><option value="dairy">Produits laitiers</option><option value="fruit">Fruits</option><option value="other">Autres</option>
      </select></label>
      <button type="submit" disabled={!name.trim() || items.length >= 100}>Ajouter au frigo +</button>
    </form>
    {items.length ? <ul className="fridge-items">{items.map((item) => <li key={item.id}>
      <div><strong>{item.name}</strong><span>{item.quantity || "Quantité non précisée"}</span></div>
      <label><input type="checkbox" checked={item.toBuy} onChange={() => onChange(items.map((value) => value.id === item.id ? { ...value, toBuy: !value.toBuy } : value))} />À racheter</label>
      <button type="button" aria-label={`Retirer ${item.name}`} onClick={() => onChange(items.filter((value) => value.id !== item.id))}>Retirer</button>
    </li>)}</ul> : <p className="scene-empty">Votre inventaire est vide. Aucun produit ajouté automatiquement.</p>}
    <p role="status">{items.length} produit{items.length > 1 ? "s" : ""} · {items.filter((item) => item.toBuy).length} à racheter</p>
  </section>;
}
