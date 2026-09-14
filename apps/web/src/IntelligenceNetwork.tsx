import { useEffect, useId, useState } from "react";
import {
  intelligenceNetworkResponseSchema,
  type NetworkProvider,
  type IntelligenceNetwork as NetworkSnapshot,
} from "../../../packages/contracts/src/intelligence-network";
import { IdaApiError, requestApi } from "./api-transport";
import { LocalDialogue } from "./LocalDialogue";
import { allocationStatusLabel } from "./local-dialogue-state";
import "./intelligence-network.css";

const statusLabels: Record<NetworkProvider["status"], string> = {
  AVAILABLE_FREE: "Candidat gratuit",
  AVAILABLE_PAID: "Payant · bloqué par la politique",
  QUOTA_EXCEEDED: "Quota épuisé",
  NOT_CONFIGURED: "Non configuré",
  UNAVAILABLE: "Indisponible",
  BLOCKED: "Bloqué",
  UNKNOWN: "État inconnu",
};
const localityLabels: Record<NetworkProvider["locality"], string> = {
  LOCAL: "Local",
  CLOUD: "Cloud",
  CODING_TOOL: "Outil de code",
};
const lifecycleLabels: Record<NetworkProvider["lifecycle"], string> = {
  REGISTERED: "Enregistré",
  PREPARED: "Préparé · connexion non confirmée",
  NEEDS_REVIEW: "À examiner",
};
const costLabels: Record<NetworkProvider["cost"], string> = {
  LOCAL: "Calcul local",
  FREE_LIMITED: "Gratuit sous limites",
  PAID: "Payant · non autorisé",
  UNKNOWN: "Coût inconnu",
  BLOCKED: "Coût bloqué",
};
const freeTierLabels: Record<NetworkProvider["freeTier"], string> = {
  CONDITIONAL: "Offre gratuite conditionnelle",
  NONE: "Aucune offre gratuite",
  UNKNOWN: "Offre gratuite non établie",
  NOT_APPLICABLE: "Offre gratuite non applicable",
};
const capabilityLabels: Record<NetworkProvider["capabilities"][number], string> = {
  TEXT: "Texte",
  REASONING: "Raisonnement",
  CODE: "Code",
  STRUCTURED_OUTPUT: "Sorties structurées",
  TOOL_CALLING: "Appels d’outils",
  LONG_CONTEXT: "Contexte long",
  VISION: "Vision",
  EMBEDDINGS: "Recherche sémantique",
  IMAGE_GENERATION: "Génération d’images",
  AUDIO: "Audio",
  STT: "Transcription",
  TTS: "Synthèse vocale",
};
const quotaLabels = {
  REQUESTS_MINUTE: "Requêtes / minute",
  REQUESTS_DAY: "Requêtes / jour",
  REQUESTS_MONTH: "Requêtes / mois",
  TOKENS_MINUTE: "Tokens / minute",
  TOKENS_DAY: "Tokens / jour",
  TOKENS_MONTH: "Tokens / mois",
} satisfies Record<NonNullable<NetworkProvider["quota"]>["windows"][number]["kind"], string>;

const numberFormat = new Intl.NumberFormat("fr-FR");
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>;
}

