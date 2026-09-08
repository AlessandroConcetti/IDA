import "./conversation-tools.css";

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
