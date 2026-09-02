import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActivityLogRecord,
  type ApprovalQueueItem,
  approvePostVariant,
  type CampaignCreateInput,
  type CampaignRecord,
  type CampaignStatus,
  type CommandCenterSummary,
  type ContentRotationCandidate,
  cancelInternalPostSchedule,
  completeTask,
  confirmMemory,
  createCampaign,
  createRelease,
  createTask,
  createTrack,
  type DashboardSnapshot,
  type EditorialCalendarItem,
  type EditorialCalendarSnapshot,
  type EditorialCalendarView,
  fetchActivityLogs,
  fetchApprovalQueue,
  fetchArtistBrain,
  fetchCampaigns,
  fetchContentRotationCandidates,
  fetchDashboardSnapshot,
  fetchEditorialCalendar,
  fetchIdaCommandRuns,
  fetchMediaAssets,
  fetchMemories,
  fetchReleases,
  fetchSocialPlatformCapabilities,
  fetchTasks,
  IdaApiError,
  type IdaCommandRunRecord,
  isApiConfigured,
  type MediaSearchInput,
  type MediaSearchType,
  type MemoryRecord,
  proposePreferenceMemory,
  type ReleaseCreateInput,
  type ReleaseRecord,
  type ReleaseStatus,
  rejectMemory,
  rejectPostVariant,
  type SocialPlatform,
  type SocialPlatformCapabilityRecord,
  scheduleApprovedPostVariant,
  submitIdaCommand,
  type TaskCreateInput,
  type TaskRecord,
  type TrackCreateInput,
  updateArtistBrain,
  updateCampaignRelease,
  uploadMediaAsset,
} from "./api";
import {
  type ArtistBrain,
  getLocalIdaResponse,
  artistBrain as localArtistBrain,
  mediaAssets as localMediaAssets,
  systemServices as localSystemServices,
  tracks as localTracks,
  type MediaAsset,
  mobilePrimaryNavigation,
  type NavigationId,
  navigation,
  type OperationalState,
  type SystemService,
  sectionCopy,
  type Track,
} from "./data";

interface ConversationMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  meta?: string;
  fallback?: boolean;
  pending?: boolean;
}

interface NavigationControlProps {
  activeId: NavigationId;
  onNavigate: (id: NavigationId) => void;
  compact?: boolean;
}

const initialMessages: ConversationMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Je suis prête. Demande-moi de préparer ta journée, de retrouver un média ou de mettre une release en contexte.",
    meta: "IDA · command center",
  },
];

function commandRunsToMessages(commandRuns: IdaCommandRunRecord[]): ConversationMessage[] {
  return [...commandRuns].reverse().flatMap((commandRun) => [
    {
      id: `command-${commandRun.id}-user`,
      role: "user" as const,
      content: commandRun.message,
      meta: "You",
    },
    {
      id: `command-${commandRun.id}-assistant`,
      role: "assistant" as const,
      content: commandRun.responseMessage,
      meta: `IDA · ${commandRun.state}`,
    },
  ]);
}

const localDashboard: DashboardSnapshot = {
  systemServices: localSystemServices,
  tracks: localTracks,
  mediaAssets: localMediaAssets,
};

type DashboardSource = "loading" | "api" | "local";

function stateClass(state: OperationalState): string {
  return state.toLocaleLowerCase("en-US");
}

