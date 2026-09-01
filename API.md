# IDA — Contrat API

Ce document définit les conventions et la surface API d’IDA. L’API est le point de partage unique entre le hub desktop/web, le futur iPhone et d’éventuels clients natifs. Les routes effectivement livrées sont distinguées de la surface cible afin que l’interface ne promette jamais une capacité absente.

## Principes

- API HTTP JSON versionnée sous `/v1` ; une spécification OpenAPI sera générée dès l’implémentation.
- Les clients ne parlent jamais directement à PostgreSQL, au stockage objet, à un fournisseur IA ou aux plateformes sociales.
- Le backend reste la seule autorité pour l’identité, les permissions, les secrets, l’orchestation IA, les outils et les effets externes.
- Les routes représentent des ressources et des cas d’usage métier ; les agents sont internes au backend et ne sont pas exposés comme des services publics.
- Le contrat est stable et API-first : le web, une PWA, un futur client desktop et un futur client iOS partagent la même API.
- Les écritures à effet externe sont idempotentes, auditables et soumises à la policy engine.

## Tranche locale Phase 1 livrée

Le premier runtime est une API Fastify locale sur `http://127.0.0.1:8787`, consommée par le Command Center web. Il emploie un contexte de démonstration fixé côté serveur, sans session, token, OAuth ni données réelles. Ce contexte est uniquement un mécanisme de développement : il ne remplace pas l’authentification ni l’autorisation de production.

| Route | État actuel | Contrat actif |
|---|---|---|
| `GET /health` | Livrée | Santé du runtime local et disponibilité de la base locale. |
| `GET /v1/me` | Livrée | Identité et workspace de démonstration, marqués `LOCAL_DEMO`. |
| `GET /v1/modules` | Livrée | Registre des modules visibles du Command Center. |
| `GET /v1/system/status` | Livrée | États factuels de la tranche locale ; les intégrations absentes sont `WARNING` ou `DISCONNECTED`. |
| `GET/PATCH /v1/artist-profile`, `/v1/releases`, `GET/POST /v1/tracks`, `GET/POST /v1/media`, `GET /v1/memories` | Livrées | Données de démonstration isolées par workspace côté serveur. L’Artist Brain, la création bornée d’un morceau Music Brain et l’import local privé d’un média passent par des outils `WRITE` allowlistés ; `GET /v1/media` filtre localement par texte, statut, type et tag. |
| `GET/POST /v1/campaigns`, `PATCH /v1/campaigns/:campaignId/release` | Livrées | Registre local de briefs de campagne internes. La création force `DRAFT`; un lien optionnel vers une release du même workspace et projet est contrôlé par version via `CAMPAIGNS` / `WRITE`, sans créer de planification ni effet externe. |
| `POST /v1/memories/proposals`, `POST /v1/memories/:memoryId/confirm`, `POST /v1/memories/:memoryId/reject` | Livrées | Flux de mémoire consentie : une préférence commence forcément à `PENDING` et seule une décision humaine explicite peut la faire passer à `CONFIRMED` ou `REJECTED`. |
| `GET /v1/approvals/queue`, `POST /v1/post-variants/:variantId/approve`, `POST /v1/post-variants/:variantId/reject` | Livrées | Approval Center local : propositions seedées en `REQUESTED`, préconditionnées par un hash de payload et décidées humainement ; aucune programmation ni publication n’en découle seule. |
| `GET /v1/calendar`, `POST /v1/post-variants/:variantId/internal-schedules` | Livrées | Calendrier éditorial et planification interne d’une variante déjà approuvée ; aucun job, compte social, adaptateur ou appel réseau n’est créé. |
| `GET/POST /v1/tasks`, `POST /v1/tasks/:taskId/complete` | Livrées | Task Center local : création interne en `TODO`, finalisation explicite et idempotente, toujours isolées au workspace serveur. |
| `GET /v1/social/platforms` | Livrée | Capacités déclaratives de démonstration ; aucune connexion sociale n’est créée. |
| `POST /v1/ida/commands` | Livrée | Corps `{ "message": "…" }` ; commandes déterministes de lecture pour la journée, les contenus inutilisés et l’état système. |

La commande retourne un objet `data` contenant la commande structurée, les outils de lecture autorisés et un résultat. À l’exception de la modification interne de l’Artist Brain, de la création Music Brain bornée, de l’import local privé, du flux de consentement mémoire, du registre de briefs de campagne, de l’Approval Center et du Task Center décrits ci-dessous, toute mutation, publication, intégration externe ou accès financier est hors de cette tranche et reste refusée par conception.

