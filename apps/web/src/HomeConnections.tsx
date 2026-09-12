import { useEffect, useRef, useState } from "react";
import {
  type HomeDeviceResult,
  type HomeDeviceStatus,
  homeDeviceResultSchema,
  homeDeviceStatusSchema,
} from "../../../packages/contracts/src/home-device";
import { IdaApiError, requestApi } from "./api-transport";
import "./home-connections.css";

export type HomeSetup = "unknown" | "home-assistant" | "voice-apps";

export function homeConnectionAdvice(setup: HomeSetup): { title: string; next: string } {
  if (setup === "home-assistant")
    return {
      title: "Vérifier une première lampe",
      next: "Vérifiez qu’elle apparaît déjà dans Home Assistant. Nous pourrons ensuite préparer un accès limité à son état, après validation de la connexion.",
    };
  if (setup === "voice-apps")
    return {
      title: "Identifier la marque et le modèle",
      next: "Relevez-les dans l’application du fabricant ou sur la fiche de l’appareil. Sa présence dans Alexa ou Google Home ne suffit pas à confirmer sa compatibilité avec IDA.",
    };
  return {
    title: "Partir de votre installation",
    next: "Choisissez une lampe et identifiez sa marque, son modèle et l’application qui la gère. N’installez pas de nouveau hub avant la vérification de compatibilité.",
  };
}

