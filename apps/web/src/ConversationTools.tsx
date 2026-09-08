import "./conversation-tools.css";
import type { CatalogTarget } from "./catalog-navigation";

const commandExamples = [
  "Qu’est-ce que j’ai aujourd’hui ?",
  "Liste mes morceaux",
  "Trouve le morceau « Aurore »",
  "Montre-moi cinq vidéos inutilisées",
] as const;

export function CommandSuggestions({
  onSelect,
  disabled = false,
}: {
  onSelect: (command: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="command-suggestions" aria-label="Exemples de demandes à adapter avant envoi">
      {commandExamples.map((command) => (
        <button
          className="command-suggestion"
          type="button"
          key={command}
          disabled={disabled}
          onClick={() => {
            if (!disabled) onSelect(command);
          }}
        >
          {command}
        </button>
      ))}
    </fieldset>
  );
}

export function ConversationText({ content }: { content: string }) {
  return <p className="conversation-text">{content}</p>;
}

export function CatalogResultLinks({
  targets,
  onOpen,
}: {
  targets: CatalogTarget[];
  onOpen: (target: CatalogTarget) => void;
}) {
  if (targets.length === 0) return null;
  return (
    <div className="catalog-result-links">
      <p>Ouvrir une fiche à jour · lecture seule</p>
      <ul aria-label="Résultats du catalogue à ouvrir">
        {targets.map((target) => (
          <li key={`${target.kind}:${target.id}`}>
            <button type="button" className="command-suggestion" onClick={() => onOpen(target)}>
              <span>{target.kind === "track" ? "Morceau" : "Média"}</span>
              <strong>{target.label}</strong>
              <span aria-hidden="true">Ouvrir ↗</span>
            </button>
          </li>
        ))}
      </ul>
      <small>
        Ces raccourcis restent disponibles pendant cette session de navigation, sans être enregistrés dans l’historique.
      </small>
    </div>
  );
}