### Artist Brain local éditable

`PATCH /v1/artist-profile` accepte un corps JSON partiel contenant un ou plusieurs des champs suivants : `identity`, `genres`, `influences`, `tone`, `preferredVocabulary`, `forbiddenVocabulary`, `goals`, `audience` et `platformPreferences`.

- Le workspace et le projet ne font pas partie du corps : ils restent imposés par le contexte de démonstration serveur. Un champ inconnu, y compris `workspaceId` ou `artistProjectId`, est refusé avec `400 INVALID_ARTIST_PROFILE`.
- L’action passe par l’outil interne allowlisté `update_artist_profile` avec la permission `WRITE`. Elle ne déclenche aucune publication, connexion OAuth, appel IA ou effet externe.
- La mise à jour est partielle : les champs omis restent inchangés. Le bootstrap PGlite ajoute les colonnes de façon additive et le seed conserve `ON CONFLICT DO NOTHING`, afin de ne jamais remplacer un profil local déjà édité.
- Les préférences de plateforme sont volontairement bornées à des formats préférés, une cadence hebdomadaire et une note, pour éviter de stocker une configuration externe arbitraire avant l’intégration officielle des plateformes.

### Music Brain : ajout local contrôlé

`POST /v1/tracks` accepte un morceau interne avec les champs requis `title`, `artistCredit` et `status`, ainsi que les champs optionnels `genre`, `bpm`, `musicalKey`, `releaseDate`, `label`, `tags` et `description`.

- Le corps est strict : ni `workspaceId`, ni `artistProjectId`, ni `releaseId`, ni identifiant client ne sont acceptés. Le serveur résout le workspace, le premier projet artistique local et l’acteur avant de créer le morceau ; toute tentative d’injection de scope retourne `400 INVALID_TRACK`.
- L’écriture passe exclusivement par l’outil interne allowlisté `create_track` (`MUSIC`, `WRITE`). Il n’y a ni upload, ni association à un média, ni effet social ou externe.
- L’identifiant `trk_…` est généré côté serveur, la clé primaire le protège contre les collisions et une activité append-only `track.created` est ajoutée dans le journal local.
- Les valeurs sont bornées (BPM strictement positif et au plus 400, 30 tags maximum, description au plus 4 000 caractères). Une création réussie retourne `201 Created` et le morceau est visible uniquement dans `GET /v1/tracks` du workspace imposé par le serveur.

### Campaign Brief Registry : création et lien de release contrôlés

`GET /v1/campaigns` liste les briefs internes du workspace imposé par le serveur, dans l’ordre stable de création décroissante. `POST /v1/campaigns` accepte strictement :

```json
{
  "name": "Lumière Noire — préparation",
  "objective": "Poser le brief créatif avant tout plan de contenu."
}
```

- `name` est borné à 240 caractères et `objective` à 2 000. Le corps refuse `id`, `workspaceId`, `artistProjectId`, acteur, statut, release, date, pilier ou toute propriété inconnue avec `400 INVALID_CAMPAIGN`.
- Le serveur résout workspace, projet et acteur, génère l’identifiant `cmp_…` et force toujours l’état initial `DRAFT`. Les noms sont normalisés NFKC, trimés et comparés sans casse dans un même workspace ; un doublon répond `409 CAMPAIGN_ALREADY_EXISTS`.
- L’écriture passe uniquement par `create_campaign` (`CAMPAIGNS` / `WRITE`). L’audit append-only `campaign.created` ne contient que l’état et l’identifiant porté par l’événement, jamais le nom ou l’objectif libres.

`PATCH /v1/campaigns/:campaignId/release` rattache ou retire explicitement le lien optionnel vers une release existante. Il accepte strictement :

```json
{
  "releaseId": "rel_…",
  "expectedVersion": 1
}
```

`releaseId` peut aussi valoir `null` pour retirer le lien. `expectedVersion` est l’entier positif retourné par la dernière lecture de la campagne ; ni workspace, projet, acteur, titre de release, statut, date ou autre champ de campagne ne sont acceptés.