export function HomeConnections() {
  const [setup, setSetup] = useState<HomeSetup>("home-assistant");
  const [status, setStatus] = useState<HomeDeviceStatus | null>(null);
  const [statusPhase, setStatusPhase] = useState<"loading" | "ready" | "unavailable" | "paused">("loading");
  const [result, setResult] = useState<HomeDeviceResult | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const statusPending = useRef<AbortController | null>(null);
  useEffect(() => {
    setStatus(null);
    setNotice("");
    if (document.hidden) {
      setStatusPhase("paused");
      return;
    }
    const controller = new AbortController();
    statusPending.current = controller;
    setStatusPhase("loading");
    void requestApi("/v1/home/device/status", { signal: controller.signal })
      .then((payload) => {
        const parsed = homeDeviceStatusSchema.safeParse((payload as { data?: unknown })?.data);
        if (!controller.signal.aborted && statusPending.current === controller) {
          setStatus(parsed.success ? parsed.data : null);
          setStatusPhase(parsed.success ? "ready" : "unavailable");
          setNotice(parsed.success ? "" : "Statut de connexion non reconnu.");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && statusPending.current === controller) {
          setStatusPhase("unavailable");
          setNotice("Le statut domotique n’est pas accessible. Déverrouillez IDA puis vérifiez la connexion.");
        }
      })
      .finally(() => {
        if (statusPending.current === controller) statusPending.current = null;
      });
    return () => {
      controller.abort();
      if (statusPending.current === controller) statusPending.current = null;
    };
  }, [revision]);
  useEffect(() => {
    const updateVisibility = () => {
      if (!document.hidden) {
        setRevision((value) => value + 1);
        return;
      }
      pending.current?.abort();
      pending.current = null;
      statusPending.current?.abort();
      statusPending.current = null;
      setStatus(null);
      setStatusPhase("paused");
      setNotice("");
      setBusy(false);
      setResult(null);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      pending.current?.abort();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      setResult(null);
      setNotice("L’observation a expiré après une minute. Relancez une lecture si nécessaire.");
    }, 60_000);
    return () => clearTimeout(timer);
  }, [result]);
  async function read() {
    if (document.hidden || pending.current || statusPhase !== "ready" || status?.state !== "CONFIGURED") return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setResult(null);
    setNotice("");
    try {
      const payload = await requestApi(
        "/v1/home/device/read",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consent: true }),
          signal: controller.signal,
        },
        false,
        16_000,
      );
      const data = homeDeviceResultSchema.parse((payload as { data?: unknown })?.data);
      if (!controller.signal.aborted && pending.current === controller) setResult(data);
    } catch (error) {
      if (!controller.signal.aborted && pending.current === controller)
        setNotice(
          error instanceof IdaApiError ? error.message : "Lecture indisponible. Aucun appareil n’a été commandé.",
        );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  const readiness = status
    ? {
        DISABLED: "Lecture désactivée sur ce serveur.",
        CONNECTION_REQUIRED: "Connexion privée à configurer côté serveur.",
        TLS_REQUIRED: "HTTPS vérifié requis. Aucun token ne sera transmis en HTTP.",
        TARGET_REQUIRED: "Désignez une seule lampe Home Assistant dans la configuration serveur.",
        SECRET_REQUIRED: "Token serveur chiffré à enregistrer localement dans le coffre Windows.",
        CONFIGURED: "Configuration prête. La connexion réelle sera vérifiée uniquement au clic de lecture.",
      }[status.state]
    : statusPhase === "loading"
      ? "Vérification de la configuration IDA…"
      : statusPhase === "paused"
        ? "Vérification suspendue. Elle reprendra au retour dans IDA, sans contacter la lampe."
        : "Configuration indisponible. Choisissez « Vérifier la configuration » pour réessayer.";
  const advice = homeConnectionAdvice(setup);
  return (
    <section className="home-connections home-daily-card" aria-labelledby="home-connections-title">
      <header>
        <span className="home-card-symbol" aria-hidden="true">
          ⌂
        </span>
        <h2 id="home-connections-title">Domotique</h2>
        <span className="home-card-note">
          {result
            ? "Observation reçue"
            : statusPhase === "paused"
              ? "À revérifier"
              : statusPhase === "unavailable"
                ? "Indisponible"
                : status?.state === "CONFIGURED"
                  ? "Prête à lire"
                  : "À préparer"}
        </span>
      </header>
      <p>Préparons la connexion de vos appareils, en commençant par la lecture de l’état d’une lampe.</p>
      <p>
        Le nom d’un token créé dans Home Assistant n’est pas sa valeur secrète. Ne saisissez aucun token dans le chat :
        son enregistrement se fait dans le coffre local Windows.
      </p>
      {status?.prerequisites ? <HomePrerequisites prerequisites={status.prerequisites} /> : null}
      <div className="home-device-pilot">
        <span className="scene-kicker">HOME ASSISTANT · LECTURE SEULE</span>
        <h3>Votre première lampe</h3>
        <p role="status">{readiness}</p>
        <p>
          « Lire l’état » consulte uniquement la lampe autorisée pour votre espace. Pas d’inventaire de la maison, pas
          d’allumage et pas de rafraîchissement automatique.
        </p>
        <div className="reference-actions">
          <button
            type="button"
            disabled={busy || statusPhase !== "ready" || status?.state !== "CONFIGURED"}
            onClick={() => void read()}
          >
            {busy ? "Lecture en cours…" : "Lire l’état de ma lampe"}
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => {
                pending.current?.abort();
                pending.current = null;
                setBusy(false);
                setNotice("Lecture annulée.");
              }}
            >
              Annuler
            </button>
          ) : (
            <button
              type="button"
              disabled={statusPhase === "loading"}
              onClick={() => {
                setResult(null);
                setRevision((value) => value + 1);
              }}
            >
              Vérifier la configuration
            </button>
          )}
        </div>
        {result ? (
          <div className="home-device-observation" role="status">
            <strong>
              {
                {
                  ON: "Allumée",
                  OFF: "Éteinte",
                  UNKNOWN: "État inconnu",
                  UNAVAILABLE: "Indisponible dans Home Assistant",
                }[result.state]
              }
            </strong>
            <span>Consulté le {new Date(result.observedAt).toLocaleString("fr-FR")}</span>
            <span>Dernière mise à jour du hub : {new Date(result.providerUpdatedAt).toLocaleString("fr-FR")}</span>
            <small>Observation temporaire, pas une preuve de joignabilité de la lampe à cet instant.</small>
          </div>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
      </div>
      <label htmlFor="home-connection-setup">Votre installation actuelle</label>
      <select
        id="home-connection-setup"
        value={setup}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "unknown" || value === "home-assistant" || value === "voice-apps") setSetup(value);
        }}
      >
        <option value="unknown">Je ne sais pas encore</option>
        <option value="home-assistant">J’ai déjà Home Assistant</option>
        <option value="voice-apps">Alexa / Google Home, sans Home Assistant</option>
      </select>
      <div className="home-connection-advice" role="status" aria-live="polite" aria-atomic="true">
        <h3>{advice.title}</h3>
        <p>{advice.next}</p>
      </div>
      <details>
        <summary>Comment Alexa et Google Home pourront s’intégrer</summary>
        <ul>
          <li>
            <strong>Alexa.</strong> L’intégration officielle permet d’exposer les appareils d’un service à Alexa ; elle
            n’importe pas automatiquement ceux de vos autres services.{" "}
            <a
              href="https://developer.amazon.com/docs/alexaplus/smarthome/connect-your-cloud-with-addons.html"
              target="_blank"
              rel="noreferrer"
            >
              Documentation Amazon
            </a>
            .
          </li>
          <li>
            <strong>Google Home.</strong> Ses API pour applications proposent des SDK Android et iOS. Cette piste native
            reste à préparer ; elle ne connecte pas le navigateur IDA aujourd’hui.{" "}
            <a href="https://developers.home.google.com/apis" target="_blank" rel="noreferrer">
              Documentation Google
            </a>
            .
          </li>
          <li>
            <strong>Home Assistant.</strong> Une passerelle possible pour le Core d’IDA, si vos appareils y sont
            compatibles et déjà accessibles. Ce n’est pas un import universel d’Alexa ou Google.{" "}
            <a href="https://developers.home-assistant.io/docs/api/rest/" target="_blank" rel="noreferrer">
              Documentation Home Assistant
            </a>
            .
          </li>
        </ul>
      </details>
      <p className="home-connection-safety">
        Le choix d’installation guide la préparation uniquement. Seul le bouton de lecture contacte le hub configuré,
        après contrôle des permissions serveur. Aucun mot de passe ni token à saisir ici. Utilisez vos applications
        habituelles pour commander les appareils.
      </p>
    </section>
  );
}

