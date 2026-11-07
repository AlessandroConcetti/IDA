import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TypographyAtelier } from "./TypographyAtelier";

function TypographyPreview() {
  const [open, setOpen] = useState(true);
  return open ? (
    <TypographyAtelier onClose={() => setOpen(false)} />
  ) : (
    <main style={{ minHeight: "100vh", background: "#10191f", color: "#f5f1e9", padding: 48 }}>
      <h1>Prévisualisation fermée</h1>
      <p>Le site en production et les paramètres de votre compte IDA sont inchangés.</p>
      <button type="button" onClick={() => setOpen(true)}>Rouvrir l’atelier</button>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Point de montage #root introuvable");
createRoot(root).render(<TypographyPreview />);