- Le serveur résout d’abord la campagne dans le workspace imposé, puis la release dans ce même workspace **et** sous le même projet artistique. Une campagne ou release absente, étrangère ou appartenant à un autre projet répond par le même `404` générique, sans révéler laquelle n’est pas compatible.
- La réponse `Campaign` expose toujours `version` et expose `releaseId` / `releaseTitle` uniquement lorsqu’un lien valide existe. Une modification effective incrémente la version et `updatedAt`; une version dépassée répond `409 CAMPAIGN_STALE` sans écriture.
- Un retry demandant exactement le lien déjà présent — y compris `releaseId: null` lorsqu’il est déjà absent — retourne `200` sans modifier la version ni ajouter d’audit. Une liaison ou suppression effective passe exclusivement par `link_campaign_release` (`CAMPAIGNS` / `WRITE`) et écrit `campaign.release_linked` ou `campaign.release_unlinked` avec des identifiants et la version, jamais le nom, l’objectif ou le titre de release.
- Cette relation est purement interne : elle ne crée ni date, ni pilier, ni plan de contenu, ni post, ni tâche, ni calendrier, ni notification, ni appel IA, OAuth, job, compte social ou publication. Les transitions de statut et autres associations restent des routes futures séparées.

### Content Library : recherche et import local privé

`GET /v1/media` est une lecture locale sans effet d’écriture. Les filtres optionnels sont `q` (1–160 caractères), `status`, `type`, `tag` (1–80 caractères) et `limit` (entier de 1 à 50, 50 par défaut). Ils se combinent tous ; le résultat est trié de façon stable par création décroissante puis identifiant décroissant.