export function HomePrerequisites({
  prerequisites,
}: {
  prerequisites: NonNullable<HomeDeviceStatus["prerequisites"]>;
}) {
  const rows = [
    ["Configuration serveur", prerequisites.configuration === "CONFIGURED" ? "Renseignée" : "À configurer"],
    [
      "Transport HTTPS",
      prerequisites.tls === "CONFIGURED"
        ? "Exigé · certificat à vérifier lors de la lecture"
        : "Requis · adresse actuelle non sécurisée",
    ],
    ["Lampe pilote", prerequisites.target === "CONFIGURED" ? "Désignée" : "Une entité réelle light.… à sélectionner"],
    [
      "Secret dans le coffre",
      {
        STORED: "Fichier présent · déchiffrement non vérifié",
        MISSING: "Non enregistré dans IDA",
        UNAVAILABLE: "Coffre indisponible",
        NOT_CHECKED: "Non vérifié",
      }[prerequisites.credential],
    ],
    ["Connexion réelle", "Non effectuée · lecture explicite nécessaire"],
  ];
  return (
    <section className="home-prerequisites" aria-label="Prérequis Home Assistant">
      <h3>Ce qu’il reste à relier</h3>
      <dl>
        {rows.map(([label, detail]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      <p>
        Ces vérifications lisent uniquement la configuration locale, sans contacter votre maison. Un fichier de secret
        présent ne garantit ni un coffre utilisable ni un token valide.
      </p>
    </section>
  );
}