function ProviderQuota({ provider, generatedAt }: { provider: NetworkProvider; generatedAt: string }) {
  const quota = provider.quota;
  const expired =
    quota !== null &&
    (Date.parse(quota.validUntil) <= Date.parse(generatedAt) ||
      quota.windows.some((window) => Date.parse(window.resetAt) <= Date.parse(generatedAt)));

  return (
    <section className="intelligence-network__quotas" aria-label={`Quotas de ${provider.name}, ${provider.model}`}>
      <div className="intelligence-network__allocation">
        <div>
          <h4>Allocation IDA</h4>
          <p>Enveloppe interne, distincte des crédits du fournisseur.</p>
        </div>
        <strong>
          {provider.allocationRemaining === null ? "Inconnue" : numberFormat.format(provider.allocationRemaining)}
          {provider.allocationRemaining !== null && <small> appels restants</small>}
        </strong>
      </div>
      <div className="intelligence-network__quota-heading">
        <h4>Quotas du fournisseur</h4>
        {quota && <span>{expired ? "Observation expirée" : "Observation du serveur"}</span>}
      </div>
      {quota === null ? (
        <p className="intelligence-network__unknown">
          {provider.locality === "LOCAL"
            ? provider.key === "ollama"
              ? "Pas de quota fournisseur cloud. Le dialogue est limité à une demande simultanée et 30 tentatives par heure sur ce serveur."
              : "Calcul local sans quota fournisseur cloud. L’allocation applicable reste contrôlée côté serveur."
            : "Aucun quota observé. Le solde et la date de renouvellement sont inconnus."}
        </p>
      ) : (
        <>
          <p className="intelligence-network__quota-date">
            Relevé le <Timestamp value={quota.observedAt} /> · valable jusqu’au <Timestamp value={quota.validUntil} />.
            {expired && " Ces valeurs historiques ne prouvent plus une capacité disponible."}
          </p>
          <ul className="intelligence-network__quota-list">
            {quota.windows.map((window) => (
              <li key={window.kind}>
                <div className="intelligence-network__quota-line">
                  <span>{quotaLabels[window.kind]}</span>
                  <strong>
                    {numberFormat.format(window.remaining)}{" "}
                    <small>/ {numberFormat.format(window.limit)} restants</small>
                  </strong>
                </div>
                {window.limit > 0 && (
                  <meter
                    min={0}
                    max={window.limit}
                    value={window.remaining}
                    aria-label={`${quotaLabels[window.kind]} : ${window.remaining} sur ${window.limit} restants au relevé`}
                  />
                )}
                <span className="intelligence-network__reset">
                  Renouvellement annoncé : <Timestamp value={window.resetAt} />
                </span>
              </li>
            ))}
          </ul>
          <p className="intelligence-network__quota-date">
            Modèles couverts : {quota.modelIds.join(", ")}. Aucun dépassement payant autorisé par cette observation.
          </p>
        </>
      )}
    </section>
  );
}