- `q` cherche littéralement, sans joker client, dans le nom du fichier, sa description et ses tags. Les caractères `%`, `_` et `\` sont échappés côté requête SQL.
- `tag` est une égalité sur un tag normalisé NFKC, trimé et insensible à la casse ; il ne duplique jamais un média associé à plusieurs tags.
- Le serveur ne lit que ces filtres reconnus. Un `workspaceId` ou tout autre scope transmis dans l’URL est ignoré et ne peut jamais modifier le workspace serveur. Une valeur invalide ou dupliquée pour un filtre reconnu répond `400 INVALID_MEDIA_QUERY`.
- La réponse reste limitée au contrat `MediaAsset` : ni `storageKey`, ni chemin local, ni URL signée ne sont sélectionnés ou retournés. Cette recherche n’écrit ni média, ni statut, ni compteur d’usage, ni audit.

`POST /v1/media` accepte uniquement un formulaire `multipart/form-data` contenant un fichier `file` et, au plus une fois chacun, les champs texte optionnels `description` et `tags`. Les tags sont transmis en liste séparée par des virgules, normalisés puis dédupliqués.

- Le corps multipart est strict : aucun `workspaceId`, projet, release, track, identifiant client ou champ supplémentaire n’est accepté. Le workspace, le projet et l’acteur sont imposés par le contexte serveur local ; l’import passe par l’outil interne allowlisté `import_media` (`CONTENT`, `WRITE`).
- Un seul fichier est accepté, avec une limite de **25 MiB**. L’API contrôle une whitelist conjointe MIME/extension : JPEG, PNG, WebP, GIF, MP4, MOV, WebM, MP3, WAV, FLAC, OGG, AAC, M4A et PDF. Aucun contenu n’est publié, envoyé à une IA ou transmis à un service tiers.
- Le serveur calcule SHA-256 puis vérifie le couple `(workspace_id, sha256)` avant l’écriture. Un doublon exact répond `409 DUPLICATE_MEDIA` et ne crée ni second asset ni second fichier.
- Le fichier est enregistré hors de toute URL publique dans un stockage privé à clé générée côté serveur. La clé, le chemin local et toute URL de stockage restent absents des réponses et des journaux. L’asset démarre à `UNUSED`, ses tags sont associés localement et l’activité append-only `media.imported` est écrite.
- Une réussite retourne `201 Created` avec le contrat `MediaAsset`, et l’asset est ensuite visible uniquement dans `GET /v1/media` du workspace imposé.

### Mémoire consentie : préférences explicites

`POST /v1/memories/proposals` accepte strictement `{ "content": "…" }`. Il crée une mémoire avec une catégorie forcée à `PREFERENCE_MEMORY` et l’état forcé à `PENDING`.

- Le client ne peut jamais choisir l’identifiant, le workspace, l’acteur, la catégorie, l’état ou une date. Toute propriété supplémentaire — notamment `state`, `workspaceId`, `id` ou `actorUserId` — renvoie `400 INVALID_MEMORY_PROPOSAL`.
- `POST /v1/memories/:memoryId/confirm` et `POST /v1/memories/:memoryId/reject` ne reçoivent aucun corps. Ils sont tous deux protégés par un outil `MEMORY` / `WRITE` allowlisté ; un corps qui tente d’injecter une décision ou un scope est refusé par `400 INVALID_MEMORY_DECISION`.
- La transition est atomique : seulement `PENDING → CONFIRMED` ou `PENDING → REJECTED`. Un état final est immuable et toute nouvelle décision retourne `409 MEMORY_DECISION_FINAL`.
- Le `memoryId` est toujours recherché dans le workspace imposé par le serveur. Une mémoire hors workspace répond comme absente avec `404 MEMORY_NOT_FOUND`, sans révéler son existence. `GET /v1/memories` renvoie les vrais `createdAt` et `updatedAt` persistés ; une confirmation expose aussi `confirmedBy` et `confirmedAt`.
- Les actions écrivent uniquement des événements d’audit append-only `memory.proposed`, `memory.confirmed` et `memory.rejected`. Le contenu libre de la préférence est volontairement absent du payload d’audit.

### Approval Center : décision humaine sur un payload immuable

`GET /v1/approvals/queue` renvoie uniquement les approbations `REQUESTED` du workspace imposé par le serveur, dans un ordre stable par date proposée puis demande. Une proposition contient l’identifiant d’approbation, la variante, le post, le payload éditorial et un `payloadHash` SHA-256. Les métadonnées de média sont volontairement limitées à `id`, `filename`, `type` et `status` : ni clé de stockage, ni chemin privé, ni URL signée ne sort de l’API.

`POST /v1/post-variants/:variantId/approve` et `POST /v1/post-variants/:variantId/reject` acceptent strictement :

```json
{
  "approvalId": "approval_…",
  "expectedPayloadHash": "sha256:…"
}
```

- Ces deux champs sont des **préconditions**, pas une permission. `workspaceId`, acteur, état, caption, médias, plateforme, horaire ou livraison client sont refusés par `400 INVALID_APPROVAL_DECISION`.
- Avant toute autorisation, le serveur résout la variante et l’approbation dans le workspace courant, recalcule le hash canonique (`postTitle`, objectif, rationale éventuelle, plateforme, texte, hashtags ordonnés, CTA, date proposée, fuseau et médias ordonnés) puis refuse toute valeur obsolète avec `409 APPROVAL_STALE_PAYLOAD`. Une variante étrangère répond `404 POST_VARIANT_NOT_FOUND` sans révéler son existence.
- Après cette vérification, la route construit côté serveur la preuve remise à l’outil allowlisté `decide_post_variant` (`CONTENT` / `APPROVAL_REQUIRED`) avec l’approbation résolue, l’acteur serveur et l’instant serveur. Elle ne copie jamais une prétendue preuve du corps. En `LOCAL_DEMO`, l’acteur reste le contexte de démonstration ; ce mécanisme ne prétend pas remplacer l’authentification réelle.
- La transition atomique est `REQUESTED → APPROVED` ou `REQUESTED → REJECTED`. Une même décision est idempotente : elle retourne `200` sans nouvelle date ni nouvel audit. Une décision opposée est finale et répond `409 APPROVAL_DECISION_FINAL`.
- Une décision laisse toujours `deliveryState` à `NOT_CONFIGURED`. Elle ne touche ni `scheduled_posts`, ni les statuts/compteurs des médias, ni jobs, OAuth, compte social, adaptateur ou réseau externe. `plannedAt`, lorsqu’il existe, est uniquement une date proposée.
- Un audit append-only `post_variant.approved` ou `post_variant.rejected` contient seulement les identifiants, l’état et le hash ; il ne recopie ni caption, ni hashtags, ni rationale, ni donnée de stockage.

### Calendrier éditorial et planification interne

`GET /v1/calendar` accepte uniquement la query stricte `view?: DAY|WEEK|MONTH`, `from?: ISO-8601` et `to?: ISO-8601`. Les deux bornes doivent être fournies ensemble, décrivent une plage demi-ouverte `[from, to)` d’au plus 62 jours et sont toujours renvoyées normalisées avec la vue et le fuseau du workspace :

```json
{
  "data": {
    "range": {
      "view": "WEEK",
      "from": "2026-08-23T22:00:00.000Z",
      "to": "2026-08-30T22:00:00.000Z",
      "timezone": "Europe/Paris"
    },
    "items": []
  }
}
```

Sans bornes, le serveur dérive jour, semaine (lundi inclus) ou mois dans le fuseau du workspace à partir de son horloge injectée. La projection est limitée à 200 éléments, triée de façon stable, et n’expose que `id`, `kind`, `variantId`, `postId`, `postTitle`, `platform`, `scheduledAt`, `timezone`, `state`, `approvalId` et `payloadHash`. Elle contient les snapshots internes encore valides (`INTERNAL_SCHEDULE` / `SCHEDULED_INTERNAL`) et les variantes `APPROVED` prêtes à planifier (`APPROVED_VARIANT` / `READY_TO_SCHEDULE`). Caption, hashtags, médias, clés de stockage, comptes et secrets sont absents.

`POST /v1/post-variants/:variantId/internal-schedules` accepte strictement le même couple de préconditions :

```json
{
  "approvalId": "approval_…",
  "expectedPayloadHash": "sha256:…"
}
```

- Le serveur exige une variante et une approbation `APPROVED` dans son workspace, recalcule le payload canonique et vérifie que les trois hashes (client, approval, variante) correspondent. Il reprend uniquement `plannedAt` et `timezone` du payload approuvé ; le client ne peut ni choisir date, fuseau, plateforme, acteur ni état. Les corps invalides répondent `400 INVALID_INTERNAL_SCHEDULE`, une variante étrangère `404 POST_VARIANT_NOT_FOUND`, et une approbation ou un hash obsolète `409 SCHEDULE_STALE_APPROVAL`.
- Une date absente ou non future selon la même horloge serveur répond `409 SCHEDULE_TIME_UNAVAILABLE`. Un seul snapshot actif est permis par variante et le même couple `(platform_id, scheduled_at)` est exclusif dans un workspace ; ces collisions répondent `409 SCHEDULE_CONFLICT`. Deux plateformes distinctes peuvent utiliser le même instant.
- Le premier succès retourne `201`; le retry exact d’un snapshot actif retourne `200`, y compris après l’horaire, sans nouvelle écriture. La réponse sûre contient `id`, variante, post, plateforme, date, fuseau, état `SCHEDULED`, approbation, hash et `deliveryState: NOT_CONFIGURED`.
- La route autorise uniquement l’outil allowlisté `schedule_approved_post_variant` (`CALENDAR` / `APPROVAL_REQUIRED`) avec la preuve déjà résolue de l’approbation humaine. Elle écrit un audit redacted `post_variant.internal_scheduled`, mais ne modifie jamais `scheduled_posts`, les médias, `delivery_state`, approvals, jobs, OAuth, adaptateurs sociaux ou réseau externe.

### Task Center : finalisation contrôlée

`POST /v1/tasks` accepte strictement `{ "title": "…", "description"?: "…", "dueAt"?: "…" }`. Le serveur crée un identifiant, résout le workspace et l’acteur, et force l’état initial à `TODO`.

- Les champs `id`, `workspaceId`, `actorUserId`, `status`, les dates de finalisation et toute propriété inconnue sont refusés avec `400 INVALID_TASK`. `dueAt` est un timestamp UTC optionnel : une tâche sans échéance reste visible dans `GET /v1/tasks`, mais est délibérément exclue du résumé `Today`.
- `POST /v1/tasks/:taskId/complete` ne reçoit aucun corps et accepte seulement `TODO → DONE` ou `IN_PROGRESS → DONE`. La tâche est recherchée dans le workspace serveur ; une tâche étrangère ou absente retourne `404 TASK_NOT_FOUND` sans révéler son existence.
- La route est idempotente pour `DONE` : un retry retourne `200` avec la tâche existante, sans modifier `updatedAt`, `completedAt` ni ajouter un second audit. Un autre état final, tel que `CANCELLED`, répond `409 TASK_NOT_ACTIONABLE`.
- Les outils `create_task` et `complete_task` sont allowlistés sous `TASKS` / `WRITE`. Les événements `task.created` et `task.completed` sont append-only et leurs payloads ne contiennent ni titre ni description.

La version machine-lisible de ces routes est disponible dans [`docs/openapi/phase1-local.yaml`](docs/openapi/phase1-local.yaml). Elle décrit uniquement le runtime local existant, pas les endpoints projetés plus bas.

## Conventions de transport

### Base, contenu et noms

```text
Base URL : /v1
Content-Type : application/json; charset=utf-8 (sauf POST /v1/media : multipart/form-data)
Dates : ISO 8601 UTC, par exemple 2026-08-30T16:00:00Z
IDs : UUID ou ULID opaques
JSON API : camelCase
Base de données : snake_case (non exposé)
```

Les listes cibles utiliseront une pagination par curseur. La recherche locale `GET /v1/media` livrée aujourd’hui est volontairement bornée à `limit ≤ 50` et ne retourne pas encore de curseur :

```text
GET /v1/media?limit=50&cursor=…&sort=-createdAt
```

Réponse standard :

```json
{
  "data": [],
  "page": {
    "nextCursor": null
  }
}
```

Les réponses d’erreur suivent un format proche de RFC 9457 :

```json
{
  "type": "https://ida.example/errors/approval-required",
  "title": "Approval required",
  "status": 409,
  "code": "APPROVAL_REQUIRED",
  "detail": "La variante doit être approuvée avant sa programmation.",
  "requestId": "req_…"
}
```

Les clients envoient `X-Request-Id` lorsqu’ils en possèdent un. Toute mutation susceptible d’être répétée, notamment upload finalisation, programmation, livraison ou action externe, exige `Idempotency-Key`.

### Authentification et workspace

- L’authentification repose sur un fournisseur OIDC choisi ultérieurement.
- Le web peut utiliser une session sécurisée `HttpOnly`; les clients natifs utilisent des access tokens courts et renouvelables. Les deux sont validés par l’API.
- Le workspace actif provient de la session ou d’un en-tête validé par le serveur. Un client ne choisit jamais librement un `workspaceId` auquel il n’appartient pas.
- Les jetons OAuth sociaux, clés IA et secrets de stockage ne figurent dans aucune réponse API.

## Permissions

Les niveaux demandés par IDA sont des permissions d’action, non de simples rôles d’interface :

| Niveau | Usage |
|---|---|
| `READ` | Lire, rechercher, prévisualiser et analyser des données autorisées. |
| `WRITE` | Créer ou modifier des données internes non publiques. |
| `APPROVAL_REQUIRED` | Créer une proposition ou demander une décision explicite avant effet conséquent. |
| `PUBLISH` | Envoyer ou programmer une publication publique ; impose toujours une approbation humaine liée au payload final. |
| `SYSTEM` | Opérations réservées au backend/opérateur : santé, rotation de secrets, traitements asynchrones. |

Les rôles `OWNER`, `EDITOR` et `VIEWER` sont mappés à ces permissions par workspace. Une permission `PUBLISH` ne contourne jamais l’Approval Center : l’API vérifie l’approbation valide, le hash du contenu, le compte, la plateforme et l’horaire avant de créer une livraison.

## Ressources et endpoints v1

Les chemins ci-dessous sont la surface prévue. Leur livraison est échelonnée par roadmap ; une route listée n’implique pas qu’elle existe au MVP initial.

### Session, système et identité

```text
GET    /v1/me
GET    /v1/workspaces/current
PATCH  /v1/workspaces/current
GET    /v1/system/status
GET    /health/live
GET    /health/ready
```

`/v1/system/status` retourne des états observés (`ONLINE`, `WARNING`, `ERROR`, `DISCONNECTED`) pour IA, base, stockage, scheduler, notifications et comptes sociaux. Il ne doit pas inventer un état à partir d’un prompt.

### Artist Brain

```text
GET    /v1/projects
POST   /v1/projects
GET    /v1/projects/:projectId
PATCH  /v1/projects/:projectId

