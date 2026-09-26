import type { CSSProperties } from "react";
import { HubAnimatedIcon } from "./HubAnimatedIcon";
import type { HubMessage } from "./hub-data";
import "./hub-message-journal.css";

/** A reading surface for real mailbox previews. No copy, fetch, timer or simulated inbox. */
export function HubMessageJournal({ messages, onOpen }: { messages: readonly HubMessage[]; onOpen: () => void }) {
  const visible = messages.slice(0, 3);
  if (!visible.length) return null;
  return (
    <ul className="hub-message-journal hub-personal" aria-label="Aperçu des messages reçus">
      {visible.map((message, index) => (
        <li key={message.id} style={{ "--journal-delay": `${index * 1.3}s` } as CSSProperties}>
          <button type="button" className="hub-message-journal__entry" onClick={onOpen} title="Ouvrir Mail">
            <span className="hub-message-journal__seal" aria-hidden="true">
              <HubAnimatedIcon kind="mail" />
            </span>
            <span className="hub-message-journal__copy">
              <strong>{message.title.trim() || "Sans objet"}</strong>
              {index === 0 && message.preview ? (
                <>
                  {message.detail ? <span className="hub-message-journal__metadata">{message.detail}</span> : null}
                  <span className="hub-message-journal__viewport hub-message-journal__preview">
                    <span className="hub-message-journal__detail">{message.preview}</span>
                  </span>
                </>
              ) : message.detail ? (
                <span className="hub-message-journal__viewport">
                  <span className="hub-message-journal__detail">{message.detail}</span>
                </span>
              ) : null}
            </span>
            <svg
              className="hub-message-journal__open"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m6 4 4 4-4 4" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
