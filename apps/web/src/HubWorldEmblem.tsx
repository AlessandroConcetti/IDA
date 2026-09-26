import "./hub-world-emblem.css";

/** The shared IDA orb, layered over the Hub artwork without adding an action or sensor. */
export function HubWorldEmblem({ variant = "card" }: { variant?: "card" | "bubble" | "orbital" }) {
  return (
    <span className={`hub-world-emblem hub-world-emblem--${variant}`} aria-hidden="true">
      <span className="ida-quickbar__orb hub-world-emblem__orb">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