GET    /v1/projects/:projectId/artist-profile
PATCH  /v1/projects/:projectId/artist-profile

GET    /v1/projects/:projectId/editorial-rules
POST   /v1/projects/:projectId/editorial-rules
PATCH  /v1/editorial-rules/:ruleId
DELETE /v1/editorial-rules/:ruleId
```

### Catalogue musical et recherche

```text
GET    /v1/releases
POST   /v1/releases
GET    /v1/releases/:releaseId
PATCH  /v1/releases/:releaseId

GET    /v1/tracks
POST   /v1/tracks
GET    /v1/tracks/:trackId
PATCH  /v1/tracks/:trackId

GET    /v1/search?q=:query&scope=tracks,releases,media
```

Les filtres supportent notamment projet, release, statut, tag, période, BPM, tonalité et type de média. Toute recherche est automatiquement limitée au workspace autorisé.

### Content Library et fichiers

```text
POST   /v1/media
POST   /v1/media/upload-intents
POST   /v1/media/:mediaId/complete
GET    /v1/media
GET    /v1/media/:mediaId
PATCH  /v1/media/:mediaId
DELETE /v1/media/:mediaId
GET    /v1/media/:mediaId/preview
POST   /v1/media/:mediaId/tags
DELETE /v1/media/:mediaId/tags/:tagId
```

Le MVP local livre `GET /v1/media` (recherche de métadonnées bornée) et `POST /v1/media`, vers stockage privé interne et sans URL signée. Les prévisualisations, la pagination par curseur, les intentions d’upload et les modifications restent des cibles ultérieures, à activer seulement avec stockage objet et contrôle de sécurité dédiés :

```text
Client → POST upload-intents → URL signée courte
Client → stockage objet (upload direct)
Client → POST complete → validation type/taille/hash + job de traitement
```

Le serveur contrôle les MIME types, tailles, ownership et checksum. Une URL signée ne donne accès qu’au fichier et à l’opération autorisés ; elle ne remplace pas les permissions API.

### Conversations, IDA et mémoire

```text
GET    /v1/conversations
POST   /v1/conversations
GET    /v1/conversations/:conversationId
GET    /v1/conversations/:conversationId/messages
POST   /v1/conversations/:conversationId/messages