export function IntelligenceProviderCard({
  provider,
  generatedAt,
}: {
  provider: NetworkProvider;
  generatedAt: string;
}) {
  const cardId = useId();

  return (
    <article className="intelligence-network__card" aria-labelledby={cardId}>
      <header className="intelligence-network__card-header">
        <div>
          <span className="intelligence-network__locality">{localityLabels[provider.locality]}</span>
          <h3 id={cardId}>{provider.name}</h3>
        </div>
        <span className="intelligence-network__status" data-status={provider.status}>
          <span aria-hidden="true" />
          {allocationStatusLabel(provider) ?? statusLabels[provider.status]}
        </span>
      </header>
      <code className="intelligence-network__model">{provider.model}</code>
      <p className="intelligence-network__role">{provider.role}</p>
      {provider.locality === "LOCAL" && provider.key === "ollama" && (
        <p className="intelligence-network__unknown">
          L’allocation est ouverte pour chaque demande puis consommée. Pour vérifier le moteur ou lui parler, ouvrez le
          dialogue local ci-dessus ; ce compteur n’indique pas si Ollama fonctionne.
        </p>
      )}
      <div className="intelligence-network__tags">
        <span>{lifecycleLabels[provider.lifecycle]}</span>
        <span>{costLabels[provider.cost]}</span>
      </div>
      <ul className="intelligence-network__capabilities" aria-label="Capacités déclarées">
        {provider.capabilities.map((capability) => (
          <li key={capability}>{capabilityLabels[capability]}</li>
        ))}
      </ul>
      {provider.capabilities.length === 0 && (
        <p className="intelligence-network__unknown">Capacités non renseignées.</p>
      )}
      <ProviderQuota provider={provider} generatedAt={generatedAt} />
      <dl className="intelligence-network__metrics">
        <div>
          <dt>Latence estimée</dt>
          <dd>{provider.latencyMs === null ? "Inconnue" : `${numberFormat.format(provider.latencyMs)} ms`}</dd>
        </div>
        <div>
          <dt>Dernier succès historique</dt>
          <dd>{provider.lastSuccess === null ? "Non observé" : <Timestamp value={provider.lastSuccess} />}</dd>
        </div>
        <div>
          <dt>Dernière erreur · code</dt>
          <dd>{provider.lastError === null ? "Aucune renseignée" : <code>{provider.lastError}</code>}</dd>
        </div>
      </dl>
      <details className="intelligence-network__provider-details">
        <summary>Confidentialité, conditions et sources</summary>
        <div className="intelligence-network__detail-content">
          <h4>Confidentialité</h4>
          <p>{provider.privacy}</p>
          <h4>{freeTierLabels[provider.freeTier]}</h4>
          <p>{provider.conditions}</p>
          <p className="intelligence-network__verified">
            Vérification documentaire :{" "}
            {provider.verifiedAt === null ? (
              "date inconnue"
            ) : (
              <time dateTime={provider.verifiedAt}>
                {dayFormat.format(new Date(`${provider.verifiedAt}T00:00:00Z`))}
              </time>
            )}
            .
          </p>
          {provider.sources.length === 0 ? (
            <p>Aucune source officielle renseignée.</p>
          ) : (
            <ul className="intelligence-network__sources" aria-label="Sources officielles">
              {provider.sources.map((source, index) => (
                <li key={`${source}-${index}`}>
                  <a href={source} target="_blank" rel="noreferrer noopener">
                    Source {index + 1} · {new URL(source).hostname}
                    <span aria-hidden="true"> ↗</span>
                    <span className="intelligence-network__sr-only"> (nouvel onglet)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </article>
  );
}

function TaskMatrix({ tasks }: { tasks: NetworkSnapshot["tasks"] }) {
  return (
    <details className="intelligence-network__matrix">
      <summary>
        Matrice des tâches <span>{tasks.length} domaines de capacité</span>
      </summary>
      <p>Les modèles listés sont des candidats techniques. Chaque exécution reste soumise aux contrôles du serveur.</p>
      {tasks.length === 0 ? (
        <p>Aucune tâche déclarée dans le registre.</p>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: la zone défilante doit être navigable au clavier.
        <section className="intelligence-network__table-scroll" aria-label="Matrice des tâches" tabIndex={0}>
          <table>
            <caption className="intelligence-network__sr-only">
              Capacités requises, modèles candidats et état du transport
            </caption>
            <thead>
              <tr>
                <th scope="col">Tâche</th>
                <th scope="col">Capacités requises</th>
                <th scope="col">Modèles candidats</th>
                <th scope="col">Prise en charge</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, index) => (
                <tr key={`${task.task}-${index}`}>
                  <th scope="row">{task.task}</th>
                  <td>{task.requires.map((capability) => capabilityLabels[capability]).join(" · ")}</td>
                  <td>
                    {task.availableModels.length === 0 ? "Aucun modèle candidat" : task.availableModels.join(" · ")}
                  </td>
                  <td>{task.transport === "TEXT_READY" ? "Contrat textuel implémenté" : "Préparée · non connectée"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </details>
  );
}

type NetworkLoad =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: NetworkSnapshot };

export function IntelligenceNetwork() {
  const filterId = useId();
  const [load, setLoad] = useState<NetworkLoad>({ phase: "loading" });
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("ALL");
  const [locality, setLocality] = useState("ALL");
  const [dialogueOpen, setDialogueOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ phase: "loading" });
    void requestApi("/v1/intelligence/network", { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const parsed = intelligenceNetworkResponseSchema.safeParse(payload);
        if (!parsed.success) {
          setLoad({
            phase: "error",
            message: "Le registre reçu est invalide. Aucun état fournisseur ne peut être affiché.",
          });
          return;
        }
        setLoad({ phase: "ready", data: parsed.data.data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof IdaApiError && error.status === 403
            ? "Cette session n’a pas accès au réseau d’intelligence de cet espace."
            : "Le réseau d’intelligence n’a pas pu être chargé. Actualisez pour réessayer.";
        setLoad({ phase: "error", message });
      });
    return () => controller.abort();
  }, [revision]);

  const data = load.phase === "ready" ? load.data : null;
  const providers =
    data?.providers.filter(
      (provider) =>
        (status === "ALL" || provider.status === status) && (locality === "ALL" || provider.locality === locality),
    ) ?? [];

  return (
    <section className="intelligence-network" aria-labelledby={`${filterId}-title`}>
      <header className="intelligence-network__header">
        <div>
          <p className="intelligence-network__eyebrow">Intelligence Network · IDA</p>
          <h2 id={`${filterId}-title`}>Réseau d’intelligence</h2>
          <p>Modèles, capacités et ressources réellement déclarés pour cet espace.</p>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={load.phase === "loading"}>
          <span aria-hidden="true">↻</span> {load.phase === "loading" ? "Chargement…" : "Actualiser"}
        </button>
      </header>
      <aside className="intelligence-network__policy" aria-label="Politique d’utilisation">
        <span className="intelligence-network__policy-mark" aria-hidden="true">
          ◎
        </span>
        <div>
          <strong>Local d’abord · gratuit sous conditions · aucun paiement automatique</strong>
          <p>
            Un modèle disponible est un candidat technique : les permissions et le consentement au transfert de données
            restent vérifiés côté serveur. Un coût inconnu ne signifie pas gratuit. Les options payantes sont bloquées ;
            une capacité préparée n’est pas une connexion active.
          </p>
        </div>
      </aside>
      <section className="intelligence-network__dialogue" aria-label="Utiliser le moteur local">
        <div className="intelligence-network__dialogue-heading">
          <div>
            <h3>Parler à IDA sur ce PC</h3>
            <p>Vérification du moteur à l’ouverture. Le calcul démarre seulement après « Envoyer ».</p>
          </div>
          <button
            type="button"
            aria-expanded={dialogueOpen}
            aria-controls={`${filterId}-dialogue`}
            onClick={() => setDialogueOpen((open) => !open)}
          >
            {dialogueOpen ? "Fermer le dialogue" : "Ouvrir le dialogue local"}
          </button>
        </div>
        <div id={`${filterId}-dialogue`}>{dialogueOpen && <LocalDialogue />}</div>
      </section>
      <div className="intelligence-network__live" role="status" aria-live="polite">
        {load.phase === "loading" && "Lecture du registre en cours…"}
        {data && (
          <>
            Instantané du <Timestamp value={data.generatedAt} /> · {providers.length} modèle
            {providers.length > 1 ? "s" : ""} affiché{providers.length > 1 ? "s" : ""}. Heures locales. Actualisation
            manuelle.
          </>
        )}
      </div>
      {load.phase === "error" && (
        <p className="intelligence-network__error" role="alert">
          {load.message}
        </p>
      )}
      {data && (
        <>
          <dl className="intelligence-network__overview">
            <div>
              <dt>Fiches du réseau</dt>
              <dd>{data.providers.length}</dd>
            </div>
            <div>
              <dt>Candidats gratuits</dt>
              <dd>{data.providers.filter((provider) => provider.status === "AVAILABLE_FREE").length}</dd>
            </div>
            <div>
              <dt>Fournisseurs préparés</dt>
              <dd>{data.providers.filter((provider) => provider.lifecycle === "PREPARED").length}</dd>
            </div>
            <div>
              <dt>Quotas observés</dt>
              <dd>{data.providers.filter((provider) => provider.quota !== null).length}</dd>
            </div>
          </dl>
          <fieldset className="intelligence-network__filters" aria-label="Filtrer les modèles">
            <label htmlFor={`${filterId}-status`}>
              État
              <select
                id={`${filterId}-status`}
                value={status}
                onChange={(event) => setStatus(event.currentTarget.value)}
              >
                <option value="ALL">Tous les états</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${filterId}-locality`}>
              Emplacement
              <select
                id={`${filterId}-locality`}
                value={locality}
                onChange={(event) => setLocality(event.currentTarget.value)}
              >
                <option value="ALL">Tous les emplacements</option>
                {Object.entries(localityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(status !== "ALL" || locality !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setStatus("ALL");
                  setLocality("ALL");
                }}
              >
                Effacer les filtres
              </button>
            )}
          </fieldset>
          {providers.length === 0 ? (
            <p className="intelligence-network__empty">
              {data.providers.length === 0
                ? "Aucun modèle déclaré pour cet espace."
                : "Aucun modèle ne correspond à ces filtres."}
            </p>
          ) : (
            <div className="intelligence-network__grid">
              {providers.map((provider) => (
                <IntelligenceProviderCard
                  key={`${provider.key}:${provider.model}`}
                  provider={provider}
                  generatedAt={data.generatedAt}
                />
              ))}
            </div>
          )}
          <TaskMatrix tasks={data.tasks} />
        </>
      )}
    </section>
  );
}
