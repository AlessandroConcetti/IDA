import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createTrack,
  type DashboardSnapshot,
  fetchArtistBrain,
  fetchDashboardSnapshot,
  IdaApiError,
  isApiConfigured,
  submitIdaCommand,
  type TrackCreateInput,
  updateArtistBrain,
  uploadMediaAsset,
} from "./api";
import {
  type ArtistBrain,
  calendarItems,
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
  socialCapabilities,
  type Track,
  todayPriorities,
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

function ConversationPanel({ messages }: { messages: ConversationMessage[] }) {
  const latest = messages.slice(-3);

  return (
    <section className="panel conversation-panel" aria-labelledby="conversation-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LIVE CONTEXT</p>
          <h2 id="conversation-title">Conversation</h2>
        </div>
        <span className="quiet-label">Dernières réponses</span>
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

function PriorityGrid() {
  return (
    <section className="priority-grid" aria-label="Priorités du jour">
      {todayPriorities.map((priority) => (
        <article className={`priority-card accent-${priority.accent}`} key={priority.label}>
          <p>{priority.label}</p>
          <strong>{priority.value}</strong>
          <span>{priority.detail}</span>
        </article>
      ))}
    </section>
  );
}

function CalendarPanel() {
  return (
    <section className="panel calendar-panel" aria-labelledby="today-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TODAY</p>
          <h2 id="today-title">A calm schedule.</h2>
        </div>
        <button className="text-button" type="button">
          Open calendar <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="schedule-list">
        {calendarItems.map((item) => (
          <article className="schedule-item" key={`${item.time}-${item.title}`}>
            <time>{item.time}</time>
            <div>
              <h3>{item.title}</h3>
              <p>{item.platform}</p>
            </div>
            <span className={`status-tag ${item.status.toLocaleLowerCase("en-US")}`}>{item.status}</span>
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

function MediaGrid({ assets }: { assets: MediaAsset[] }) {
  return (
    <section className="media-grid" aria-label="Médias récents">
      {assets.map((asset) => (
        <article className="media-card" key={asset.id ?? asset.filename}>
          <div className={`media-thumbnail ${asset.tone}`} aria-hidden="true">
            <span>
              {asset.kind === "VIDEO" ? "▶" : asset.kind === "AUDIO" ? "♫" : asset.kind === "IMAGE" ? "◇" : "◫"}
            </span>
          </div>
          <div className="media-copy">
            <div className="media-title-line">
              <h3>{asset.filename}</h3>
              <span className={`status-tag ${asset.status.toLocaleLowerCase("en-US")}`}>{asset.status}</span>
            </div>
            <p>{asset.detail}</p>
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

function SocialView({ dashboard, source }: { dashboard: DashboardSnapshot; source: DashboardSource }) {
  return (
    <div className="page-grid social-grid">
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ADAPTER MATRIX</p>
            <h2>Real capabilities, no assumptions.</h2>
          </div>
          <span className="quiet-label">Phase 3</span>
        </div>
        <p className="panel-intro">
          Les connexions OAuth, la publication et les analytics seront activés plateforme par plateforme, uniquement
          après validation de leurs capacités officielles.
        </p>
        <div className="social-list">
          {socialCapabilities.map((platform) => (
            <article className="social-card" key={platform.name}>
              <div className="social-card-heading">
                <div>
                  <p className="social-platform">{platform.name}</p>
                  <p>{platform.detail}</p>
                </div>
                <span className={`status-tag ${platform.state.toLocaleLowerCase("en-US")}`}>
                  {platform.state.replace("_", " ")}
                </span>
              </div>
              <ul>
                {platform.capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
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
    </div>
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

function displayFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ContentView({
  dashboard,
  onMediaAssetCreated,
}: {
  dashboard: DashboardSnapshot;
  onMediaAssetCreated: (asset: MediaAsset) => void;
}) {
  const [form, setForm] = useState<MediaUploadForm>(emptyMediaUploadForm);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("Un fichier à la fois, stocké dans la bibliothèque privée IDA.");
  const [noticeState, setNoticeState] = useState<"default" | "success" | "error">("default");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CONTENT LIBRARY</p>
            <h2>Unused, visible, useful.</h2>
          </div>
          <span className="quiet-label">Hash & freshness planned</span>
        </div>
        <MediaGrid assets={dashboard.mediaAssets} />
      </section>
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
      <section className="panel freshness-card">
        <p className="eyebrow">FRESHNESS</p>
        <strong>86</strong>
        <h2>Healthy rotation.</h2>
        <p>Les scores deviendront factuels une fois les usages synchronisés avec l’API.</p>
      </section>
    </div>
  );
}

function CalendarView() {
  return (
    <div className="page-grid calendar-view">
      <CalendarPanel />
      <section className="panel helper-panel">
        <p className="eyebrow">IDA OBSERVATION</p>
        <h2>No overload detected.</h2>
        <p>Les conflits, répétitions et trop fortes cadences apparaîtront ici avant validation d’un plan éditorial.</p>
        <span className="status-tag scheduled">3 ITEMS TODAY</span>
      </section>
    </div>
  );
}

function CampaignsView() {
  return (
    <div className="page-grid campaigns-view">
      <section className="panel campaign-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ACTIVE CAMPAIGN</p>
            <h2>Next release</h2>
          </div>
          <span className="status-tag scheduled">IN PREP</span>
        </div>
        <p className="campaign-objective">
          Build anticipation through a studio hook, an artwork moment and a release reminder.
        </p>
        <div className="campaign-pillars">
          <span>Teaser</span>
          <span>Studio</span>
          <span>Artwork</span>
          <span>Release</span>
        </div>
      </section>
      <section className="panel helper-panel">
        <p className="eyebrow">CAMPAIGN MANAGER</p>
        <h2>Plan before pushing.</h2>
        <p>IDA pourra proposer les piliers et leurs contenus ; la stratégie restera validée par toi.</p>
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

function TasksView() {
  const tasks = ["Valider trois propositions", "Finaliser les piliers de campagne", "Tagger les rushes studio"];

  return (
    <section className="panel wide-panel task-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TODAY'S FOCUS</p>
          <h2>Three meaningful moves.</h2>
        </div>
        <span className="quiet-label">Local preview</span>
      </div>
      <ol className="task-list">
        {tasks.map((task, index) => (
          <li key={task}>
            <span>0{index + 1}</span>
            {task}
            <button type="button" aria-label={`Marquer « ${task} » comme terminé`}>
              ○
            </button>
          </li>
        ))}
      </ol>
    </section>
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
  );
}

function SystemView({ dashboard, source }: { dashboard: DashboardSnapshot; source: DashboardSource }) {
  return <SystemPanel services={dashboard.systemServices} source={source} />;
}

function IdaView({ messages }: { messages: ConversationMessage[] }) {
  return (
    <div className="page-grid ida-view">
      <ConversationPanel messages={messages} />
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
}: {
  messages: ConversationMessage[];
  dashboard: DashboardSnapshot;
  source: DashboardSource;
}) {
  return (
    <>
      <PriorityGrid />
      <div className="home-grid">
        <CalendarPanel />
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
}: {
  activeId: NavigationId;
  messages: ConversationMessage[];
  dashboard: DashboardSnapshot;
  source: DashboardSource;
  onTrackCreated: (track: Track) => void;
  onMediaAssetCreated: (asset: MediaAsset) => void;
}) {
  switch (activeId) {
    case "ida":
      return <IdaView messages={messages} />;
    case "music":
      return <MusicView dashboard={dashboard} source={source} onTrackCreated={onTrackCreated} />;
    case "content":
      return <ContentView dashboard={dashboard} onMediaAssetCreated={onMediaAssetCreated} />;
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
      return <HomeView messages={messages} dashboard={dashboard} source={source} />;
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
        setDashboardNotice("Données API synchronisées : système, tracks et médias.");
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
            <span className="date-pill">SAT · 30 AUG</span>
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