POST   /v1/ida/commands
GET    /v1/ida/command-runs/:commandRunId
POST   /v1/ida/command-runs/:commandRunId/cancel

GET    /v1/memories
POST   /v1/memories/proposals
POST   /v1/memories/:memoryId/confirm
POST   /v1/memories/:memoryId/reject
PATCH  /v1/memories/:memoryId
DELETE /v1/memories/:memoryId
```

`POST /v1/ida/commands` reçoit un texte ou une transcription et renvoie soit une réponse immédiate, soit un `commandRun` à suivre. Le statut peut être transmis ensuite par polling, SSE ou WebSocket lorsque cette capacité sera ajoutée.

Exemple de réponse asynchrone :

```json
{
  "data": {
    "commandRunId": "cmd_…",
    "state": "AWAITING_APPROVAL",
    "message": "J’ai préparé trois propositions à valider."
  }
}
```

### Campagnes, contenu, approbations et calendrier

```text
GET    /v1/campaigns
POST   /v1/campaigns
PATCH  /v1/campaigns/:campaignId/release
GET    /v1/campaigns/:campaignId
PATCH  /v1/campaigns/:campaignId

GET    /v1/content-plans
POST   /v1/content-plans
GET    /v1/content-plans/:planId
PATCH  /v1/content-plans/:planId