function NavigationControl({ activeId, onNavigate, compact = false }: NavigationControlProps) {
  const items = compact ? navigation.filter((item) => mobilePrimaryNavigation.includes(item.id)) : navigation;

  return (
    <nav
      className={compact ? "mobile-navigation" : "primary-navigation"}
      aria-label={compact ? "Navigation mobile" : "Navigation principale"}
    >
      {items.map((item) => (
        <button
          className={`navigation-item ${activeId === item.id ? "is-active" : ""}`}
          key={item.id}
          type="button"
          onClick={() => onNavigate(item.id)}
          aria-current={activeId === item.id ? "page" : undefined}
        >
          <span aria-hidden="true" className="navigation-glyph">
            {item.glyph}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function CommandComposer({
  onSubmit,
  isSubmitting,
  apiMode,
}: {
  onSubmit: (command: string) => void;
  isSubmitting: boolean;
  apiMode: "connected" | "fallback";
}) {
  const [command, setCommand] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCommand = command.trim();

    if (!nextCommand || isSubmitting) {
      return;
    }

    onSubmit(nextCommand);
    setCommand("");
  }

  return (
    <section className="command-card" aria-labelledby="ask-ida-title">
      <div className="command-glow" aria-hidden="true" />
      <div className="command-heading">
        <div className="assistant-mark" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="eyebrow">IDA CORE</p>
          <h2 id="ask-ida-title">Ask IDA anything…</h2>
        </div>
        <span className={`api-pill ${apiMode === "connected" ? "is-connected" : "is-fallback"}`}>
          <span aria-hidden="true" />
          {apiMode === "connected" ? "API connected" : "Local preview"}
        </span>
      </div>

      <form className="command-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="ida-command">
          Votre demande à IDA
        </label>
        <textarea
          id="ida-command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Prépare mes publications de demain…"
          rows={2}
          disabled={isSubmitting}
        />
        <div className="command-actions">
          <p>IDA utilisera uniquement les données et outils autorisés.</p>
          <button className="send-button" type="submit" disabled={isSubmitting || command.trim().length === 0}>
            {isSubmitting ? "IDA réfléchit…" : "Ask IDA"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
    </section>
  );
}

function ConversationPanel({
  messages,
  limit = 3,
  contextLabel = "Dernières réponses",
}: {
  messages: ConversationMessage[];
  limit?: number;
  contextLabel?: string;
}) {
  const latest = messages.slice(-limit);

  return (
    <section className="panel conversation-panel" aria-labelledby="conversation-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LIVE CONTEXT</p>
          <h2 id="conversation-title">Conversation</h2>
        </div>
        <span className="quiet-label">{contextLabel}</span>
      </div>
      <div className="conversation-stream" aria-live="polite">
        {latest.map((message) => (
          <article className={`message ${message.role} ${message.pending ? "is-pending" : ""}`} key={message.id}>
            <span className="message-avatar" aria-hidden="true">
              {message.role === "assistant" ? "✦" : "Y"}
            </span>
            <div>
              <p>{message.content}</p>
              {message.meta ? (
                <span className={message.fallback ? "message-meta fallback" : "message-meta"}>{message.meta}</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDashboardDate(summary: CommandCenterSummary | undefined, source: DashboardSource): string {
  if (!summary) {
    return source === "loading" ? "SYNC…" : "DATE API";
  }

  // `workspaceDate` est déjà résolue dans le fuseau du workspace par l'API.
  // UTC évite qu'un navigateur situé dans un autre fuseau ne décale ce jour.
  const date = new Date(`${summary.workspaceDate}T00:00:00.000Z`);

  if (Number.isNaN(date.valueOf())) {
    return "DATE API";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("weekday") ?? "DATE"} · ${values.get("day") ?? ""} ${values.get("month") ?? ""}`
    .trim()
    .toUpperCase();
}

function PriorityGrid({ summary, source }: { summary?: CommandCenterSummary; source: DashboardSource }) {
  const unavailableDetail = source === "loading" ? "synchronisation en cours" : "données API indisponibles";
  const priorities: Array<{
    label: string;
    value: number | undefined;
    detail: string;
    accent: "violet" | "blue" | "amber" | "mint";
  }> = summary
    ? [
        {
          label: "Approvals",
          value: summary.pendingApprovals,
          detail: "propositions à valider",
          accent: "violet",
        },
        {
          label: "Plans",
          value: summary.activeInternalSchedules,
          detail: "planifications internes actives",
          accent: "blue",
        },
        {
          label: "Campaigns",
          value: summary.activeCampaigns,
          detail: "campagnes actives",
          accent: "amber",
        },
        {
          label: "Releases",
          value: summary.upcomingReleases,
          detail: "releases à venir",
          accent: "mint",
        },
      ]
    : [
        { label: "Approvals", value: undefined, detail: unavailableDetail, accent: "violet" },
        { label: "Plans", value: undefined, detail: unavailableDetail, accent: "blue" },
        { label: "Campaigns", value: undefined, detail: unavailableDetail, accent: "amber" },
        { label: "Releases", value: undefined, detail: unavailableDetail, accent: "mint" },
      ];

  return (
    <section className="priority-grid" aria-label="Priorités du jour">
      {priorities.map((priority) => (
        <article className={`priority-card accent-${priority.accent}`} key={priority.label}>
          <p>{priority.label}</p>
          <strong>{priority.value ?? "—"}</strong>
          <span>{priority.detail}</span>
        </article>
      ))}
    </section>
  );
}

type EditorialCalendarSource = "loading" | "api" | "unavailable";

const editorialCalendarViews: Array<{ id: EditorialCalendarView; label: string }> = [
  { id: "DAY", label: "DAY" },
  { id: "WEEK", label: "WEEK" },
  { id: "MONTH", label: "MONTH" },
];

function editorialCalendarPlatform(platform: string): string {
  const labels: Record<string, string> = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    TIKTOK: "TikTok",
    YOUTUBE: "YouTube",
  };

  return labels[platform] ?? platform.replaceAll("_", " ");
}

function formatEditorialCalendarDate(value: string, timezone: string, compact = false): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return `Horaire indisponible · ${timezone}`;
  }

  const options: Intl.DateTimeFormatOptions = compact
    ? { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short", timeZone: timezone }
    : { day: "numeric", hour: "2-digit", minute: "2-digit", month: "long", timeZone: timezone, weekday: "long" };

  try {
    return `${new Intl.DateTimeFormat("fr-FR", options).format(date)} · ${timezone}`;
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: undefined }).format(date);
  }
}

function formatEditorialCalendarTime(value: string, timezone: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
}

function editorialCalendarStateLabel(state: EditorialCalendarItem["state"]): string {
  return state === "SCHEDULED_INTERNAL" ? "PLANIFIÉ DANS IDA" : "PRÊTE À PLANIFIER";
}

function useEditorialCalendar(view: EditorialCalendarView) {
  const [snapshot, setSnapshot] = useState<EditorialCalendarSnapshot | null>(null);
  const [source, setSource] = useState<EditorialCalendarSource>(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState(
    isApiConfigured ? "Chargement du calendrier éditorial…" : "Le calendrier nécessite la connexion à IDA API.",
  );
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    setSource("loading");
    // Le serveur calcule la fenêtre dans le fuseau du workspace. Le client ne
    // force donc pas une minuit UTC qui décalerait l'affichage local.
    void fetchEditorialCalendar({ view })
      .then((nextSnapshot) => {
        if (!isCurrent) {
          return;
        }

        setSnapshot(nextSnapshot);
        setSource("api");
        setNotice("Le calendrier affiche uniquement des décisions approuvées et des planifications internes.");
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSnapshot(null);
        setSource("unavailable");
        setNotice(`Le calendrier est indisponible : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, [revision, view]);

  return {
    snapshot,
    source,
    notice,
    refresh: () => setRevision((current) => current + 1),
  };
}

function CalendarPanel({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const { snapshot, source } = useEditorialCalendar("WEEK");
  const items = snapshot?.items.slice(0, 3) ?? [];

  return (
    <section className="panel calendar-panel" aria-labelledby="today-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">EDITORIAL CALENDAR</p>
          <h2 id="today-title">The next approved moves.</h2>
        </div>
        <button className="text-button" type="button" onClick={onOpenCalendar}>
          Open calendar <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="schedule-list">
        {source === "loading" ? <p className="calendar-preview-notice">Chargement des prochains créneaux…</p> : null}
        {source === "unavailable" ? (
          <p className="calendar-preview-notice">Calendrier disponible dès que l’API IDA est connectée.</p>
        ) : null}
        {source === "api" && items.length === 0 ? (
          <p className="calendar-preview-notice">Aucune décision approuvée dans cette fenêtre.</p>
        ) : null}
        {items.map((item) => (
          <article className="schedule-item" key={item.id}>
            <time>{formatEditorialCalendarTime(item.scheduledAt, item.timezone)}</time>
            <div>
              <h3>{item.postTitle}</h3>
              <p>{editorialCalendarPlatform(item.platform)}</p>
            </div>
            <span className={`status-tag ${item.state === "SCHEDULED_INTERNAL" ? "scheduled" : "approval"}`}>
              {item.state === "SCHEDULED_INTERNAL" ? "INTERNAL" : "READY"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrackPanel({ items, source }: { items: Track[]; source: DashboardSource }) {
  return (
    <section className="panel track-panel" aria-labelledby="tracks-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">MUSIC BRAIN</p>
          <h2 id="tracks-title">Tracks in focus.</h2>
        </div>
        <span className="quiet-label">{source === "api" ? "API data" : "Local preview"}</span>
      </div>
      <div className="track-list">
        {items.map((track, index) => (
          <article className="track-row" key={`${track.title}-${index}`}>
            <span className="track-index">0{index + 1}</span>
            <div className="track-information">
              <h3>{track.title}</h3>
              <p>
                {track.project} · {track.bpm ? `${track.bpm} BPM` : "BPM not set"} · {track.key}
              </p>
            </div>
            <div className="track-status">
              <span className={`status-tag ${track.status.toLocaleLowerCase("en-US")}`}>{track.status}</span>
              <small>{track.freshness}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MediaThumbnail({ asset, previewEnabled }: { asset: MediaAsset; previewEnabled: boolean }) {
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const previewUrl =
    previewEnabled && asset.previewAvailable && asset.previewUrl && !previewUnavailable ? asset.previewUrl : undefined;
  const fallbackGlyph =
    asset.kind === "VIDEO" ? "▶" : asset.kind === "AUDIO" ? "♫" : asset.kind === "IMAGE" ? "◇" : "◫";

  if (!previewUrl) {
    return (
      <div className={`media-thumbnail ${asset.tone}`} aria-hidden="true">
        <span>{fallbackGlyph}</span>
      </div>
    );
  }

  if (asset.kind === "IMAGE") {
    return (
      <div className={`media-thumbnail ${asset.tone} has-preview`}>
        <img
          src={previewUrl}
          alt={`Aperçu privé de ${asset.filename}`}
          loading="lazy"
          onError={() => setPreviewUnavailable(true)}
        />
      </div>
    );
  }

  if (asset.kind === "VIDEO") {
    return (
      <div className={`media-thumbnail ${asset.tone} has-preview`}>
        {/* biome-ignore lint/a11y/useMediaCaption: les sous-titres restent une métadonnée volontaire à ajouter, jamais générée ou inventée. */}
        <video
          controls
          playsInline
          preload="metadata"
          aria-label={`Aperçu privé de ${asset.filename}`}
          onError={() => setPreviewUnavailable(true)}
        >
          <source src={previewUrl} />
        </video>
      </div>
    );
  }

  if (asset.kind === "AUDIO") {
    return (
      <div className={`media-thumbnail ${asset.tone} has-preview audio-preview`}>
        {/* biome-ignore lint/a11y/useMediaCaption: les sous-titres restent une métadonnée volontaire à ajouter, jamais générée ou inventée. */}
        <audio
          controls
          preload="metadata"
          aria-label={`Aperçu privé de ${asset.filename}`}
          onError={() => setPreviewUnavailable(true)}
        >
          <source src={previewUrl} />
        </audio>
      </div>
    );
  }

  return (
    <div className={`media-thumbnail ${asset.tone}`} aria-hidden="true">
      <span>{fallbackGlyph}</span>
    </div>
  );
}

function MediaGrid({ assets, detailed = false }: { assets: MediaAsset[]; detailed?: boolean }) {
  return (
    <section className="media-grid" aria-label={detailed ? "Résultats de la Content Library" : "Médias récents"}>
      {assets.map((asset) => (
        <article className="media-card" key={asset.id ?? asset.filename}>
          <MediaThumbnail asset={asset} previewEnabled={detailed} />
          <div className="media-copy">
            <div className="media-title-line">
              <h3>{asset.filename}</h3>
              <span className={`status-tag ${asset.status.toLocaleLowerCase("en-US")}`}>{asset.status}</span>
            </div>
            <p>{asset.detail}</p>
            {detailed ? (
              <>
                <div className="media-library-meta">
                  <span>{asset.kind}</span>
                  {asset.sizeLabel ? <span>{asset.sizeLabel}</span> : null}
                  <span>{asset.previewAvailable ? "Aperçu privé" : "Aperçu indisponible"}</span>
                  <span>
                    {asset.usageCount ?? 0} utilisation{asset.usageCount === 1 ? "" : "s"}
                  </span>
                </div>
                {asset.tags?.length ? (
                  <div className="media-library-tags">
                    {asset.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : (
                  <p className="media-library-no-tags">Sans tag</p>
                )}
              </>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function SystemPanel({
  services: allServices,
  compact = false,
  source,
}: {
  services: SystemService[];
  compact?: boolean;
  source: DashboardSource;
}) {
  const services = compact ? allServices.slice(0, 4) : allServices;

  return (
    <section className="panel system-panel" aria-labelledby="system-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SYSTEM</p>
          <h2 id="system-title">Signal is clear.</h2>
        </div>
        <span className="quiet-label">{source === "api" ? "Live API status" : "Local preview"}</span>
      </div>
      <div className="system-list">
        {services.map((service) => (
          <article className="system-row" key={service.name}>
            <span className={`status-dot ${stateClass(service.state)}`} aria-hidden="true" />
            <div>
              <h3>{service.name}</h3>
              <p>{service.detail}</p>
            </div>
            <span className={`system-state ${stateClass(service.state)}`}>{service.state}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

type ActivityTimelineSource = "loading" | "api" | "unavailable";

function activityActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "campaign.created": "Campaign Brief créé",
    "campaign.release_linked": "Release rattachée à une campagne",
    "campaign.release_unlinked": "Release retirée d’une campagne",
    "release.created": "Release ajoutée au Music Brain",
    "track.created": "Morceau ajouté au Music Brain",
    "media.imported": "Média importé dans la bibliothèque",
    "memory.proposed": "Préférence proposée",
    "memory.confirmed": "Préférence enregistrée",
    "memory.rejected": "Préférence non enregistrée",
    "post_variant.approved": "Proposition approuvée",
    "post_variant.rejected": "Proposition refusée",
    "post_variant.internal_scheduled": "Proposition ajoutée au calendrier interne",
    "post_variant.internal_schedule_cancelled": "Planification interne annulée",
    "task.created": "Tâche créée",
    "task.completed": "Tâche terminée",
  };

  return labels[action] ?? "Action interne enregistrée";
}

function activityEntityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    CAMPAIGN: "CAMPAIGN",
    RELEASE: "MUSIC",
    TRACK: "MUSIC",
    MEDIA_ASSET: "CONTENT",
    MEMORY: "MEMORY",
    POST_VARIANT: "CONTENT",
    TASK: "TASKS",
  };

  return labels[entityType] ?? "SYSTEM";
}

function formatActivityTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date indisponible";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ActivityTimeline() {
  const [items, setItems] = useState<ActivityLogRecord[]>([]);
  const [source, setSource] = useState<ActivityTimelineSource>(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState("Chargement de l’historique d’activité…");

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchActivityLogs({ limit: 12 })
      .then((page) => {
        if (!isCurrent) {
          return;
        }

        setItems(page.items);
        setSource("api");
        setNotice(
          page.items.length === 0 ? "Aucune action interne n’est encore enregistrée." : "Timeline en lecture seule.",
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        setItems([]);
        setSource("unavailable");
        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setNotice(`Historique indisponible : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <section className="panel activity-timeline" aria-labelledby="activity-timeline-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ACTIVITY</p>
          <h2 id="activity-timeline-title">What IDA has recorded.</h2>
        </div>
        <span className="quiet-label">
          {source === "api" ? `${items.length} récent${items.length === 1 ? "" : "s"}` : "READ ONLY"}
        </span>
      </div>
      <p className="activity-timeline-intro">
        Une projection minimale de l’audit : aucune caption, préférence, média, hash, token ou détail privé n’est
        affiché.
      </p>
      {source !== "api" || items.length === 0 ? (
        <p className={`activity-timeline-empty ${source}`} role="status" aria-live="polite">
          {notice}
        </p>
      ) : (
        <ol className="activity-timeline-list" aria-label="Historique d’activité récent">
          {items.map((item) => (
            <li className="activity-timeline-item" key={item.id}>
              <span className="activity-timeline-marker" aria-hidden="true" />
              <div>
                <h3>{activityActionLabel(item.action)}</h3>
                <p>{activityEntityLabel(item.entityType)}</p>
              </div>
              <time dateTime={item.createdAt}>{formatActivityTime(item.createdAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type SocialCapabilitySource = "loading" | "api" | "unavailable";

const socialPlatformLabels: Record<SocialPlatform, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  FACEBOOK: "Facebook",
};

function formatSocialCapabilityDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "date non disponible";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function declaredSocialCapability(label: string, supported: boolean): string {
  return `${label} : ${supported ? "déclarée — non activée" : "non déclarée"}`;
}

function socialCapabilityItems(platform: SocialPlatformCapabilityRecord): string[] {
  return [
    declaredSocialCapability("OAuth", platform.oauthSupported),
    declaredSocialCapability("Brouillons natifs", platform.draftSupported),
    declaredSocialCapability("Planification native", platform.scheduleSupported),
    platform.publishSupported ? "Publication : déclarée — toujours soumise à validation" : "Publication : non déclarée",
    declaredSocialCapability("Analytics", platform.analyticsSupported),
    ...(platform.requiresHumanApproval ? ["Validation humaine requise avant toute action"] : []),
    ...(platform.requiresPlatformReview ? ["Revue de la plateforme requise avant activation"] : []),
    ...platform.notes.map((note) => `Note : ${note}`),
  ];
}

function SocialView({ dashboard, source }: { dashboard: DashboardSnapshot; source: DashboardSource }) {
  const [platforms, setPlatforms] = useState<SocialPlatformCapabilityRecord[]>([]);
  const [matrixSource, setMatrixSource] = useState<SocialCapabilitySource>(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState("Chargement des capacités sociales déclarées…");

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchSocialPlatformCapabilities()
      .then((capabilities) => {
        if (!isCurrent) {
          return;
        }

        setPlatforms(capabilities);
        setMatrixSource("api");
        setNotice(
          capabilities.length === 0
            ? "Aucune capacité sociale n’est déclarée pour ce workspace."
            : `${capabilities.length} plateforme${capabilities.length === 1 ? "" : "s"} déclarée${
                capabilities.length === 1 ? "" : "s"
              }. Le contrat ne renseigne aucun compte ni aucune autorisation d’action externe.`,
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        setPlatforms([]);
        setMatrixSource("unavailable");
        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setNotice(`Capacités sociales indisponibles : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <div className="page-grid social-grid">
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ADAPTER MATRIX</p>
            <h2>Capacités déclarées, sans supposition.</h2>
          </div>
          <span className="quiet-label">{matrixSource === "api" ? "API READ ONLY" : "READ ONLY"}</span>
        </div>
        <p className="panel-intro">
          Cette matrice provient du contrat partagé d’IDA. Elle ne représente ni un compte connecté, ni un token, ni une
          permission d’agir sur une plateforme externe.
        </p>
        {matrixSource !== "api" || platforms.length === 0 ? (
          <p className={`social-matrix-notice ${matrixSource}`} role="status" aria-live="polite">
            {notice}
          </p>
        ) : (
          <>
            <p className="social-matrix-notice" role="status" aria-live="polite">
              {notice}
            </p>
            <div className="social-list">
              {platforms.map((platform) => (
                <article className="social-card" key={platform.platform}>
                  <div className="social-card-heading">
                    <div>
                      <p className="social-platform">{socialPlatformLabels[platform.platform]}</p>
                      <p>
                        {platform.apiVersion} · vérifié le {formatSocialCapabilityDate(platform.verifiedAt)}
                      </p>
                    </div>
                    <span className="status-tag warning">DECLARED ONLY</span>
                  </div>
                  <ul>
                    {socialCapabilityItems(platform).map((capability) => (
                      <li key={capability}>{capability}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <SystemPanel services={dashboard.systemServices} compact source={source} />
    </div>
  );
}

type MusicTrackForm = {
  title: string;
  artistCredit: string;
  genre: string;
  bpm: string;
  musicalKey: string;
  releaseDate: string;
  label: string;
  status: Track["status"];
  tags: string;
  description: string;
};

const emptyMusicTrackForm: MusicTrackForm = {
  title: "",
  artistCredit: "",
  genre: "",
  bpm: "",
  musicalKey: "",
  releaseDate: "",
  label: "",
  status: "DEMO",
  tags: "",
  description: "",
};

const musicTrackStatuses: Track["status"][] = ["DEMO", "UNRELEASED", "SCHEDULED", "RELEASED", "ARCHIVED"];

type MusicReleaseForm = {
  title: string;
  releaseType: string;
  releaseDate: string;
  label: string;
  status: ReleaseStatus;
  tags: string;
  description: string;
};

const emptyMusicReleaseForm: MusicReleaseForm = {
  title: "",
  releaseType: "SINGLE",
  releaseDate: "",
  label: "",
  status: "DRAFT",
  tags: "",
  description: "",
};

const musicReleaseTypes = ["SINGLE", "EP", "ALBUM", "COMPILATION", "DJ SET", "OTHER"];
const musicReleaseStatuses: ReleaseStatus[] = ["DRAFT", "SCHEDULED", "RELEASED", "ARCHIVED"];

function optionalFormValue(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed || undefined;
}

function musicTrackFormToInput(form: MusicTrackForm): TrackCreateInput {
  const bpmValue = form.bpm.trim();

  return {
    title: form.title.trim(),
    artistCredit: form.artistCredit.trim(),
    genre: optionalFormValue(form.genre),
    bpm: bpmValue ? Number(bpmValue) : undefined,
    musicalKey: optionalFormValue(form.musicalKey),
    releaseDate: optionalFormValue(form.releaseDate),
    label: optionalFormValue(form.label),
    status: form.status,
    tags: textToList(form.tags),
    description: optionalFormValue(form.description),
  };
}

function musicReleaseFormToInput(form: MusicReleaseForm): ReleaseCreateInput {
  return {
    title: form.title.trim(),
    releaseType: form.releaseType.trim(),
    releaseDate: optionalFormValue(form.releaseDate),
    label: optionalFormValue(form.label),
    status: form.status,
    tags: textToList(form.tags),
    description: optionalFormValue(form.description),
  };
}

function MusicView({
  dashboard,
  source,
  onTrackCreated,
}: {
  dashboard: DashboardSnapshot;
  source: DashboardSource;
  onTrackCreated: (track: Track) => void;
}) {
  const [form, setForm] = useState<MusicTrackForm>(emptyMusicTrackForm);
  const [notice, setNotice] = useState("Ajoute les métadonnées essentielles. Le workspace est résolu côté serveur.");
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [isSaving, setIsSaving] = useState(false);

  function updateField(field: keyof MusicTrackForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    const artistCredit = form.artistCredit.trim();
    const bpm = form.bpm.trim() ? Number(form.bpm) : undefined;

    if (!title || !artistCredit) {
      setNotice("Le titre et le crédit artiste sont nécessaires pour créer un morceau.");
      setNoticeState("error");
      return;
    }

    if (bpm !== undefined && (!Number.isFinite(bpm) || bpm <= 0 || bpm > 400)) {
      setNotice("Le BPM doit être un nombre compris entre 1 et 400.");
      setNoticeState("error");
      return;
    }

    setIsSaving(true);

    try {
      const track = await createTrack(musicTrackFormToInput(form));
      onTrackCreated(track);
      setForm((current) => ({
        ...emptyMusicTrackForm,
        artistCredit: current.artistCredit,
        label: current.label,
      }));
      setNotice(`« ${track.title} » a été ajouté au catalogue local IDA.`);
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setNotice(`Aucun morceau n’a été enregistré : ${reason}`);
      setNoticeState("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-grid music-view">
      <TrackPanel items={dashboard.tracks} source={source} />
      <section className="panel music-entry-card" aria-labelledby="music-entry-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CATALOGUE ENTRY</p>
            <h2 id="music-entry-title">Add a track.</h2>
          </div>
          <span className="status-tag demo">LOCAL ONLY</span>
        </div>
        <p className="music-entry-intro">
          Crée une fiche de morceau contrôlée. Aucun média, lien externe ou contenu public n’est créé ici.
        </p>
        <p className={`music-entry-notice ${noticeState}`} role="status">
          <span aria-hidden="true" />
          {notice}
        </p>
        <form className="music-entry-form" noValidate onSubmit={handleSubmit}>
          <div className="music-entry-fields">
            <label className="music-entry-field music-entry-field-wide">
              <span>Titre</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Nom du morceau"
                required
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>Crédit artiste</span>
              <input
                value={form.artistCredit}
                onChange={(event) => updateField("artistCredit", event.target.value)}
                placeholder="Artiste principal"
                required
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>Statut</span>
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
                disabled={isSaving}
              >
                {musicTrackStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="music-entry-field">
              <span>Genre</span>
              <input
                value={form.genre}
                onChange={(event) => updateField("genre", event.target.value)}
                placeholder="Melodic techno…"
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>BPM</span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                max="400"
                step="0.01"
                value={form.bpm}
                onChange={(event) => updateField("bpm", event.target.value)}
                placeholder="124"
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>Tonalité</span>
              <input
                value={form.musicalKey}
                onChange={(event) => updateField("musicalKey", event.target.value)}
                placeholder="F♯ minor"
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>Date de release</span>
              <input
                type="date"
                value={form.releaseDate}
                onChange={(event) => updateField("releaseDate", event.target.value)}
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>Label</span>
              <input
                value={form.label}
                onChange={(event) => updateField("label", event.target.value)}
                placeholder="Optionnel"
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field">
              <span>Tags</span>
              <input
                value={form.tags}
                onChange={(event) => updateField("tags", event.target.value)}
                placeholder="club, nocturne…"
                disabled={isSaving}
              />
            </label>
            <label className="music-entry-field music-entry-field-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Contexte créatif ou notes de production…"
                rows={3}
                disabled={isSaving}
              />
            </label>
          </div>
          <div className="music-entry-actions">
            <p>Tu pourras relier ce morceau à une release ou à des médias dans une prochaine tranche.</p>
            <button className="send-button" type="submit" disabled={isSaving}>
              {isSaving ? "Ajout…" : "Add track"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>
      <ReleaseRegistry />
    </div>
  );
}

function releaseRegistryDetail(release: ReleaseRecord): string {
  const details = [
    release.releaseType,
    release.releaseDate ? formatCampaignDate(release.releaseDate) : "Date à définir",
  ];

  if (release.label) {
    details.push(release.label);
  }

  return details.join(" · ");
}

function ReleaseRegistry() {
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [source, setSource] = useState<"loading" | "api" | "unavailable">(isApiConfigured ? "loading" : "unavailable");
  const [form, setForm] = useState<MusicReleaseForm>(emptyMusicReleaseForm);
  const [notice, setNotice] = useState("Chargement des releases du Music Brain…");
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchReleases()
      .then((items) => {
        if (!isCurrent) {
          return;
        }

        setReleases(items);
        setSource("api");
        setNotice(
          items.length === 0
            ? "Aucune release locale n’est encore enregistrée."
            : `${items.length} release${items.length === 1 ? "" : "s"} locale${items.length === 1 ? "" : "s"} disponible${
                items.length === 1 ? "" : "s"
              }.`,
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSource("unavailable");
        setNotice(`Les releases ne peuvent pas être chargées : ${reason}`);
        setNoticeState("error");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateField(field: keyof MusicReleaseForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.releaseType.trim()) {
      setNotice("Le titre et le type sont nécessaires pour créer une release.");
      setNoticeState("error");
      return;
    }

    setIsSaving(true);

    try {
      const release = await createRelease(musicReleaseFormToInput(form));
      setReleases((current) => [release, ...current.filter((item) => item.id !== release.id)]);
      setSource("api");
      setForm((current) => ({ ...emptyMusicReleaseForm, label: current.label }));
      setNotice(`« ${release.title} » a été ajoutée au registre local.`);
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setNotice(`Aucune release n’a été enregistrée : ${reason}`);
      setNoticeState("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel release-registry-card" aria-labelledby="release-registry-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">RELEASE REGISTRY</p>
          <h2 id="release-registry-title">Release context, kept local.</h2>
        </div>
        <span className="status-tag demo">LOCAL ONLY</span>
      </div>
      <p className="music-entry-intro">
        Une release pose le contexte de ta sortie. Aucun morceau, média, lien externe, calendrier ou action sociale
        n’est relié automatiquement.
      </p>
      <p className={`music-entry-notice ${noticeState}`} role="status" aria-live="polite">
        <span aria-hidden="true" />
        {notice}
      </p>
      {source === "api" && releases.length > 0 ? (
        <div className="release-registry-list">
          {releases.map((release) => (
            <article className="release-registry-row" key={release.id}>
              <div>
                <h3>{release.title}</h3>
                <p>{releaseRegistryDetail(release)}</p>
                {release.tags.length > 0 ? (
                  <div className="release-tag-list">
                    {release.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className={`status-tag ${release.status.toLocaleLowerCase("en-US")}`}>{release.status}</span>
            </article>
          ))}
        </div>
      ) : null}
      <form className="music-entry-form release-entry-form" noValidate onSubmit={handleSubmit}>
        <div className="music-entry-fields">
          <label className="music-entry-field music-entry-field-wide">
            <span>Titre de la release</span>
            <input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Nom de la sortie"
              required
              disabled={isSaving}
            />
          </label>
          <label className="music-entry-field">
            <span>Type</span>
            <select
              value={form.releaseType}
              onChange={(event) => updateField("releaseType", event.target.value)}
              disabled={isSaving}
            >
              {musicReleaseTypes.map((releaseType) => (
                <option key={releaseType} value={releaseType}>
                  {releaseType}
                </option>
              ))}
            </select>
          </label>
          <label className="music-entry-field">
            <span>Statut</span>
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
              disabled={isSaving}
            >
              {musicReleaseStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="music-entry-field">
            <span>Date de sortie</span>
            <input
              type="date"
              value={form.releaseDate}
              onChange={(event) => updateField("releaseDate", event.target.value)}
              disabled={isSaving}
            />
          </label>
          <label className="music-entry-field">
            <span>Label</span>
            <input
              value={form.label}
              onChange={(event) => updateField("label", event.target.value)}
              placeholder="Optionnel"
              disabled={isSaving}
            />
          </label>
          <label className="music-entry-field music-entry-field-wide">
            <span>Tags</span>
            <input
              value={form.tags}
              onChange={(event) => updateField("tags", event.target.value)}
              placeholder="teaser, club, release…"
              disabled={isSaving}
            />
          </label>
          <label className="music-entry-field music-entry-field-wide">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Contexte artistique de cette sortie…"
              rows={3}
              disabled={isSaving}
            />
          </label>
        </div>
        <div className="music-entry-actions">
          <p>
            Les relations avec les tracks, médias, campagnes et plateformes seront ajoutées par des actions séparées.
          </p>
          <button className="send-button" type="submit" disabled={isSaving || source === "unavailable"}>
            {isSaving ? "Ajout…" : "Add release"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
    </section>
  );
}

const maximumMediaUploadBytes = 25 * 1024 * 1024;

type MediaUploadForm = {
  description: string;
  tags: string;
};

const emptyMediaUploadForm: MediaUploadForm = {
  description: "",
  tags: "",
};

type MediaSearchForm = {
  q: string;
  status: "" | MediaAsset["status"];
  type: "" | MediaSearchType;
  tag: string;
};

const emptyMediaSearchForm: MediaSearchForm = {
  q: "",
  status: "",
  type: "",
  tag: "",
};

function mediaSearchInput(form: MediaSearchForm): MediaSearchInput {
  return {
    q: optionalFormValue(form.q),
    status: form.status || undefined,
    type: form.type || undefined,
    tag: optionalFormValue(form.tag),
    limit: 24,
  };
}

function displayFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatContentRotationDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "Date indisponible";
  }

  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

function ContentRotationPanel({ refreshVersion }: { refreshVersion: number }) {
  const [candidates, setCandidates] = useState<ContentRotationCandidate[]>([]);
  const [source, setSource] = useState<"loading" | "api" | "unavailable">(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState(
    isApiConfigured
      ? "Vérification des médias réellement disponibles…"
      : "La rotation nécessite la connexion à IDA API.",
  );
  const title =
    source === "loading"
      ? "Checking availability."
      : source === "unavailable"
        ? "Availability unavailable."
        : candidates.length > 0
          ? "Available assets."
          : "Nothing free yet.";

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    setSource("loading");
    void fetchContentRotationCandidates({ limit: 6 })
      .then((nextCandidates) => {
        if (!isCurrent) {
          return;
        }

        setCandidates(nextCandidates);
        setSource("api");
        setNotice(
          nextCandidates.length === 0
            ? "Aucun média libre pour le moment. Les médias déjà liés à une proposition restent volontairement exclus."
            : `${nextCandidates.length} média${nextCandidates.length > 1 ? "s" : ""} libre${nextCandidates.length > 1 ? "s" : ""} à considérer.`,
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setCandidates([]);
        setSource("unavailable");
        setNotice(`Rotation indisponible : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, [refreshVersion]);

  return (
    <section className="panel freshness-card content-rotation-card" aria-labelledby="content-rotation-title">
      <p className="eyebrow">CONTENT ROTATION</p>
      <strong>{source === "api" ? candidates.length : "—"}</strong>
      <h2 id="content-rotation-title">{title}</h2>
      <p>{notice}</p>
      {source === "api" && candidates.length > 0 ? (
        <ol className="content-rotation-list" aria-label="Médias actuellement disponibles">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <div>
                <strong>{candidate.filename}</strong>
                <span>
                  {candidate.type} · ajouté {formatContentRotationDate(candidate.createdAt)}
                </span>
              </div>
              <em>{candidate.state}</em>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ContentView({ onMediaAssetCreated }: { onMediaAssetCreated: (asset: MediaAsset) => void }) {
  const [form, setForm] = useState<MediaUploadForm>(emptyMediaUploadForm);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("Un fichier à la fois, stocké dans la bibliothèque privée IDA.");
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [searchForm, setSearchForm] = useState<MediaSearchForm>(emptyMediaSearchForm);
  const [activeSearch, setActiveSearch] = useState<MediaSearchForm>(emptyMediaSearchForm);
  const [searchResults, setSearchResults] = useState<MediaAsset[]>([]);
  const [searchState, setSearchState] = useState<"loading" | "ready" | "error">("loading");
  const [searchNotice, setSearchNotice] = useState("Chargement de la bibliothèque privée…");
  const [rotationVersion, setRotationVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    void loadMedia(emptyMediaSearchForm);
  }, []);

  async function loadMedia(nextSearch: MediaSearchForm) {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchState("loading");
    setSearchNotice("Recherche dans les métadonnées privées…");

    try {
      const assets = await fetchMediaAssets(mediaSearchInput(nextSearch));

      if (searchRequestRef.current !== requestId) {
        return;
      }

      setSearchResults(assets);
      setSearchState("ready");
      setSearchNotice(
        assets.length === 0
          ? "Aucun média ne correspond à ces filtres."
          : `${assets.length} média${assets.length > 1 ? "s" : ""} trouvé${assets.length > 1 ? "s" : ""} dans ce workspace.`,
      );
    } catch (error: unknown) {
      if (searchRequestRef.current !== requestId) {
        return;
      }

      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setSearchResults([]);
      setSearchState("error");
      setSearchNotice(`La recherche est indisponible : ${reason}`);
    }
  }

  function updateSearchField(field: keyof MediaSearchForm, value: string) {
    setSearchForm((current) => ({ ...current, [field]: value }));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearch(searchForm);
    void loadMedia(searchForm);
  }

  function resetSearch() {
    setSearchForm(emptyMediaSearchForm);
    setActiveSearch(emptyMediaSearchForm);
    void loadMedia(emptyMediaSearchForm);
  }

  function setSelectedFile(nextFile: File | undefined) {
    if (!nextFile) {
      return;
    }

    if (nextFile.size > maximumMediaUploadBytes) {
      setFile(null);
      setNotice("Ce fichier dépasse la limite locale de 25 MiB.");
      setNoticeState("error");
      return;
    }

    setFile(nextFile);
    setNotice(`« ${nextFile.name} » est prêt à être importé.`);
    setNoticeState("default");
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    setSelectedFile(event.dataTransfer.files.item(0) ?? undefined);
  }

  function handleFileSelection(event: FormEvent<HTMLInputElement>) {
    setSelectedFile(event.currentTarget.files?.item(0) ?? undefined);
  }

  function updateField(field: keyof MediaUploadForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setNotice("Choisis un fichier avant de l’ajouter à la bibliothèque.");
      setNoticeState("error");
      return;
    }

    if (file.size > maximumMediaUploadBytes) {
      setNotice("Ce fichier dépasse la limite locale de 25 MiB.");
      setNoticeState("error");
      return;
    }

    setIsUploading(true);
    setNotice("Importation sécurisée en cours…");
    setNoticeState("default");

    try {
      const asset = await uploadMediaAsset({
        file,
        description: optionalFormValue(form.description),
        tags: optionalFormValue(form.tags),
      });
      onMediaAssetCreated(asset);
      void loadMedia(activeSearch);
      setRotationVersion((current) => current + 1);
      setForm(emptyMediaUploadForm);
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setNotice(`« ${asset.filename} » est maintenant disponible dans la Content Library.`);
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      const prefix = error instanceof IdaApiError && error.status === 409 ? "Ce fichier est déjà connu. " : "";
      setNotice(`${prefix}Aucun média n’a été importé : ${reason}`);
      setNoticeState("error");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="content-view">
      <section className="panel wide-panel content-library-card" aria-labelledby="content-library-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CONTENT LIBRARY</p>
            <h2 id="content-library-title">Find the right asset, safely.</h2>
          </div>
          <span className="quiet-label">
            {searchState === "ready"
              ? `${searchResults.length} RESULT${searchResults.length === 1 ? "" : "S"}`
              : "PRIVATE SEARCH"}
          </span>
        </div>
        <p className="content-library-intro">
          Recherche locale dans les noms, descriptions et tags du workspace. Aucun fichier ni lien de stockage n’est
          exposé ; les aperçus disponibles restent servis par une route privée autorisée.
        </p>
        <form className="content-library-search" noValidate onSubmit={handleSearch}>
          <label className="content-library-filter content-library-query" htmlFor="content-search-query">
            <span>Recherche</span>
            <input
              id="content-search-query"
              value={searchForm.q}
              onChange={(event) => updateSearchField("q", event.target.value)}
              placeholder="Nom, description ou tag…"
              maxLength={160}
            />
          </label>
          <label className="content-library-filter" htmlFor="content-search-status">
            <span>Statut</span>
            <select
              id="content-search-status"
              value={searchForm.status}
              onChange={(event) => updateSearchField("status", event.target.value)}
            >
              <option value="">Tous</option>
              <option value="UNUSED">Unused</option>
              <option value="USED">Used</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label className="content-library-filter" htmlFor="content-search-type">
            <span>Type</span>
            <select
              id="content-search-type"
              value={searchForm.type}
              onChange={(event) => updateSearchField("type", event.target.value)}
            >
              <option value="">Tous</option>
              <option value="VIDEO">Video</option>
              <option value="IMAGE">Image</option>
              <option value="AUDIO">Audio</option>
              <option value="DOCUMENT">Document</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="content-library-filter" htmlFor="content-search-tag">
            <span>Tag exact</span>
            <input
              id="content-search-tag"
              value={searchForm.tag}
              onChange={(event) => updateSearchField("tag", event.target.value)}
              placeholder="studio"
              maxLength={80}
            />
          </label>
          <div className="content-library-search-actions">
            <button className="send-button" type="submit" disabled={searchState === "loading"}>
              {searchState === "loading" ? "Recherche…" : "Search"}
              <span aria-hidden="true">↗</span>
            </button>
            <button
              className="content-search-reset"
              type="button"
              onClick={resetSearch}
              disabled={searchState === "loading"}
            >
              Reset
            </button>
          </div>
        </form>
        <p className={`content-library-notice ${searchState}`} role="status" aria-live="polite">
          <span aria-hidden="true" />
          {searchNotice}
        </p>
        {searchState === "loading" ? <p className="content-library-empty-state">Chargement des résultats…</p> : null}
        {searchState === "error" ? (
          <div className="content-library-error-state">
            <p>La bibliothèque reste inchangée.</p>
            <button className="content-search-reset" type="button" onClick={() => void loadMedia(activeSearch)}>
              Réessayer
            </button>
          </div>
        ) : null}
        {searchState === "ready" && searchResults.length === 0 ? (
          <p className="content-library-empty-state">Essaie un autre mot-clé ou retire un filtre.</p>
        ) : null}
        {searchState === "ready" && searchResults.length > 0 ? <MediaGrid assets={searchResults} detailed /> : null}
      </section>
      <ApprovalCenter />
      <section className="panel content-import-card" aria-labelledby="content-import-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LOCAL IMPORT</p>
            <h2 id="content-import-title">Add one media asset.</h2>
          </div>
          <span className="status-tag demo">PRIVATE</span>
        </div>
        <p className="content-import-intro">
          Import local uniquement : aucun post, brouillon public ou action sociale n’est créé ici.
        </p>
        <p className={`content-import-notice ${noticeState}`} role="status">
          <span aria-hidden="true" />
          {notice}
        </p>
        <form className="content-import-form" noValidate onSubmit={handleSubmit}>
          <input
            className="sr-only"
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelection}
            disabled={isUploading}
            aria-label="Choisir un fichier média"
          />
          <button
            className={`content-dropzone ${isDragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
            disabled={isUploading}
            aria-describedby="media-upload-hint"
          >
            <span className="content-dropzone-mark" aria-hidden="true">
              {file ? "✓" : "↑"}
            </span>
            <span className="content-dropzone-copy">
              <strong>{file ? file.name : "Drop a media file here"}</strong>
              <small id="media-upload-hint">
                {file
                  ? `${displayFileSize(file.size)} · Click to replace`
                  : "ou sélectionne un fichier · 25 MiB maximum"}
              </small>
            </span>
          </button>
          <div className="content-import-fields">
            <label className="content-import-field content-import-field-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Contexte, intention ou note de production…"
                rows={3}
                disabled={isUploading}
              />
            </label>
            <label className="content-import-field content-import-field-wide">
              <span>Tags</span>
              <input
                value={form.tags}
                onChange={(event) => updateField("tags", event.target.value)}
                placeholder="studio, Afterimage, nocturne…"
                disabled={isUploading}
              />
            </label>
          </div>
          {isUploading ? (
            <div className="content-upload-progress" role="progressbar" aria-label="Importation en cours">
              <span />
            </div>
          ) : null}
          <div className="content-import-actions">
            <p>IDA vérifiera le fichier côté serveur avant de le rendre disponible dans ce workspace.</p>
            <button className="send-button" type="submit" disabled={isUploading || !file}>
              {isUploading ? "Importation…" : "Add media"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>
      <ContentRotationPanel refreshVersion={rotationVersion} />
    </div>
  );
}

function approvalPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    TIKTOK: "TikTok",
    YOUTUBE: "YouTube",
  };

  return labels[platform] ?? platform.replaceAll("_", " ");
}

function formatApprovalPlan(value: string | undefined, timezone: string): string {
  if (!value) {
    return `Date proposée à préciser · ${timezone}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return `Date proposée à préciser · ${timezone}`;
  }

  try {
    return `${new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZone: timezone,
    }).format(date)} · ${timezone}`;
  } catch {
    return `${new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
    }).format(date)} · ${timezone}`;
  }
}

function formatApprovalRequestDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "Date de demande indisponible";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function approvalQueueHeading(source: "loading" | "api" | "unavailable", count: number): string {
  if (source === "loading") {
    return "Chargement…";
  }

  if (source === "unavailable") {
    return "File indisponible.";
  }

  return count ? `${count} à décider` : "Nothing waiting.";
}

function ApprovalCenter() {
  const [approvals, setApprovals] = useState<ApprovalQueueItem[]>([]);
  const [source, setSource] = useState<"loading" | "api" | "unavailable">(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState(
    isApiConfigured ? "Chargement des propositions à valider…" : "L’Approval Center nécessite la connexion à IDA API.",
  );
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchApprovalQueue()
      .then((nextApprovals) => {
        if (!isCurrent) {
          return;
        }

        setApprovals(nextApprovals);
        setSource("api");
        setNotice(
          "Chaque proposition exige une décision humaine. Aucune publication ni planification n’est déclenchée ici.",
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSource("unavailable");
        setNotice(`L’Approval Center est indisponible : ${reason}`);
        setNoticeState("error");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function refreshAfterConflict() {
    const nextApprovals = await fetchApprovalQueue();

    setApprovals(nextApprovals);
    setSource("api");
  }

  async function handleDecision(approval: ApprovalQueueItem, decision: "approve" | "reject") {
    if (approval.approvalState !== "REQUESTED" || activeApprovalId) {
      return;
    }

    setActiveApprovalId(approval.approvalId);

    try {
      if (decision === "approve") {
        await approvePostVariant(approval.variantId, approval.approvalId, approval.payloadHash);
      } else {
        await rejectPostVariant(approval.variantId, approval.approvalId, approval.payloadHash);
      }

      setApprovals((current) => current.filter((candidate) => candidate.approvalId !== approval.approvalId));
      setSource("api");
      setNotice(
        decision === "approve"
          ? `« ${approval.postTitle} » est approuvée — date toujours proposée, pas de publication ni planification.`
          : `« ${approval.postTitle} » est rejetée — date toujours proposée, pas de publication ni planification.`,
      );
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";

      if (error instanceof IdaApiError && error.status === 409) {
        try {
          await refreshAfterConflict();
          setNotice("Cette proposition a changé ou a déjà été traitée. La file a été actualisée.");
        } catch (refreshError: unknown) {
          const refreshReason =
            refreshError instanceof IdaApiError ? refreshError.message : "IDA API est indisponible.";
          setSource("unavailable");
          setNotice(`La proposition a changé d’état, mais la file est indisponible : ${refreshReason}`);
        }
      } else {
        setNotice(`La décision n’a pas été enregistrée : ${reason}`);
      }

      setNoticeState("error");
    } finally {
      setActiveApprovalId(null);
    }
  }

  const canDecide = source === "api" && activeApprovalId === null;

  return (
    <section className="panel wide-panel approval-center-card" aria-labelledby="approval-center-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">IDA APPROVAL CENTER</p>
          <h2 id="approval-center-title">Review before anything moves.</h2>
        </div>
        <span className="status-tag approval">HUMAN DECISION</span>
      </div>
      <p className="approval-center-intro">
        IDA prépare les propositions ; tu décides. Cette étape ne publie et ne programme aucun contenu.
      </p>
      <p className={`approval-center-notice ${noticeState}`} role="status">
        <span aria-hidden="true" />
        {notice}
      </p>

      <div className="approval-center-divider" />

      <div className="approval-section-heading">
        <div>
          <p className="eyebrow">REQUESTED APPROVALS</p>
          <h3>{approvalQueueHeading(source, approvals.length)}</h3>
        </div>
        <span className="quiet-label">No delivery configured</span>
      </div>

      {source === "loading" ? <p className="approval-empty-state">Chargement des propositions…</p> : null}
      {source === "api" && approvals.length === 0 ? (
        <p className="approval-empty-state">Aucune proposition à valider. Les prochaines demandes apparaîtront ici.</p>
      ) : null}
      {source === "unavailable" ? (
        <p className="approval-empty-state">La file ne peut pas être consultée tant que l’API reste indisponible.</p>
      ) : null}

      <div className="approval-proposal-list" aria-live="polite">
        {approvals.map((approval) => {
          const isActive = activeApprovalId === approval.approvalId;

          return (
            <article className="approval-proposal" key={approval.approvalId} aria-busy={isActive}>
              <div className="approval-proposal-heading">
                <div>
                  <div className="approval-proposal-meta">
                    <span>{approvalPlatformLabel(approval.platform)}</span>
                    <span>·</span>
                    <time dateTime={approval.requestedAt}>
                      Demandée {formatApprovalRequestDate(approval.requestedAt)}
                    </time>
                  </div>
                  <h3>{approval.postTitle}</h3>
                </div>
                <div className="approval-state-stack">
                  <span className="approval-state-tag requested">{approval.approvalState}</span>
                  <span className="approval-delivery-tag">{approval.deliveryState.replaceAll("_", " ")}</span>
                </div>
              </div>

              <div className="approval-plan-line">
                <span className="approval-plan-label">DATE PROPOSÉE</span>
                <time dateTime={approval.plannedAt}>{formatApprovalPlan(approval.plannedAt, approval.timezone)}</time>
              </div>

              <div className="approval-detail-grid">
                <div className="approval-detail approval-detail-wide">
                  <span>MEDIA</span>
                  <div className="approval-media-names">
                    {approval.media.length > 0 ? (
                      approval.media.map((media, index) => <p key={`${media.filename}-${index}`}>{media.filename}</p>)
                    ) : (
                      <p>Aucun média attaché.</p>
                    )}
                  </div>
                </div>
                <div className="approval-detail approval-detail-wide">
                  <span>CAPTION</span>
                  <p className="approval-caption">{approval.caption}</p>
                </div>
                <div className="approval-detail">
                  <span>HASHTAGS</span>
                  {approval.hashtags.length > 0 ? (
                    <div className="approval-hashtags">
                      {approval.hashtags.map((hashtag) => (
                        <span key={hashtag}>{hashtag}</span>
                      ))}
                    </div>
                  ) : (
                    <p>Aucun hashtag.</p>
                  )}
                </div>
                <div className="approval-detail">
                  <span>CTA</span>
                  <p>{approval.cta ?? "Non renseigné."}</p>
                </div>
                <div className="approval-detail">
                  <span>OBJECTIVE</span>
                  <p>{approval.objective}</p>
                </div>
                <div className="approval-detail">
                  <span>AI REASONING</span>
                  <p>{approval.rationale ?? "Rationale non renseignée."}</p>
                </div>
              </div>

              <p className="approval-next-step">
                EDIT et REGENERATE seront ajoutés dans une prochaine tranche contrôlée.
              </p>

              <div className="approval-actions">
                <button
                  className="approval-action-button approve"
                  type="button"
                  onClick={() => void handleDecision(approval, "approve")}
                  disabled={!canDecide}
                  aria-label={`Approuver « ${approval.postTitle} » sans publier ni planifier`}
                >
                  {isActive ? "DECIDING…" : "APPROVE"}
                </button>
                <button
                  className="approval-action-button reject"
                  type="button"
                  onClick={() => void handleDecision(approval, "reject")}
                  disabled={!canDecide}
                  aria-label={`Rejeter « ${approval.postTitle} » sans publier ni planifier`}
                >
                  {isActive ? "DECIDING…" : "REJECT"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CalendarView() {
  const [view, setView] = useState<EditorialCalendarView>("WEEK");
  const { snapshot, source, notice, refresh } = useEditorialCalendar(view);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [decisionState, setDecisionState] = useState<"default" | "success" | "error">("default");
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const items = snapshot?.items ?? [];
  const readyCount = items.filter((item) => item.state === "READY_TO_SCHEDULE").length;
  const scheduledCount = items.filter((item) => item.state === "SCHEDULED_INTERNAL").length;

  async function handleSchedule(item: EditorialCalendarItem) {
    if (item.state !== "READY_TO_SCHEDULE" || activeScheduleId) {
      return;
    }

    setActiveScheduleId(item.id);
    setDecisionNotice(null);

    try {
      await scheduleApprovedPostVariant(item.variantId, item.approvalId, item.payloadHash);
      setDecisionState("success");
      setDecisionNotice(
        `« ${item.postTitle} » est planifiée dans IDA. Aucun scheduler ni aucune publication externe n’est déclenché.`,
      );
      refresh();
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setDecisionState("error");
      setDecisionNotice(`La planification interne n’a pas été enregistrée : ${reason}`);
      refresh();
    } finally {
      setActiveScheduleId(null);
    }
  }

  async function handleCancel(item: EditorialCalendarItem) {
    if (item.state !== "SCHEDULED_INTERNAL" || activeScheduleId) {
      return;
    }

    setActiveScheduleId(item.id);
    setDecisionNotice(null);

    try {
      await cancelInternalPostSchedule(item.id);
      setDecisionState("success");
      setDecisionNotice(
        `« ${item.postTitle} » n’est plus planifiée dans IDA. Aucun scheduler ni aucune publication externe n’a été touché.`,
      );
      refresh();
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setDecisionState("error");
      setDecisionNotice(`La planification interne n’a pas pu être annulée : ${reason}`);
      refresh();
    } finally {
      setActiveScheduleId(null);
    }
  }

  return (
    <div className="page-grid calendar-view editorial-calendar-view">
      <section className="panel wide-panel editorial-calendar-card" aria-labelledby="editorial-calendar-title">
        <div className="panel-heading editorial-calendar-heading">
          <div>
            <p className="eyebrow">EDITORIAL CALENDAR</p>
            <h2 id="editorial-calendar-title">Plan the approved moment.</h2>
          </div>
          <span className="status-tag approval">INTERNAL ONLY</span>
        </div>
        <p className="editorial-calendar-intro">
          Une planification ici reste une intention interne à IDA. Elle n’active ni scheduler, ni compte social, ni
          publication.
        </p>
        <div className="editorial-calendar-toolbar">
          <div className="editorial-calendar-tabs" role="tablist" aria-label="Période du calendrier">
            {editorialCalendarViews.map((option) => (
              <button
                className={option.id === view ? "is-active" : ""}
                type="button"
                key={option.id}
                role="tab"
                aria-selected={option.id === view}
                onClick={() => {
                  setView(option.id);
                  setDecisionNotice(null);
                  setDecisionState("default");
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="editorial-calendar-range">
            {snapshot
              ? `${formatEditorialCalendarDate(snapshot.range.from, snapshot.range.timezone, true)} → ${formatEditorialCalendarDate(snapshot.range.to, snapshot.range.timezone, true)}`
              : "Plage en cours de chargement"}
          </span>
        </div>
        <p
          className={`editorial-calendar-notice ${source === "unavailable" || decisionState === "error" ? "error" : decisionState}`}
          role="status"
        >
          <span aria-hidden="true" />
          {decisionNotice ?? notice}
        </p>

        {source === "loading" ? <p className="editorial-calendar-empty">Chargement des créneaux éditoriaux…</p> : null}
        {source === "unavailable" ? (
          <p className="editorial-calendar-empty">
            La projection calendrier réapparaîtra dès que l’API IDA est disponible.
          </p>
        ) : null}
        {source === "api" && items.length === 0 ? (
          <p className="editorial-calendar-empty">Aucun contenu approuvé ou planifié dans cette période.</p>
        ) : null}

        <div className="editorial-calendar-list" aria-live="polite">
          {items.map((item) => {
            const isScheduling = activeScheduleId === item.id;
            const isReady = item.state === "READY_TO_SCHEDULE";

            return (
              <article
                className={`editorial-calendar-item ${isReady ? "ready" : "scheduled"}`}
                key={item.id}
                aria-busy={isScheduling}
              >
                <div className="editorial-calendar-item-topline">
                  <span>{editorialCalendarPlatform(item.platform)}</span>
                  <span className={`status-tag ${isReady ? "approval" : "scheduled"}`}>
                    {editorialCalendarStateLabel(item.state)}
                  </span>
                </div>
                <h3>{item.postTitle}</h3>
                <time dateTime={item.scheduledAt}>{formatEditorialCalendarDate(item.scheduledAt, item.timezone)}</time>
                <p>
                  {isReady
                    ? "Date approuvée : tu peux la planifier dans IDA sans déclencher de livraison externe."
                    : "Planifié dans IDA : aucune livraison sociale, aucun job ni scheduler ne sont configurés."}
                </p>
                {isReady ? (
                  <button
                    className="editorial-calendar-schedule-button"
                    type="button"
                    disabled={source !== "api" || activeScheduleId !== null}
                    onClick={() => void handleSchedule(item)}
                    aria-label={`Planifier « ${item.postTitle} » uniquement dans IDA`}
                  >
                    {isScheduling ? "PLANIFICATION…" : "PLANIFIER DANS IDA"}
                  </button>
                ) : (
                  <button
                    className="editorial-calendar-cancel-button"
                    type="button"
                    disabled={source !== "api" || activeScheduleId !== null}
                    onClick={() => void handleCancel(item)}
                    aria-label={`Annuler la planification interne de « ${item.postTitle} »`}
                  >
                    {isScheduling ? "ANNULATION…" : "ANNULER LA PLANIFICATION"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel helper-panel editorial-calendar-observation">
        <p className="eyebrow">IDA OBSERVATION</p>
        <h2>
          {readyCount ? `${readyCount} approved move${readyCount > 1 ? "s" : ""} ready.` : "No approved move waiting."}
        </h2>
        <p>
          {scheduledCount
            ? `${scheduledCount} planification${scheduledCount > 1 ? "s" : ""} interne${scheduledCount > 1 ? "s" : ""} visible${scheduledCount > 1 ? "s" : ""} dans cette période.`
            : "Aucune planification interne active dans cette période."}
        </p>
        <span className="status-tag warning">NO EXTERNAL DELIVERY</span>
      </section>
    </div>
  );
}

type CampaignForm = {
  name: string;
  objective: string;
};

const emptyCampaignForm: CampaignForm = {
  name: "",
  objective: "",
};

function campaignStatusLabel(status: CampaignStatus): string {
  const labels: Record<CampaignStatus, string> = {
    DRAFT: "BROUILLON",
    ACTIVE: "ACTIVE",
    PAUSED: "EN PAUSE",
    COMPLETED: "TERMINÉE",
    ARCHIVED: "ARCHIVÉE",
  };

  return labels[status];
}

function formatCampaignDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function releaseOptionLabel(release: ReleaseRecord): string {
  return release.releaseDate ? `${release.title} · ${formatCampaignDate(release.releaseDate)}` : release.title;
}

function CampaignsView() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [source, setSource] = useState<"loading" | "api" | "unavailable">("loading");
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [releaseSource, setReleaseSource] = useState<"loading" | "api" | "unavailable">("loading");
  const [releaseNotice, setReleaseNotice] = useState("Chargement des releases disponibles…");
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CampaignForm>(emptyCampaignForm);
  const [notice, setNotice] = useState("Chargement des briefs de campagne IDA…");
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [isSaving, setIsSaving] = useState(false);
  const [activeReleaseCampaignId, setActiveReleaseCampaignId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    void fetchCampaigns()
      .then((items) => {
        if (!isCurrent) {
          return;
        }

        setCampaigns(items);
        setSource("api");
        setNotice(
          items.length
            ? `${items.length} brief${items.length > 1 ? "s" : ""} interne${items.length > 1 ? "s" : ""} chargé${items.length > 1 ? "s" : ""}.`
            : "Aucun brief de campagne n’est encore enregistré.",
        );
        setNoticeState("default");
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSource("unavailable");
        setNotice(`Les briefs de campagne ne peuvent pas être chargés : ${reason}`);
        setNoticeState("error");
      });

    void fetchReleases()
      .then((items) => {
        if (!isCurrent) {
          return;
        }

        setReleases(items);
        setReleaseSource("api");
        setReleaseNotice(
          items.length
            ? `${items.length} release${items.length > 1 ? "s" : ""} disponible${items.length > 1 ? "s" : ""} pour association.`
            : "Aucune release n’est disponible pour le moment.",
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setReleaseSource("unavailable");
        setReleaseNotice(`Les releases ne peuvent pas être chargées : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateField(field: keyof CampaignForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateSelectedRelease(campaignId: string, releaseId: string) {
    setSelectedReleaseIds((current) => ({ ...current, [campaignId]: releaseId }));
  }

  async function refreshCampaignAfterConflict(campaignId: string): Promise<void> {
    const currentCampaigns = await fetchCampaigns();

    setCampaigns(currentCampaigns);
    setSource("api");
    setSelectedReleaseIds((current) => {
      const next = { ...current };
      delete next[campaignId];
      return next;
    });
  }

  async function handleReleaseAssociation(campaign: CampaignRecord, releaseId: string | null) {
    if (activeReleaseCampaignId || source !== "api") {
      return;
    }

    if (releaseId !== null && releaseSource !== "api") {
      return;
    }

    if (releaseId === campaign.releaseId) {
      return;
    }

    setActiveReleaseCampaignId(campaign.id);

    try {
      const updatedCampaign = await updateCampaignRelease(campaign.id, {
        releaseId,
        expectedVersion: campaign.version,
      });
      setCampaigns((current) =>
        current.map((currentCampaign) =>
          currentCampaign.id === updatedCampaign.id ? updatedCampaign : currentCampaign,
        ),
      );
      setSelectedReleaseIds((current) => {
        const next = { ...current };
        delete next[campaign.id];
        return next;
      });
      setNotice(
        updatedCampaign.releaseId
          ? `« ${updatedCampaign.name} » est liée à « ${updatedCampaign.releaseTitle ?? "la release sélectionnée"} ».`
          : `« ${updatedCampaign.name} » n’est plus liée à une release.`,
      );
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";

      if (error instanceof IdaApiError && error.status === 409) {
        try {
          await refreshCampaignAfterConflict(campaign.id);
          setNotice("Cette campagne a changé entre-temps. Son état a été actualisé avant toute nouvelle action.");
        } catch (refreshError: unknown) {
          const refreshReason =
            refreshError instanceof IdaApiError ? refreshError.message : "IDA API est indisponible.";
          setNotice(`Le lien a changé, mais le brief ne peut pas être actualisé : ${refreshReason}`);
        }
      } else {
        setNotice(`Le lien de release n’a pas été enregistré : ${reason}`);
      }

      setNoticeState("error");
    } finally {
      setActiveReleaseCampaignId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    const objective = form.objective.trim();

    if (!name || !objective) {
      setNotice("Le nom et l’objectif sont nécessaires pour créer un brief de campagne.");
      setNoticeState("error");
      return;
    }

    const input: CampaignCreateInput = { name, objective };
    setIsSaving(true);

    try {
      const campaign = await createCampaign(input);
      setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      setSource("api");
      setForm(emptyCampaignForm);
      setNotice(`« ${campaign.name} » est enregistré comme brief interne en brouillon.`);
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setNotice(`Le brief n’a pas été enregistré : ${reason}`);
      setNoticeState("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-grid campaigns-view">
      <section className="panel wide-panel campaign-registry-card" aria-labelledby="campaign-registry-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CAMPAIGN BRIEFS</p>
            <h2 id="campaign-registry-title">Plan before pushing.</h2>
          </div>
          <span className="status-tag demo">INTERNAL ONLY</span>
        </div>
        <p className="campaign-registry-intro">
          Ces briefs organisent l’intention créative. Ils ne créent ni contenu, ni calendrier, ni tâche, ni action
          sociale.
        </p>
        <p className={`campaign-registry-notice ${noticeState}`} role="status">
          <span aria-hidden="true" />
          {notice}
        </p>
        <p className={`campaign-release-source ${releaseSource === "unavailable" ? "error" : ""}`} role="status">
          {releaseNotice}
        </p>

        {source === "loading" ? <p className="campaign-registry-empty">Chargement des briefs de campagne…</p> : null}
        {source === "unavailable" ? (
          <p className="campaign-registry-empty">La liste réapparaîtra lorsque l’API IDA sera disponible.</p>
        ) : null}
        {source === "api" && campaigns.length === 0 ? (
          <p className="campaign-registry-empty">Commence par poser l’objectif créatif de ta prochaine campagne.</p>
        ) : null}

        <div className="campaign-registry-list" aria-live="polite">
          {campaigns.map((campaign) => {
            const selectedReleaseId = selectedReleaseIds[campaign.id] ?? "";
            const compatibleReleases = releases.filter(
              (release) => release.artistProjectId === campaign.artistProjectId,
            );
            const isReleaseActionActive = activeReleaseCampaignId === campaign.id;
            const canLinkRelease =
              source === "api" &&
              releaseSource === "api" &&
              selectedReleaseId.length > 0 &&
              selectedReleaseId !== campaign.releaseId &&
              activeReleaseCampaignId === null;
            const canRemoveRelease =
              source === "api" && Boolean(campaign.releaseId) && activeReleaseCampaignId === null;

            return (
              <article className="campaign-brief" key={campaign.id} aria-busy={isReleaseActionActive}>
                <div className="campaign-brief-heading">
                  <div>
                    <p>BRIEF INTERNE · {formatCampaignDate(campaign.createdAt)}</p>
                    <h3>{campaign.name}</h3>
                  </div>
                  <span className={`campaign-status-tag ${campaign.status.toLocaleLowerCase("en-US")}`}>
                    {campaignStatusLabel(campaign.status)}
                  </span>
                </div>
                <p>{campaign.objective}</p>
                <section className="campaign-release-link" aria-label={`Release associée à ${campaign.name}`}>
                  <div className="campaign-release-current">
                    <span>RELEASE ACTUELLE</span>
                    <strong>{campaign.releaseTitle ?? "Aucune release liée."}</strong>
                  </div>
                  <label className="campaign-release-select">
                    <span>CHOISIR UNE RELEASE</span>
                    <select
                      value={selectedReleaseId}
                      onChange={(event) => updateSelectedRelease(campaign.id, event.target.value)}
                      disabled={releaseSource !== "api" || activeReleaseCampaignId !== null}
                    >
                      <option value="">Sélection locale uniquement</option>
                      {compatibleReleases.map((release) => (
                        <option key={release.id} value={release.id}>
                          {releaseOptionLabel(release)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="campaign-release-actions">
                    <p>Le lien n’est enregistré qu’après une action explicite.</p>
                    <div>
                      <button
                        className="campaign-release-button link"
                        type="button"
                        disabled={!canLinkRelease}
                        onClick={() => void handleReleaseAssociation(campaign, selectedReleaseId)}
                      >
                        {isReleaseActionActive ? "MISE À JOUR…" : "LIER"}
                      </button>
                      <button
                        className="campaign-release-button remove"
                        type="button"
                        disabled={!canRemoveRelease}
                        onClick={() => void handleReleaseAssociation(campaign, null)}
                      >
                        {isReleaseActionActive ? "MISE À JOUR…" : "RETIRER"}
                      </button>
                    </div>
                  </div>
                </section>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel campaign-create-card" aria-labelledby="campaign-create-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">NEW BRIEF</p>
            <h2 id="campaign-create-title">Start with intent.</h2>
          </div>
          <span className="quiet-label">DRAFT ONLY</span>
        </div>
        <p className="campaign-create-intro">
          IDA crée uniquement un brouillon local. Une release existante peut ensuite être liée séparément ; les dates,
          piliers et contenus restent hors de cette tranche.
        </p>
        <form className="campaign-create-form" noValidate onSubmit={handleSubmit}>
          <label className="campaign-create-field">
            <span>Nom</span>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Ex. Lumière Noire — préparation"
              maxLength={240}
              required
              disabled={isSaving || source !== "api"}
            />
          </label>
          <label className="campaign-create-field">
            <span>Objectif</span>
            <textarea
              value={form.objective}
              onChange={(event) => updateField("objective", event.target.value)}
              placeholder="Quelle intention la campagne doit-elle servir ?"
              maxLength={2000}
              rows={4}
              required
              disabled={isSaving || source !== "api"}
            />
          </label>
          <div className="campaign-create-actions">
            <p>Le workspace, le projet et l’état initial sont imposés côté serveur.</p>
            <button className="send-button" type="submit" disabled={isSaving || source !== "api"}>
              {isSaving ? "ENREGISTREMENT…" : "CREATE DRAFT"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>

      <section className="panel helper-panel campaign-boundary-card">
        <p className="eyebrow">NEXT BOUNDARY</p>
        <h2>Structure before automation.</h2>
        <p>
          Le Campaign Manager, les piliers et les recommandations IA restent désactivés tant que leurs contrats,
          permissions et validations ne sont pas définis.
        </p>
      </section>
    </div>
  );
}

function AnalyticsView() {
  const metrics = [
    ["Reach", "—", "API required"],
    ["Engagement", "—", "API required"],
    ["Freshness", "86", "local preview"],
  ] as const;

  return (
    <section className="panel wide-panel analytics-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ANALYTICS</p>
          <h2>Recommendations need evidence.</h2>
        </div>
        <span className="quiet-label">No synthetic performance data</span>
      </div>
      <div className="metrics-grid">
        {metrics.map(([label, value, detail]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{detail}</span>
          </article>
        ))}
      </div>
      <p className="panel-intro">
        Lorsque les adaptateurs sociaux seront disponibles, IDA expliquera les recommandations à partir de métriques
        synchronisées — sans modifier automatiquement ta stratégie.
      </p>
    </section>
  );
}

type TaskForm = {
  title: string;
  description: string;
  dueAt: string;
};

const emptyTaskForm: TaskForm = {
  title: "",
  description: "",
  dueAt: "",
};

function optionalTaskValue(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed || undefined;
}

function taskFormToInput(form: TaskForm): TaskCreateInput | undefined {
  const dueAtInput = optionalTaskValue(form.dueAt);

  if (!dueAtInput) {
    return {
      title: form.title.trim(),
      description: optionalTaskValue(form.description),
    };
  }

  const dueDate = new Date(dueAtInput);

  if (Number.isNaN(dueDate.valueOf())) {
    return undefined;
  }

  return {
    title: form.title.trim(),
    description: optionalTaskValue(form.description),
    dueAt: dueDate.toISOString(),
  };
}

function formatTaskDate(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return fallback;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function taskStatusLabel(status: TaskRecord["status"]): string {
  const labels: Record<TaskRecord["status"], string> = {
    TODO: "TODO",
    IN_PROGRESS: "IN PROGRESS",
    DONE: "DONE",
    CANCELLED: "CANCELLED",
  };

  return labels[status];
}

function isClosedTask(task: TaskRecord): boolean {
  return task.status === "DONE" || task.status === "CANCELLED";
}

function TasksView() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [form, setForm] = useState<TaskForm>(emptyTaskForm);
  const [source, setSource] = useState<"loading" | "api" | "unavailable">(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState(
    isApiConfigured ? "Chargement des tâches de ton workspace…" : "Les tâches nécessitent la connexion à IDA API.",
  );
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [isCreating, setIsCreating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchTasks()
      .then((nextTasks) => {
        if (!isCurrent) {
          return;
        }

        setTasks(nextTasks);
        setSource("api");
        setNotice("Tâches synchronisées depuis ton workspace IDA.");
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSource("unavailable");
        setNotice(`Les tâches sont indisponibles : ${reason}`);
        setNoticeState("error");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateField(field: keyof TaskForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    const input = taskFormToInput(form);

    if (!title) {
      setNotice("Un titre est nécessaire pour créer une tâche.");
      setNoticeState("error");
      return;
    }

    if (!input) {
      setNotice("L’échéance doit être une date et une heure valides.");
      setNoticeState("error");
      return;
    }

    setIsCreating(true);

    try {
      const created = await createTask(input);
      setTasks((current) => [created, ...current]);
      setForm(emptyTaskForm);
      setSource("api");
      setNotice(`« ${created.title} » a été ajoutée à ta liste ouverte.`);
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setNotice(`La tâche n’a pas été créée : ${reason}`);
      setNoticeState("error");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleComplete(task: TaskRecord) {
    if (isClosedTask(task) || activeTaskId) {
      return;
    }

    setActiveTaskId(task.id);

    try {
      const completed = await completeTask(task.id);
      setTasks((current) => current.map((candidate) => (candidate.id === completed.id ? completed : candidate)));
      setSource("api");
      setNotice(`« ${completed.title} » est terminée.`);
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";

      if (error instanceof IdaApiError && error.status === 409) {
        try {
          const nextTasks = await fetchTasks();
          setTasks(nextTasks);
          setSource("api");
          setNotice("Cette tâche a déjà été clôturée. La liste a été actualisée.");
        } catch (refreshError: unknown) {
          const refreshReason =
            refreshError instanceof IdaApiError ? refreshError.message : "IDA API est indisponible.";
          setNotice(`La tâche a déjà changé d’état, mais la liste n’a pas pu être actualisée : ${refreshReason}`);
        }
      } else {
        setNotice(`La tâche n’a pas été terminée : ${reason}`);
      }

      setNoticeState("error");
    } finally {
      setActiveTaskId(null);
    }
  }

  const openTasks = tasks.filter((task) => !isClosedTask(task));
  const completedTasks = tasks.filter((task) => isClosedTask(task));
  const canManage = source === "api" && !isCreating && !activeTaskId;

  return (
    <>
      <div className="page-grid tasks-view">
        <section className="panel task-card" aria-labelledby="open-tasks-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TASKS</p>
              <h2 id="open-tasks-title">What moves forward.</h2>
            </div>
            <span className="quiet-label">{source === "api" ? "Workspace data" : "API required"}</span>
          </div>
          <p className={`task-notice ${noticeState}`} role="status">
            <span aria-hidden="true" />
            {notice}
          </p>
          {source === "loading" ? <p className="task-empty-state">Chargement des tâches ouvertes…</p> : null}
          {source === "api" && openTasks.length === 0 ? (
            <p className="task-empty-state">Aucune tâche ouverte. Tu peux créer le prochain mouvement utile.</p>
          ) : null}
          <ol className="task-list task-open-list">
            {openTasks.map((task, index) => {
              const isActive = activeTaskId === task.id;

              return (
                <li className="task-item" key={task.id}>
                  <span className="task-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="task-copy">
                    <div className="task-title-line">
                      <h3>{task.title}</h3>
                      <span className={`task-status-tag ${task.status.toLocaleLowerCase("en-US")}`}>
                        {taskStatusLabel(task.status)}
                      </span>
                    </div>
                    {task.description ? <p>{task.description}</p> : null}
                    <time dateTime={task.dueAt}>{formatTaskDate(task.dueAt, "Sans échéance")}</time>
                  </div>
                  <button
                    className="task-complete-button"
                    type="button"
                    onClick={() => void handleComplete(task)}
                    disabled={!canManage}
                    aria-label={`Marquer « ${task.title} » comme terminée`}
                  >
                    {isActive ? "COMPLETING…" : "COMPLETE"}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="panel task-create-card" aria-labelledby="task-create-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NEW TASK</p>
              <h2 id="task-create-title">Make it explicit.</h2>
            </div>
            <span className="status-tag demo">NO AUTOMATION</span>
          </div>
          <p className="task-create-intro">
            Crée une tâche interne. Une échéance organise le contexte ; elle ne programme ni notification ni action.
          </p>
          <form className="task-create-form" noValidate onSubmit={handleCreate}>
            <label className="task-create-field">
              <span>Titre</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Ex. Relire les captions de la semaine"
                maxLength={240}
                required
                disabled={!canManage}
              />
            </label>
            <label className="task-create-field">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Contexte facultatif…"
                rows={3}
                maxLength={4000}
                disabled={!canManage}
              />
            </label>
            <label className="task-create-field">
              <span>Échéance</span>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) => updateField("dueAt", event.target.value)}
                disabled={!canManage}
              />
            </label>
            <div className="task-create-actions">
              <p>La tâche est créée dans ton workspace actuel, jamais dans un calendrier externe.</p>
              <button className="send-button" type="submit" disabled={!canManage}>
                {isCreating ? "Création…" : "Create task"}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="panel wide-panel task-completed-card" aria-labelledby="completed-tasks-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">COMPLETED</p>
            <h2 id="completed-tasks-title">Closed with intent.</h2>
          </div>
          <span className="quiet-label">{completedTasks.length} closed</span>
        </div>
        {source === "api" && completedTasks.length === 0 ? (
          <p className="task-empty-state">Les tâches terminées apparaîtront ici.</p>
        ) : null}
        <div className="task-completed-list">
          {completedTasks.map((task) => (
            <article className="task-completed-item" key={task.id}>
              <span className={`task-status-tag ${task.status.toLocaleLowerCase("en-US")}`}>
                {taskStatusLabel(task.status)}
              </span>
              <div>
                <h3>{task.title}</h3>
                {task.description ? <p>{task.description}</p> : null}
                <time dateTime={task.completedAt ?? task.dueAt}>
                  {formatTaskDate(task.completedAt ?? task.dueAt, "Clôturée sans date")}
                </time>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

type ArtistBrainForm = {
  identity: string;
  genres: string;
  influences: string;
  tone: string;
  preferredVocabulary: string;
  forbiddenVocabulary: string;
  goals: string;
  audience: string;
};

function listToText(values: string[]): string {
  return values.join(", ");
}

function textToList(value: string): string[] {
  const unique = new Map<string, string>();

  for (const item of value.split(/[\n,]/u)) {
    const trimmed = item.trim();
    const key = trimmed.toLocaleLowerCase("fr-FR");

    if (trimmed && !unique.has(key)) {
      unique.set(key, trimmed);
    }
  }

  return [...unique.values()];
}

function artistBrainToForm(profile: ArtistBrain): ArtistBrainForm {
  return {
    identity: profile.identity,
    genres: listToText(profile.genres),
    influences: listToText(profile.influences),
    tone: profile.tone,
    preferredVocabulary: listToText(profile.preferredVocabulary),
    forbiddenVocabulary: listToText(profile.forbiddenVocabulary),
    goals: listToText(profile.goals),
    audience: profile.audience,
  };
}

function formToArtistBrain(form: ArtistBrainForm, current: ArtistBrain): ArtistBrain {
  return {
    identity: form.identity.trim(),
    genres: textToList(form.genres),
    influences: textToList(form.influences),
    tone: form.tone.trim(),
    preferredVocabulary: textToList(form.preferredVocabulary),
    forbiddenVocabulary: textToList(form.forbiddenVocabulary),
    goals: textToList(form.goals),
    audience: form.audience.trim(),
    platformPreferences: current.platformPreferences,
  };
}

function memoryCategoryLabel(category: MemoryRecord["category"]): string {
  const labels: Record<MemoryRecord["category"], string> = {
    ARTIST_MEMORY: "Artist memory",
    CONTENT_MEMORY: "Content memory",
    CAMPAIGN_MEMORY: "Campaign memory",
    SOCIAL_MEMORY: "Social memory",
    PREFERENCE_MEMORY: "Preference",
    SYSTEM_MEMORY: "System memory",
  };

  return labels[category];
}

function memoryStateLabel(state: MemoryRecord["state"]): string {
  const labels: Record<MemoryRecord["state"], string> = {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    REJECTED: "REJECTED",
  };

  return labels[state];
}

function formatMemoryDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "Date indisponible";
  }

  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

function MemoryConsentCenter() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [proposal, setProposal] = useState("");
  const [source, setSource] = useState<"loading" | "api" | "unavailable">(isApiConfigured ? "loading" : "unavailable");
  const [notice, setNotice] = useState(
    isApiConfigured
      ? "Chargement des propositions de mémoire…"
      : "Les propositions de mémoire nécessitent la connexion à IDA API.",
  );
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const [isProposing, setIsProposing] = useState(false);
  const [activeMemoryId, setActiveMemoryId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchMemories()
      .then((nextMemories) => {
        if (!isCurrent) {
          return;
        }

        setMemories(nextMemories);
        setSource("api");
        setNotice("Aucune préférence n’est enregistrée tant que tu ne l’as pas explicitement confirmée.");
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSource("unavailable");
        setNotice(`La mémoire consentie est indisponible : ${reason}`);
        setNoticeState("error");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handleProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = proposal.trim();

    if (!content) {
      setNotice("Écris une préférence avant de la proposer à IDA.");
      setNoticeState("error");
      return;
    }

    setIsProposing(true);

    try {
      const memory = await proposePreferenceMemory(content);
      setMemories((current) => [memory, ...current]);
      setProposal("");
      setSource("api");
      setNotice("Proposition ajoutée. Elle reste PENDING et ne sera pas utilisée avant ton approbation.");
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setNotice(`La préférence n’a pas été proposée : ${reason}`);
      setNoticeState("error");
    } finally {
      setIsProposing(false);
    }
  }

  async function handleMemoryAction(memory: MemoryRecord, action: "confirm" | "reject") {
    if (memory.state !== "PENDING" || activeMemoryId) {
      return;
    }

    setActiveMemoryId(memory.id);

    try {
      const updated = action === "confirm" ? await confirmMemory(memory.id) : await rejectMemory(memory.id);
      setMemories((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      setSource("api");
      setNotice(
        action === "confirm"
          ? "Préférence confirmée. IDA pourra désormais l’utiliser dans les contextes autorisés."
          : "Proposition refusée. IDA ne l’enregistrera pas comme préférence durable.",
      );
      setNoticeState("success");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";

      if (error instanceof IdaApiError && error.status === 409) {
        try {
          const nextMemories = await fetchMemories();
          setMemories(nextMemories);
          setSource("api");
          setNotice("Cette proposition a déjà été traitée. La file a été actualisée.");
        } catch (refreshError: unknown) {
          const refreshReason =
            refreshError instanceof IdaApiError ? refreshError.message : "IDA API est indisponible.";
          setNotice(
            `Cette proposition a déjà changé d’état, mais la file n’a pas pu être actualisée : ${refreshReason}`,
          );
        }
      } else {
        setNotice(`La proposition n’a pas été mise à jour : ${reason}`);
      }

      setNoticeState("error");
    } finally {
      setActiveMemoryId(null);
    }
  }

  const pendingMemories = memories.filter((memory) => memory.state === "PENDING");
  const reviewedMemories = memories.filter((memory) => memory.state !== "PENDING");
  const confirmedCount = memories.filter((memory) => memory.state === "CONFIRMED").length;
  const rejectedCount = memories.filter((memory) => memory.state === "REJECTED").length;
  const canManage = source === "api" && !isProposing && !activeMemoryId;

  return (
    <section className="panel wide-panel memory-consent-card" aria-labelledby="memory-consent-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">MEMORY CONSENT CENTER</p>
          <h2 id="memory-consent-title">You decide what stays.</h2>
        </div>
        <span className="status-tag approval">EXPLICIT CONSENT</span>
      </div>
      <p className="memory-consent-intro">
        Propose une préférence à IDA, puis confirme-la ou refuse-la. Une conversation ne devient jamais une mémoire
        durable automatiquement.
      </p>
      <p className={`memory-consent-notice ${noticeState}`} role="status">
        <span aria-hidden="true" />
        {notice}
      </p>

      <form className="memory-proposal-form" noValidate onSubmit={handleProposal}>
        <label className="memory-proposal-field" htmlFor="memory-preference-proposal">
          <span>Nouvelle préférence</span>
          <textarea
            id="memory-preference-proposal"
            value={proposal}
            onChange={(event) => setProposal(event.target.value)}
            placeholder="Ex. Je préfère les captions courtes, directes et sans hashtags excessifs."
            rows={3}
            maxLength={4000}
            disabled={!canManage}
          />
        </label>
        <div className="memory-proposal-actions">
          <p>IDA la place d’abord dans la file PENDING : aucune préférence confirmée n’est créée à cette étape.</p>
          <button className="send-button" type="submit" disabled={!canManage}>
            {isProposing ? "Proposition…" : "Propose to IDA"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>

      <div className="memory-consent-divider" />

      <div className="memory-consent-section-heading">
        <div>
          <p className="eyebrow">PENDING PROPOSALS</p>
          <h3>{pendingMemories.length ? `${pendingMemories.length} à décider` : "Nothing waiting."}</h3>
        </div>
        <span className="quiet-label">Human decision required</span>
      </div>

      {source === "loading" ? <p className="memory-empty-state">Chargement des propositions…</p> : null}
      {source === "api" && pendingMemories.length === 0 ? (
        <p className="memory-empty-state">Aucune proposition en attente. Tu gardes le contrôle.</p>
      ) : null}
      <div className="memory-pending-list">
        {pendingMemories.map((memory) => {
          const isActive = activeMemoryId === memory.id;

          return (
            <article className="memory-pending-item" key={memory.id}>
              <div className="memory-pending-copy">
                <div className="memory-pending-meta">
                  <span>{memoryCategoryLabel(memory.category)}</span>
                  <span>·</span>
                  <time dateTime={memory.createdAt}>{formatMemoryDate(memory.createdAt)}</time>
                </div>
                <p>{memory.content}</p>
              </div>
              <div className="memory-pending-actions">
                <button
                  className="memory-action-button approve"
                  type="button"
                  onClick={() => void handleMemoryAction(memory, "confirm")}
                  disabled={!canManage}
                >
                  {isActive ? "Updating…" : "APPROVE"}
                </button>
                <button
                  className="memory-action-button reject"
                  type="button"
                  onClick={() => void handleMemoryAction(memory, "reject")}
                  disabled={!canManage}
                >
                  {isActive ? "Updating…" : "REJECT"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="memory-review-summary">
        <div className="memory-review-counts">
          <span>{confirmedCount} confirmed</span>
          <span>{rejectedCount} rejected</span>
        </div>
        {reviewedMemories.length > 0 ? (
          <div className="memory-reviewed-list">
            {reviewedMemories.slice(0, 3).map((memory) => (
              <article key={memory.id}>
                <span className={`memory-state-tag ${memory.state.toLocaleLowerCase("en-US")}`}>
                  {memoryStateLabel(memory.state)}
                </span>
                <p>{memory.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="memory-reviewed-empty">Les décisions confirmées ou refusées apparaîtront ici.</p>
        )}
      </div>
    </section>
  );
}

function MemoryView() {
  const [profile, setProfile] = useState<ArtistBrain>(localArtistBrain);
  const [form, setForm] = useState<ArtistBrainForm>(() => artistBrainToForm(localArtistBrain));
  const [source, setSource] = useState<"loading" | "api" | "local">(isApiConfigured ? "loading" : "local");
  const [notice, setNotice] = useState(
    isApiConfigured ? "Chargement de ton Artist Brain…" : "Aperçu local : API IDA indisponible.",
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchArtistBrain()
      .then((nextProfile) => {
        if (!isCurrent) {
          return;
        }

        setProfile(nextProfile);
        setForm(artistBrainToForm(nextProfile));
        setSource("api");
        setNotice("Artist Brain synchronisé depuis ton workspace IDA.");
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setSource("local");
        setNotice(`Aperçu local : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateField(field: keyof ArtistBrainForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = formToArtistBrain(form, profile);

    if (!nextProfile.identity || !nextProfile.tone || !nextProfile.audience) {
      setNotice("Identité, ton et audience sont nécessaires pour enregistrer ton Artist Brain.");
      return;
    }

    setIsSaving(true);

    try {
      const savedProfile = await updateArtistBrain(nextProfile);
      setProfile(savedProfile);
      setForm(artistBrainToForm(savedProfile));
      setSource("api");
      setNotice("Artist Brain mis à jour. IDA utilisera cette base pour ses futures propositions.");
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setNotice(`Aucune modification n’a été enregistrée : ${reason}`);
    } finally {
      setIsSaving(false);
    }
  }

  const summaryCards = [
    ["Tone", profile.tone],
    ["Genres", profile.genres.join(" · ") || "À préciser"],
    ["Audience", profile.audience],
  ] as const;

  return (
    <>
      <section className="panel wide-panel memory-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ARTIST BRAIN</p>
            <h2>Memory under your control.</h2>
          </div>
          <span className="quiet-label">{source === "api" ? "Editable workspace data" : "Local preview"}</span>
        </div>
        <p className={`data-source-notice ${source}`} role="status">
          <span aria-hidden="true" />
          {notice}
        </p>
        <div className="memory-grid artist-brain-summary">
          {summaryCards.map(([label, value]) => (
            <article key={label}>
              <p>{label}</p>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <form className="artist-brain-form" onSubmit={handleSubmit}>
          <div className="artist-brain-fields">
            <label className="artist-brain-field artist-brain-field-wide">
              <span>Identité artistique</span>
              <textarea
                value={form.identity}
                onChange={(event) => updateField("identity", event.target.value)}
                rows={3}
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field">
              <span>Ton</span>
              <input
                value={form.tone}
                onChange={(event) => updateField("tone", event.target.value)}
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field">
              <span>Genres</span>
              <input
                value={form.genres}
                onChange={(event) => updateField("genres", event.target.value)}
                placeholder="Melodic techno, progressive house…"
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field artist-brain-field-wide">
              <span>Audience</span>
              <textarea
                value={form.audience}
                onChange={(event) => updateField("audience", event.target.value)}
                rows={2}
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field">
              <span>Influences</span>
              <input
                value={form.influences}
                onChange={(event) => updateField("influences", event.target.value)}
                placeholder="Sépare chaque influence par une virgule"
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field">
              <span>Objectifs</span>
              <input
                value={form.goals}
                onChange={(event) => updateField("goals", event.target.value)}
                placeholder="Sépare chaque objectif par une virgule"
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field">
              <span>Vocabulaire préféré</span>
              <input
                value={form.preferredVocabulary}
                onChange={(event) => updateField("preferredVocabulary", event.target.value)}
                placeholder="nocturne, texture…"
                disabled={isSaving}
              />
            </label>
            <label className="artist-brain-field">
              <span>Vocabulaire à éviter</span>
              <input
                value={form.forbiddenVocabulary}
                onChange={(event) => updateField("forbiddenVocabulary", event.target.value)}
                placeholder="banger, vibes…"
                disabled={isSaving}
              />
            </label>
          </div>
          <div className="artist-brain-actions">
            <p>
              Les changements restent internes à IDA. Ils ne créent aucune publication ni mémoire conversationnelle
              implicite.
            </p>
            <button className="send-button" type="submit" disabled={isSaving}>
              {isSaving ? "Enregistrement…" : "Save Artist Brain"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>
      <MemoryConsentCenter />
    </>
  );
}

function SystemView({ dashboard, source }: { dashboard: DashboardSnapshot; source: DashboardSource }) {
  return (
    <div className="page-grid system-view">
      <SystemPanel services={dashboard.systemServices} source={source} />
      <ActivityTimeline />
    </div>
  );
}

function IdaView({ messages }: { messages: ConversationMessage[] }) {
  return (
    <div className="page-grid ida-view">
      <ConversationPanel messages={messages} limit={24} contextLabel="Historique privé" />
      <section className="panel helper-panel">
        <p className="eyebrow">COMMAND POLICY</p>
        <h2>Every action has a boundary.</h2>
        <p>
          IDA peut chercher, proposer et organiser. Les actions externes attendront toujours les permissions et
          validations prévues.
        </p>
        <span className="status-tag approval">HUMAN APPROVAL</span>
      </section>
    </div>
  );
}

function HomeView({
  messages,
  dashboard,
  source,
  onOpenCalendar,
}: {
  messages: ConversationMessage[];
  dashboard: DashboardSnapshot;
  source: DashboardSource;
  onOpenCalendar: () => void;
}) {
  return (
    <>
      <PriorityGrid summary={dashboard.summary} source={source} />
      <div className="home-grid">
        <CalendarPanel onOpenCalendar={onOpenCalendar} />
        <ConversationPanel messages={messages} />
      </div>
      <div className="home-grid lower-grid">
        <TrackPanel items={dashboard.tracks} source={source} />
        <SystemPanel services={dashboard.systemServices} compact source={source} />
      </div>
      <section className="panel wide-panel media-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CONTENT LIBRARY</p>
            <h2>Media waiting for a moment.</h2>
          </div>
          <span className="quiet-label">{source === "api" ? "API data" : "Local preview"}</span>
        </div>
        <MediaGrid assets={dashboard.mediaAssets} />
      </section>
    </>
  );
}

function SectionContent({
  activeId,
  messages,
  dashboard,
  source,
  onTrackCreated,
  onMediaAssetCreated,
  onNavigate,
}: {
  activeId: NavigationId;
  messages: ConversationMessage[];
  dashboard: DashboardSnapshot;
  source: DashboardSource;
  onTrackCreated: (track: Track) => void;
  onMediaAssetCreated: (asset: MediaAsset) => void;
  onNavigate: (id: NavigationId) => void;
}) {
  switch (activeId) {
    case "ida":
      return <IdaView messages={messages} />;
    case "music":
      return <MusicView dashboard={dashboard} source={source} onTrackCreated={onTrackCreated} />;
    case "content":
      return <ContentView onMediaAssetCreated={onMediaAssetCreated} />;
    case "social":
      return <SocialView dashboard={dashboard} source={source} />;
    case "calendar":
      return <CalendarView />;
    case "campaigns":
      return <CampaignsView />;
    case "analytics":
      return <AnalyticsView />;
    case "tasks":
      return <TasksView />;
    case "memory":
      return <MemoryView />;
    case "system":
      return <SystemView dashboard={dashboard} source={source} />;
    case "home":
      return (
        <HomeView
          messages={messages}
          dashboard={dashboard}
          source={source}
          onOpenCalendar={() => onNavigate("calendar")}
        />
      );
  }
}

function App() {
  const [activeId, setActiveId] = useState<NavigationId>("home");
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiMode, setApiMode] = useState<"connected" | "fallback">(isApiConfigured ? "connected" : "fallback");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(localDashboard);
  const [dashboardSource, setDashboardSource] = useState<DashboardSource>(isApiConfigured ? "loading" : "local");
  const [dashboardNotice, setDashboardNotice] = useState(
    isApiConfigured ? "Synchronisation des données IDA…" : "Aperçu local : VITE_IDA_API_URL n’est pas configurée.",
  );

  const section = sectionCopy[activeId];
  const moreItems = useMemo(() => navigation.filter((item) => !mobilePrimaryNavigation.includes(item.id)), []);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    void fetchDashboardSnapshot()
      .then((snapshot) => {
        if (!isCurrent) {
          return;
        }

        setDashboard(snapshot);
        setDashboardSource("api");
        setDashboardNotice("Données API synchronisées : résumé, système, tracks et médias.");
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
        setDashboard(localDashboard);
        setDashboardSource("local");
        setDashboardNotice(`Aperçu local : ${reason}`);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    if (!isApiConfigured) {
      return () => {
        isCurrent = false;
      };
    }

    // Les commandes terminées sont restaurées séparément des données du
    // dashboard : un échec de cette lecture ne doit pas masquer le hub ni
    // transformer l'historique local en mémoire persistante.
    void fetchIdaCommandRuns({ limit: 12 })
      .then((page) => {
        if (!isCurrent || page.items.length === 0) {
          return;
        }

        const restoredMessages = commandRunsToMessages(page.items);
        setMessages((current) => (current.every((message) => message.id === "welcome") ? restoredMessages : current));
      })
      .catch(() => {
        // Une API antérieure ou indisponible conserve simplement l'accueil
        // éphémère. Aucun message n'est inventé ni envoyé en mode fallback.
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function navigateTo(id: NavigationId) {
    setActiveId(id);
    setIsMoreOpen(false);
  }

  function handleTrackCreated(track: Track) {
    setDashboard((current) => ({
      ...current,
      tracks: [track, ...current.tracks],
    }));
    setDashboardSource("api");
    setDashboardNotice(`Catalogue synchronisé : « ${track.title} » a été ajouté au Music Brain.`);
  }

  function handleMediaAssetCreated(asset: MediaAsset) {
    setDashboard((current) => ({
      ...current,
      mediaAssets: [asset, ...current.mediaAssets],
    }));
    setDashboardSource("api");
    setDashboardNotice(`Bibliothèque synchronisée : « ${asset.filename} » a été ajouté à la Content Library.`);
  }

  async function handleCommand(command: string) {
    const userMessageId = `user-${Date.now()}`;
    const pendingMessageId = `assistant-${Date.now()}`;

    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", content: command, meta: "You" },
      {
        id: pendingMessageId,
        role: "assistant",
        content: "Je prépare une réponse avec le contexte autorisé…",
        meta: "IDA · processing",
        pending: true,
      },
    ]);
    setIsSubmitting(true);

    try {
      const result = await submitIdaCommand(command);
      setApiMode("connected");
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingMessageId
            ? {
                ...message,
                content: result.message,
                meta: result.commandRunId
                  ? `IDA · ${result.state ?? "received"} · ${result.commandRunId}`
                  : `IDA · ${result.state ?? "completed"}`,
                pending: false,
              }
            : message,
        ),
      );
    } catch (error: unknown) {
      const reason = error instanceof IdaApiError ? error.message : "IDA API est indisponible.";
      setApiMode("fallback");
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingMessageId
            ? {
                ...message,
                content: getLocalIdaResponse(command),
                meta: `Mode local · ${reason}`,
                fallback: true,
                pending: false,
              }
            : message,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">
            ◒
          </span>
          <span>IDA</span>
        </div>
        <div className="workspace-chip">
          <span className="workspace-avatar" aria-hidden="true">
            A
          </span>
          <div>
            <strong>Artist workspace</strong>
            <small>Personal command center</small>
          </div>
        </div>
        <NavigationControl activeId={activeId} onNavigate={navigateTo} />
        <div className="sidebar-footer">
          <span className={`status-dot ${apiMode === "connected" ? "online" : "warning"}`} aria-hidden="true" />
          <div>
            <strong>{apiMode === "connected" ? "IDA online" : "Local preview"}</strong>
            <small>{apiMode === "connected" ? "API command channel ready" : "Configure VITE_IDA_API_URL"}</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{section.eyebrow}</p>
            <h1>{section.title}</h1>
            <p className="page-description">{section.description}</p>
          </div>
          <div className="topbar-actions">
            <span
              className="date-pill"
              title={dashboard.summary ? `Date du workspace · ${dashboard.summary.timezone}` : undefined}
            >
              {formatDashboardDate(dashboard.summary, dashboardSource)}
            </span>
            <button className="profile-button" type="button" aria-label="Ouvrir le profil">
              A
            </button>
          </div>
        </header>

        <CommandComposer onSubmit={handleCommand} isSubmitting={isSubmitting} apiMode={apiMode} />

        <p className={`data-source-notice ${dashboardSource}`} role="status">
          <span aria-hidden="true" />
          {dashboardNotice}
        </p>

        <div className="content-area">
          <SectionContent
            activeId={activeId}
            messages={messages}
            dashboard={dashboard}
            source={dashboardSource}
            onTrackCreated={handleTrackCreated}
            onMediaAssetCreated={handleMediaAssetCreated}
            onNavigate={navigateTo}
          />
        </div>
      </main>

      <div className="mobile-bottom-bar">
        <NavigationControl activeId={activeId} onNavigate={navigateTo} compact />
        <button
          className={`navigation-item more-button ${isMoreOpen ? "is-active" : ""}`}
          type="button"
          onClick={() => setIsMoreOpen((open) => !open)}
          aria-expanded={isMoreOpen}
          aria-controls="mobile-more-menu"
        >
          <span aria-hidden="true" className="navigation-glyph">
            •••
          </span>
          <span>MORE</span>
        </button>
      </div>

      {isMoreOpen ? (
        <div className="mobile-more-backdrop">
          <button
            aria-label="Fermer les autres sections"
            className="mobile-more-dismiss"
            onClick={() => setIsMoreOpen(false)}
            type="button"
          />
          <section className="mobile-more-sheet" id="mobile-more-menu" aria-label="Autres sections">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-heading">
              <p className="eyebrow">MORE</p>
              <h2>More of IDA.</h2>
            </div>
            <div className="more-navigation">
              {moreItems.map((item) => (
                <button
                  className={activeId === item.id ? "is-active" : ""}
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                >
                  <span aria-hidden="true">{item.glyph}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