GET    /v1/posts
POST   /v1/posts
GET    /v1/posts/:postId
PATCH  /v1/posts/:postId
POST   /v1/post-variants/:variantId/regenerate
POST   /v1/post-variants/:variantId/request-approval
POST   /v1/post-variants/:variantId/approve
POST   /v1/post-variants/:variantId/reject
POST   /v1/post-variants/:variantId/internal-schedules

GET    /v1/calendar?from=:iso&to=:iso&view=day|week|month
GET    /v1/calendar/conflicts?from=:iso&to=:iso
GET    /v1/calendar-events
POST   /v1/calendar-events
PATCH  /v1/calendar-events/:eventId

GET    /v1/tasks
POST   /v1/tasks
POST   /v1/tasks/:taskId/complete
```

Dans le runtime local, `GET /v1/campaigns`, `POST /v1/campaigns` et `PATCH /v1/campaigns/:campaignId/release` sont livrés pour un **Campaign Brief Registry** interne en `DRAFT`. `GET/PATCH /v1/campaigns/:campaignId`, les dates, piliers, plans de contenu, posts, tâches et calendrier restent des cibles ultérieures ; ils ne doivent pas être déduits de cette surface minimale.

`approve` est une action humaine authentifiée. Elle enregistre le payload final, l’auteur et l’instant de décision. `schedule` ne peut pas transformer une proposition non approuvée en action publique. Tant qu’aucun adapter social n’est livré, une publication programmée reste un élément de planning interne.

### Réseaux sociaux et analytics

Ces routes sont prévues pour une phase postérieure et seront activées plateforme par plateforme selon les capacités officiellement vérifiées.

```text
GET    /v1/social/platforms
GET    /v1/social/platforms/:platformKey/capabilities
GET    /v1/social/accounts
POST   /v1/social/:platformKey/oauth/start
GET    /v1/social/:platformKey/oauth/callback
POST   /v1/social/accounts/:accountId/reconnect
DELETE /v1/social/accounts/:accountId

GET    /v1/analytics/overview
GET    /v1/analytics/content
GET    /v1/analytics/platforms
POST   /v1/analytics/syncs
GET    /v1/analytics/syncs/:syncId
```

Les webhooks des fournisseurs utilisent un chemin isolé, par exemple `/webhooks/social/:platformKey`, avec signature vérifiée, anti-rejeu et journalisation. Ils ne constituent pas une API publique de client.

### Notifications

```text
GET    /v1/notifications
POST   /v1/notifications/:notificationId/read
POST   /v1/notifications/read-all
```

Les fournisseurs push/email sont des adapters internes ; les clients ne reçoivent jamais leurs secrets.

## IDA Core : aucune exécution directe par le LLM

L’API ne doit jamais offrir une route du type :

```text
POST /v1/tools/:toolId/execute
POST /v1/llm/raw
POST /v1/admin/sql
```

Le déroulé correct est :

```text
Client → POST /ida/commands
       → IDA Core interne
       → intention + contexte + agent(s)
       → proposition structurée validée
       → policy engine
       → outil interne allowlisté
       → journal / approbation / réponse API
```

Chaque outil interne possède un schéma d’entrée/sortie, une permission, un propriétaire de module, une stratégie d’idempotence, une gestion d’erreur et une journalisation. L’outil ne reçoit que les données nécessaires et aucune instruction issue sans contrôle d’un média, d’un commentaire social ou d’un texte externe ne peut lui donner de nouveaux pouvoirs.

Les opérations `READ` peuvent être exécutées immédiatement lorsqu’elles sont autorisées. `WRITE` crée ou modifie des objets internes. `APPROVAL_REQUIRED` produit une proposition. `PUBLISH` exige une approbation explicite et valide du payload exact. `SYSTEM` est inaccessible au client et réservé aux traitements backend contrôlés.

## Concurrence, retries et sécurité opérationnelle

- Les mutations utilisent `updatedAt`/ETag ou `rowVersion` pour éviter qu’une modification mobile écrase silencieusement celle du desktop.
- Les livraisons externes sont créées avec une clé d’idempotence et un `correlationId` commun à l’activité, au command run et au job.
- Les opérations asynchrones répondent `202 Accepted` lorsqu’un résultat différé est normal ; leur état reste consultable.
- Les limites de débit s’appliquent par utilisateur, workspace, IP et connector, avec limites plus strictes sur upload, IA et OAuth.
- Les logs doivent être redacted : pas de jeton, de cookie, de clé, ni de contenu sensible non nécessaire.
- Toute réponse 403 ou 404 doit éviter de révéler l’existence d’une ressource hors workspace.

## Extension future de l’API — non implémentée

Les namespaces suivants sont réservés, mais aucune route ne doit être créée avant validation du module correspondant.

```text
/v1/finance/*       # connexions agréées, comptes, transactions, budgets
/v1/shopping/*      # listes et articles de courses
/v1/documents/*     # documents et notes futures
/v1/modules/*       # état des modules IDA activables
/v1/agents/*        # lecture administrative du registry, jamais exécution libre
```

Pour finance, le principe est lecture seule, consentement séparé et fournisseur agréé. Pour les courses, le module réutilise les conventions d’identité, mémoire consentie, tâches et notifications sans toucher aux données artistiques. Pour le registry, seules des routes administratives de lecture/configuration contrôlée peuvent exister : les modules et agents restent du code déployé et revu, non des scripts exécutables provenant de la base.

## Versioning et compatibilité

- Les changements incompatibles créent `/v2`, pas une modification silencieuse de `/v1`.
- Les nouveaux champs de réponse sont optionnels et rétrocompatibles.
- Les dépréciations sont annoncées dans OpenAPI, journalisées et maintenues pendant une période définie avant retrait.
- Les capabilities sociales et de modules sont interrogées au runtime ; le front ne présume pas qu’une fonctionnalité est disponible.

## Critères de qualité avant exposition d’une route

Chaque route livrée doit avoir : un contrat OpenAPI, validation serveur, contrôle workspace/permission, erreurs cohérentes, tests de succès/échec, traces sans secrets et documentation mise à jour. Les routes d’effet externe ajoutent idempotence, retry contrôlé, audit et, lorsque requis, approbation humaine.
