# IDA — Modèle de données

Préparation éditoriale manuelle du 9 septembre : réutilisation transactionnelle de `posts`, `post_variants`, `post_variant_media`, `approvals` et `activity_logs`, sans migration. Unicité de création par IDs SHA-256 dérivés de workspace/acteur/requestId et empreinte du corps validé dans l'audit append-only `post_variant.proposed` ; aucune caption ou métadonnée libre dans l'audit. La conservation de ces lignes conditionne la garantie de retry sans doublon. États PROPOSED / REQUESTED / NOT_CONFIGURED ; aucun usage média incrémenté ni planning créé. Voir [MEDIA_PROPOSALS.md](docs/MEDIA_PROPOSALS.md).

Audit IA du 8 septembre : table additive `intelligence_audit_events`, champs stricts sans payload libre, index workspace/id, relations de scope vérifiées à l'insertion et triggers contre UPDATE/DELETE/TRUNCATE. Idempotence par workspace/famille/run/tentative/résultat avec comparaison d'empreinte ; aucune modification des journaux existants. Voir [contrat, limites, rétention et tests](docs/INTELLIGENCE_AUDIT.md).

Complément du 8 septembre : [contexte musical](docs/MUSIC_CONTEXT.md), sans migration. Projection SQL dédiée limitée à 10 lignes, champs explicitement sélectionnés, workspace lié et archives exclues. Le résolveur Identity accepte un argument serveur facultatif `localSessionAt` exigeant une session locale active, sans prolonger son inactivité ; son échéance effective est bornée par l'expiration idle. Aucun token/digest sélectionné. Les appels historiques sans cet argument restent inchangés ; ce complément ne constitue pas une authentification HTTP.

Ce document décrit le modèle relationnel cible du MVP d’IDA et distingue ce modèle de la tranche locale réellement livrée. Le modèle complet reste la source de vérité fonctionnelle ; la persistance locale actuelle sert à vérifier le premier flux sans préjuger du déploiement de production.

## Principes de conception

- **PostgreSQL est la source de vérité** pour les données métier. Les fichiers audio, vidéo et image résident dans un stockage objet ; la base ne conserve que leurs métadonnées et leur clé de stockage.
- Toute donnée fonctionnelle est rattachée à un `workspace`. IDA reste personnelle au MVP, mais ce périmètre rend possible l’ajout futur de collaborateurs, de plusieurs projets artistiques ou d’autres domaines sans migration invasive.
- Les tables utilisent des identifiants UUID ou ULID, `created_at`, `updated_at` et des dates en UTC. Le fuseau d’affichage appartient au `workspace` et/ou au `user`.
- L’API expose des noms en `camelCase`; la base utilise des noms en `snake_case`.
- Les données externes brutes peuvent être conservées dans un champ `jsonb` limité et documenté. Les relations recherchées, filtrées ou contraintes restent relationnelles.
- Les journaux, approbations et tentatives de publication sont append-only. Les entités éditables peuvent utiliser une suppression logique avec `deleted_at`.
- Toute requête métier doit appliquer le filtre `workspace_id`. Cette isolation est une règle applicative dès le départ, même avec un seul utilisateur.

## Mise en œuvre actuelle — tranche locale Phase 1

L’API utilise actuellement **PGlite** dans `apps/api/.data/` pour les tests et l’exécution locale. Cette base est ignorée par Git et est initialisée avec un workspace de démonstration. Le mode opt-in `LOCAL_LOCK` y stocke un verifier de passphrase salé et des digests de session, jamais la passphrase ou le token opaque ; aucune donnée réelle, aucun token social ni identifiant bancaire n’y est attendu.

Les tables minimales actuellement créées couvrent l’identité locale, workspaces et memberships, instances clientes, sessions et grants, verrou propriétaire opt-in, événements de sécurité, projets/profils artistiques, releases, tracks, médias/tags, mémoires, briefs de campagne, plateformes sociales, tâches, posts planifiés, propositions d’approbation, planifications internes et journal d’activité. La migration Identity ajoute sans perte les statuts de `users` et `memberships`, puis crée `client_instances`, `identity_sessions`, `client_workspace_grants`, `local_owner_credentials`, `local_auth_sessions` et `identity_security_events`. Des FKs composées imposent qu'une session et un grant appartiennent au même utilisateur que leur instance, et qu'un grant corresponde à une membership du même workspace. En `LOCAL_DEMO`, le résolveur relit l’identité technique persistée sans authenticator. En `LOCAL_LOCK`, le verifier scrypt salé (`N=131072`, `r=8`, `p=1`, clé de 32 octets) autorise une session opaque dont seul le digest SHA-256 est persisté ; ses échéances sont de 30 minutes d’inactivité glissantes et 8 heures absolues. Les échecs de déverrouillage maintiennent un compteur et un `retry_after` pour un backoff exponentiel plafonné à 5 minutes. Après résolution, le même contexte utilisateur/instance/workspace/grant est relu, contrôlé et gelé avant les routes métier. Aucun de ces mécanismes ne constitue encore le Device Linking, une passkey ou une identité réseau. L’Artist Brain local persiste identité, ton, genres, influences, vocabulaire, objectifs, audience et préférences de plateforme via une migration additive qui ne réinitialise pas un profil déjà édité. Le Music Brain persiste également `label`, `tags`, `description` et une `release_id` facultative pour un morceau créé localement ; son identifiant, son workspace, son projet et son acteur sont résolus côté serveur avant l’écriture. Si une release est explicitement demandée, elle est résolue dans le même workspace et projet, puis une garde `BEFORE INSERT OR UPDATE` en base protège la même invariance ; la migration détache auparavant tout lien historique incompatible. L’audit `track.created` garde seulement l’état et la présence d’une liaison, jamais les métadonnées libres. La Content Library persiste le SHA-256, la clé de stockage privée, les métadonnées, les tags normalisés et les références facultatives `release_id` / `track_id` d’un import local. Ces références sont résolues contre le même workspace et projet, réparées par migration puis protégées par une garde SQL ; l’audit `media.imported` ne conserve que le type et la présence de références. La clé de stockage ne sort jamais du repository. Sa lecture filtrée utilise uniquement `workspace_id`, `status`, `media_type`, nom, description, tags et, si demandées, les références déjà portées par l’asset, avec paramètres SQL liés ; un filtre musical étranger ne peut donc retourner aucun média du workspace. Les recherches tag utilisent `EXISTS` afin d’éviter les doublons et ne sélectionnent jamais `storage_key`. Le registre local `campaigns` contient un brief `DRAFT` avec `release_id` et `track_id` nullables ainsi qu’un `row_version` : projet résolu côté serveur, nom normalisé NFKC, objectif, timestamps, unicité `(workspace_id, normalized_name)`, index `(workspace_id, status, created_at DESC)` et audit redacted. Chaque liaison vérifie transactionnellement le même workspace et le même projet artistique avant d’écrire l’action `campaign.release_*` ou `campaign.track_*` correspondante ; le lien identique est idempotent, tandis qu’une version dépassée n’écrit rien. Les migrations ajoutent ces colonnes sans modifier les briefs existants, qui restent sans release ni morceau par défaut. Dates, piliers et liens de contenu restent absents. La mémoire consentie ajoute `confirmed_by` et `updated_at` par migration additive, démarre exclusivement à `PENDING` et journalise `memory.proposed`, `memory.confirmed` ou `memory.rejected` sans copier le contenu libre dans l’audit. Le Task Center ajoute de façon additive description, timestamps, auteur/instant de finalisation et une échéance nullable ; les écritures contrôlées produisent `task.created` ou `task.completed` sans exposer le texte de la tâche à l’audit. L’Approval Center crée additivement `posts`, `post_variants`, `post_variant_media` et `approvals`, sans réutiliser `scheduled_posts` ; ses décisions contrôlées produisent `post_variant.approved` ou `post_variant.rejected` sans copier le payload éditorial dans l’audit. La planification interne ajoute séparément `internal_post_schedules`, dont le snapshot approuvé est immuable et ne représente aucune livraison externe. Chaque méthode de lecture ou d’écriture applique le `workspace_id` fixé côté serveur ; les paramètres du client ne peuvent pas sélectionner un workspace arbitraire.

Le **Release Registry** local complète `releases` de façon additive avec `tags` et `updated_at`. La création résout le projet, le workspace et l’acteur côté serveur, stocke seulement la fiche de sortie (titre, type, statut, date, label, tags, description), puis écrit `release.created` avec type et état redacted. Elle n’écrit aucune relation automatiquement ; une création ultérieure de track peut choisir cette release par `release_id`, à condition qu’elle reste dans le même workspace et projet. Elle ne crée toujours aucun lien média, campagne ou compte social ; les releases existantes restent intactes et conservent des tags vides par défaut.

La projection locale de rotation ne dérive volontairement pas un score de fraîcheur. Elle utilise l’index partiel des assets `UNUSED` d’un workspace et l’index inverse `post_variant_media(media_asset_id)`, puis exclut tout asset ayant au moins un lien éditorial ; l’absence volontaire de filtre de workspace dans ce `NOT EXISTS` rend une relation anormale conservatrice plutôt que de présenter un média possiblement engagé. Elle ne modifie ni les liens ni les caches d’usage.

Cette implémentation n’est pas encore la base de production : le stockage média et le verrou propriétaire sont locaux, privés et réservés au développement ; il n’y a ni fournisseur d’identité réseau/passkey, ni Device Linking, ni migrations versionnées de production, ni stockage objet, ni scan/quarantaine de fichiers, ni connexion PostgreSQL centralisée. Ces éléments seront introduits et validés avant toute bêta avec données personnelles ou exposition hors boucle locale.

## Vue d’ensemble des relations

```text
User
├──── LocalOwnerCredential [LOCAL_LOCK uniquement]
├──< IdentitySecurityEvent
├──< Membership >── Workspace
│                    ├──< ArtistProject ──< Release ──< Track
│                    │                    └──< MediaAsset >──< MediaTag
│                    │                           └──< PostVariant >── Post
│                    │                                      └──< Approval
│                    ├──< Conversation ──< Message ──< CommandRun
│                    ├──< Memory / Task / ActivityLog / SystemEvent
│                    ├──< Campaign ──< ContentPlan
│                    └──< SocialAccount >── Platform ──< Analytics
└──< ClientInstance
     ├──< IdentitySession ─── LocalAuthSession [LOCAL_LOCK uniquement]
     └──< ClientWorkspaceGrant >── Workspace
```

Un calendrier est une **projection** de releases, publications planifiées, campagnes, tâches et événements manuels. Il ne doit pas dupliquer leurs données dans une table de calendrier générique.

## Tables du MVP

### Identité et périmètre

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `users` | `id`, `email`, `display_name`, `timezone`, `status`, `auth_subject?` | **Statut livré localement ; identité réseau future.** `auth_subject` restera unique lorsqu'un fournisseur sera choisi. Les mots de passe du fournisseur ne sont jamais recopiés. Le verrou local ne s’appuie pas sur `auth_subject`. |
| `workspaces` | `id`, `name`, `timezone`, `locale`, `owner_user_id` | Périmètre racine d’IDA. Le MVP crée un workspace personnel par défaut. |
| `memberships` | `workspace_id`, `user_id`, `role`, `status` | **Livré localement :** relation utilisateur/workspace, unique sur `(workspace_id, user_id)`, avec rôles et statuts contraints. |
| `client_instances` | `id`, `user_id`, `display_name`, `kind`, `platform`, `status`, `revoked_at?`, timestamps | **Livré localement :** une ligne par navigateur, PWA ou application native ; cohérence révocation/état contrainte. Aucune clé privée n'est stockée. |
| `identity_sessions` | `id`, `user_id`, `client_instance_id`, `status`, `issued_at`, `expires_at`, `revoked_at?` | **Livré localement :** FK composée vers le propriétaire de l'instance, durée cohérente et révocation contrôlée. En `LOCAL_LOCK`, porte l’échéance absolue de 8 heures ; aucun token n’est stocké dans cette table. Les authenticators multi-appareils restent futurs. |
| `local_owner_credentials` | `user_id`, `algorithm`, `salt`, `verifier`, paramètres scrypt, `failed_attempts`, `retry_after?`, timestamps | **Livré en opt-in local uniquement :** conserve `SCRYPT_V1` salé avec paramètres contraints (`N=131072`, `r=8`, `p=1`, 32 octets), jamais la passphrase. Le compteur et `retry_after` portent le backoff exponentiel de déverrouillage. Ne sert pas au Device Linking futur. |
| `local_auth_sessions` | `session_id`, `token_digest`, `status`, `idle_expires_at`, `last_seen_at`, `revoked_at?`, `created_at` | **Livré en opt-in local uniquement :** extension 1:1 de `identity_sessions`; conserve seulement le SHA-256 hexadécimal du token opaque. Inactivité glissante de 30 minutes, sans dépasser l’échéance absolue ; une session révoquée ou expirée ne peut redevenir active. |
| `identity_security_events` | `id`, `user_id`, `client_instance_id?`, `event_type`, `outcome`, `created_at` | **Livré localement :** événements bornés de création du credential, unlock, expiration et révocation. Aucun payload libre, IP, user-agent, token ou dérivé de passphrase. Le chemin applicatif est insertion seule, sans prétendre offrir encore un support WORM/immuable de production. |
| `client_workspace_grants` | `client_instance_id`, `user_id`, `workspace_id`, `access_level`, `status`, `granted_by`, timestamps | **Livré localement :** FK composée vers l'instance et la membership ; `TRUSTED`, `LIMITED` ou `VIEW_ONLY` ne peut que réduire les droits. |

### Artist Brain et règles éditoriales

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `artist_projects` | `id`, `workspace_id`, `name`, `kind`, `status`, `description` | Artiste, alias, label ou projet créatif. Unique sur `(workspace_id, name)` parmi les lignes non supprimées. |
| `artist_profiles` | `id`, `artist_project_id`, `identity`, `genres`, `influences`, `audience`, `goals`, `platform_preferences` | Profil structuré de l’Artist Brain. Relation 1:1 avec `artist_projects` au MVP. Certains champs peuvent être `jsonb` versionné, mais doivent rester éditables et documentés. |
| `editorial_rules` | `id`, `artist_project_id`, `scope`, `rule_type`, `value`, `priority`, `is_active` | Ton, vocabulaire préféré/interdit, CTA, fréquence et restrictions. Une règle est explicitement activable/désactivable. |
| `memories` | `id`, `workspace_id`, `artist_project_id?`, `category`, `content`, `state`, `source_message_id?`, `confirmed_by?`, `confirmed_at?`, `created_at`, `updated_at` | Mémoire durable proposée, confirmée ou refusée. Une conversation n’est pas une mémoire par défaut ; une préférence passe obligatoirement par `PENDING`. |

Les catégories de `memories` sont : `ARTIST_MEMORY`, `CONTENT_MEMORY`, `CAMPAIGN_MEMORY`, `SOCIAL_MEMORY`, `PREFERENCE_MEMORY`, `SYSTEM_MEMORY`.

Les transitions de consentement actuelles sont uniquement `PENDING → CONFIRMED` et `PENDING → REJECTED`. Toute décision finale est immuable ; les trois actions produisent un `activity_logs` append-only distinct et les lectures restent filtrées par `workspace_id`.

### Catalogue musical

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `releases` | `id`, `workspace_id`, `artist_project_id`, `title`, `release_type`, `release_date?`, `label?`, `status`, `tags`, `description?`, `created_at`, `updated_at` | **Livré localement :** fiche de release (single, EP, album, etc.) isolée au workspace. `release_date` peut être inconnue. `POST /v1/releases` ne crée encore aucune association de track, média, campagne ou lien externe. |
| `tracks` | `id`, `workspace_id`, `artist_project_id`, `release_id?`, `title`, `artist_credit`, `genre`, `bpm`, `musical_key`, `release_date?`, `label`, `status`, `description` | Morceau, démo ou master. `bpm` est contraint à une valeur positive réaliste ; `release_id` est facultatif pour les unreleased et, lorsqu’elle est définie à la création, doit référencer une release du même workspace et projet. La FK assure l’existence ; un trigger assure ce scope composé. |

États de `releases` : `DRAFT`, `SCHEDULED`, `RELEASED`, `ARCHIVED`. États de `tracks` : `DEMO`, `UNRELEASED`, `SCHEDULED`, `RELEASED`, `ARCHIVED`.

### Bibliothèque média / DAM

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `media_assets` | `id`, `workspace_id`, `artist_project_id?`, `release_id?`, `track_id?`, `filename`, `media_type`, `mime_type`, `byte_size`, `sha256`, `storage_key`, `created_at_source?`, `status`, `description`, `usage_count`, `last_used_at` | Métadonnées d’un fichier. `sha256` est calculé côté serveur ou worker après upload ; unique sur `(workspace_id, sha256)` pour détecter les doublons exacts. Dans le runtime local, les références directes facultatives sont admises seulement à l’import et doivent partager le même workspace et projet. |
| `media_tags` | `id`, `workspace_id`, `name`, `normalized_name` | Tag réutilisable. Unique sur `(workspace_id, normalized_name)`. |
| `media_asset_tags` | `media_asset_id`, `media_tag_id` | Relation n:n asset/tag, clé primaire composée ; index inverse `(media_tag_id, media_asset_id)` pour les filtres par tag. |

États de `media_assets` : `UNUSED`, `USED`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`.

Le runtime local utilise volontairement les champs directs `release_id` et `track_id` plutôt que des tables n:n : il couvre un contexte musical explicite au moment de l’import, sans prétendre modéliser encore toutes les associations possibles. Une migration future vers `media_asset_tracks` et `media_asset_releases` devra préserver les règles de scope, l’audit et les contrats de lecture avant d’autoriser plusieurs liens.

`usage_count` et `last_used_at` sont des caches de consultation. Leur source de vérité est l’historique des liens `post_variant_media` et des livraisons publiées. La projection locale `GET /v1/content/rotation` ne les consulte pas : elle ne distingue pour l’instant que les assets `UNUSED` sans lien. Le futur score de fraîcheur est calculé par service selon les usages, dates, plateformes et règles éditoriales ; il ne doit pas devenir une donnée figée au départ.

### Conversations, IDA Core et traçabilité

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `conversations` | `id`, `workspace_id`, `user_id`, `title`, `last_message_at`, `archived_at?` | Historique synchronisé entre desktop et mobile. |
| `messages` | `id`, `conversation_id`, `role`, `content`, `attachments_json`, `created_at` | Messages `USER`, `ASSISTANT`, `TOOL`, `SYSTEM`. Les secrets et payloads sensibles ne sont jamais ajoutés à `content`. |
| `command_runs` | Runtime local : `id`, `workspace_id`, `actor_user_id`, `input_message`, `response_message`, `intent`, `state`, `requested_permission`, `created_at`, `completed_at` | Registre privé, borné et uniquement local des paires de messages `READ / COMPLETED` du même acteur/workspace. La cible de production pourra le relier à une conversation, des agents et des exécutions d’outil via des tables séparées. |
| `prompts` | `id`, `key`, `version`, `purpose`, `template`, `is_active` | Versionne les prompts contrôlés par le produit. Unique sur `(key, version)`. |
| `agent_runs` | `id`, `command_run_id`, `agent_key`, `input_summary`, `output_summary`, `state`, `duration_ms` | Journalise le routage sans donner de pouvoir direct aux agents. |
| `tools` | `id`, `key`, `version`, `permission_level`, `input_schema_version`, `is_active` | Catalogue déclaratif des outils autorisés. Le code reste la source de vérité des implémentations. |
| `tool_executions` | `id`, `command_run_id`, `tool_id`, `state`, `idempotency_key`, `input_redacted`, `output_redacted`, `error_code?` | Preuve d’appel d’outil et gestion des retries. Clé unique sur l’idempotence pertinente. |
| `activity_logs` | Runtime local : `id`, `workspace_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `payload`, `created_at` | Journal append-only pour audit, diagnostic et explication des actions d’IDA. Le `payload` reste interne ; il n’est pas une réponse API. Une évolution de production pourra ajouter des métadonnées redacted, corrélation et acteurs système sans modifier la projection utilisateur. |
| `system_events` | `id`, `workspace_id?`, `component`, `severity`, `code`, `message`, `details_redacted`, `resolved_at?` | État et incidents : IA, stockage, scheduler, intégrations. |

États de `command_runs` : `RECEIVED`, `UNDERSTOOD`, `PLANNED`, `AWAITING_APPROVAL`, `EXECUTING`, `COMPLETED`, `FAILED`, `CANCELLED`. Le runtime local n’écrit et ne liste pour l’instant que `COMPLETED`.

Dans le runtime local, `GET /v1/activity-logs` n’est pas un accès brut à `activity_logs` : il projette seulement `id`, `action`, `entity_type`, `entity_id` et `created_at`, dans le workspace résolu côté serveur. Son allowlist couvre les actions Phase 1 des campagnes, releases, tracks, médias, mémoires, variantes de post et tâches ; les actions inconnues ou futures, dont Finance/Banque, ne sont pas visibles par défaut. Le `payload`, l’acteur et le workspace ne sont jamais sélectionnés pour cette réponse, et une lecture n’ajoute pas d’événement d’audit.

Dans ce même runtime, `command_runs` garde au plus 4&nbsp;000 caractères pour la demande et la réponse affichable d’IDA. Aucun résultat détaillé d’outil, paramètre, prompt, payload externe, trace de modèle ou contenu de mémoire n’est enregistré. L’index `(workspace_id, actor_user_id, created_at DESC, id DESC)` sert à la pagination par cléset ; la valeur de curseur interne conserve les microsecondes afin que deux commandes proches ne soient ni perdues ni répétées. Une écriture réussie produit l’audit redacted `command.completed` avec seulement intention, état et permission ; cette action n’est pas visible dans la projection utilisateur. Le registre reste distinct de la future conversation complète et ne constitue jamais une mémoire durable.

### Contenu, approbation, calendrier et tâches

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `campaigns` | `id`, `workspace_id`, `artist_project_id`, `release_id?`, `track_id?`, `name`, `normalized_name`, `objective`, `status`, `row_version`, `created_at`, `updated_at` | **Livré localement :** brief créatif `DRAFT` isolé par workspace, nom normalisé unique, liens optionnels à une release et un morceau du même workspace/projet, et audit redacted. `row_version` protège les rattachements concurrents. Dates, piliers et liens de contenu restent futurs. |
| `campaign_pillars` | `id`, `campaign_id`, `name`, `description`, `sort_order` | Teaser, studio, artwork, live, social proof, reminder. |
| `content_plans` | `id`, `workspace_id`, `artist_project_id`, `campaign_id?`, `period_start`, `period_end`, `plan_type`, `status`, `rationale` | Plan quotidien, hebdomadaire ou de campagne. |
| `content_plan_items` | `id`, `content_plan_id`, `planned_at?`, `objective`, `status`, `post_id?` | Élément de plan, lié à un post lorsqu’il est matérialisé. |
| `posts` | `id`, `workspace_id`, `artist_project_id`, `campaign_id?`, `content_plan_item_id?`, `title`, `objective`, `status`, `rationale` | Unité créative transverse, pouvant posséder plusieurs variantes plateformes. |
| `post_variants` | `id`, `workspace_id`, `post_id`, `platform_id`, `caption`, `hashtags_json`, `cta`, `planned_at?`, `timezone`, `approval_state`, `delivery_state`, `payload_hash` | Variante Instagram, TikTok, YouTube, etc. La tranche locale nomme la date `planned_at` pour éviter de la confondre avec une programmation effective. `payload_hash` lie l’approbation au contenu exact. |
| `post_variant_media` | `post_variant_id`, `media_asset_id`, `workspace_id`, `sort_order` | Médias attachés à une variante, ordonnés. Les écritures locales vérifient que variante, post et média partagent le même workspace. L’index inverse `(media_asset_id)` sert aussi à exclure factuellement un média déjà lié de la rotation locale. |
| `post_variant_tracks` | `post_variant_id`, `track_id` | Morceaux utilisés dans une variante. |
| `approvals` | `id`, `workspace_id`, `post_variant_id`, `state`, `requested_at`, `decided_at?`, `decided_by?`, `payload_hash`, `comment?` | Décision humaine immuable après `REQUESTED`. Une édition qui modifie le hash crée une nouvelle approbation. L’index partiel local interdit plus d’une demande `REQUESTED` active par variante. |
| `internal_post_schedules` | `id`, `workspace_id`, `post_variant_id`, `approval_id`, `approved_payload_hash`, `scheduled_at`, `timezone`, `platform_id`, `state`, `created_by`, `created_at`, `cancelled_by?`, `cancelled_at?` | Snapshot de calendrier interne distinct de `scheduled_posts`. États `SCHEDULED` ou `CANCELLED`; la date, le fuseau, l’approbation et le hash sont immuables. Index partiels : au plus un snapshot actif par variante et un créneau actif par `(workspace_id, platform_id, scheduled_at)`. Ce modèle ne crée pas de livraison. |
| `publication_deliveries` | `id`, `post_variant_id`, `social_account_id?`, `external_post_id?`, `state`, `attempt_count`, `last_attempt_at?`, `published_at?`, `error_code?` | Livraison effective vers une plateforme, à introduire avec les connecteurs sociaux. |
| `calendar_events` | `id`, `workspace_id`, `artist_project_id?`, `kind`, `title`, `starts_at`, `ends_at?`, `timezone`, `status` | Événement manuel : studio, concert, rendez-vous, échéance. |
| `tasks` | `id`, `workspace_id`, `artist_project_id?`, `campaign_id?`, `title`, `description?`, `status`, `due_at?`, `assigned_to?`, `completed_by?`, `completed_at?`, `created_at`, `updated_at` | Tâche interne, hors calendrier personnel avancé. Les nouvelles tables contraignent `status` à `TODO`, `IN_PROGRESS`, `DONE` ou `CANCELLED`. |

États recommandés :

```text
Post             DRAFT → PROPOSED → APPROVED | CHANGES_REQUESTED | REJECTED
Approval         REQUESTED → APPROVED | REJECTED | INVALIDATED
Delivery         NOT_CONFIGURED → SCHEDULED → PUBLISHING → PUBLISHED | FAILED | CANCELLED
Campaign         DRAFT → ACTIVE → PAUSED | COMPLETED | ARCHIVED
Content plan     DRAFT → PROPOSED → APPROVED | ARCHIVED
Task             TODO → IN_PROGRESS → DONE | CANCELLED
```

Dans la tranche locale, `POST /tasks/:taskId/complete` réalise seulement `TODO|IN_PROGRESS → DONE`. Un retry sur `DONE` est idempotent et ne produit ni nouvel audit ni nouveau timestamp ; `CANCELLED` reste non actionnable. Les tâches sans `due_at` ne sont pas projetées dans Today, mais restent consultables dans le Task Center.

Dans la tranche locale Campaign Brief, `release_id` et `track_id` sont nullables et référencés pour l’intégrité d’existence. Une garde `BEFORE INSERT OR UPDATE` impose aussi, directement en base, que chaque référence Music Brain partage `workspace_id` et `artist_project_id` avec la campagne ; la migration locale détache les anciens liens incompatibles avant d’activer cette garde. `PATCH /v1/campaigns/:campaignId/release` et `PATCH /v1/campaigns/:campaignId/track` refont cette vérification pour retourner un `404` générique contrôlé plutôt qu’une erreur SQL. Chaque corps apporte seulement son identifiant (ou `null`) et `expectedVersion`; les deux mutations utilisent le même `row_version`, incrémenté avec `updated_at` lors d’un changement effectif. La migration normalise puis rétablit la contrainte `row_version > 0`. Un même lien déjà présent est retourné sans nouvelle écriture ou audit, tandis qu’une version dépassée répond `409 CAMPAIGN_STALE`. Ces liens ne modifient ni statut, ni dates, ni contenu, ni ressource extérieure.

Dans la tranche locale Approval Center, seuls les seeds internes créent `posts`, variantes, liens média et approbations. `GET /v1/approvals/queue` lit exclusivement les couples `Approval/Variant` encore `REQUESTED` du workspace serveur. Le hash canonique couvre le titre, objectif, rationale éventuelle, plateforme, texte, hashtags ordonnés, CTA, date proposée, fuseau et médias ordonnés. Au démarrage, une migration additive recalcule uniquement les hashes des demandes encore `REQUESTED` afin de rendre compatibles les seeds locaux d’une version antérieure ; elle ne touche ni décision terminale, ni timestamp métier, ni audit. Une décision remplace atomiquement cet état par `APPROVED` ou `REJECTED`, fixe l’acteur et l’instant de décision, puis ajoute un audit append-only. Elle conserve strictement `delivery_state = NOT_CONFIGURED`, ne modifie ni `scheduled_posts` ni les compteurs/statuts de `media_assets`, et ne crée aucun job de publication. Une tentative avec hash obsolète ou approbation non correspondante ne modifie rien ; un retry de même décision ne réécrit ni la ligne ni l’audit.

La tranche Calendrier ajoute `internal_post_schedules` sans migration destructive ni seed de publication. Lors d’une écriture, le serveur copie exclusivement `planned_at` et `timezone` du payload `APPROVED` courant dans un snapshot avec `approval_id` et `approved_payload_hash`; aucun champ de ce snapshot ne peut être réécrit, y compris par une requête SQL interne. Les index partiels empêchent deux snapshots `SCHEDULED` pour une même variante ou pour la même plateforme au même instant dans un workspace. Une annulation contrôlée ne peut effectuer qu’une transition atomique `SCHEDULED → CANCELLED`, fixe une fois `cancelled_by` / `cancelled_at`, reste idempotente au retry et libère les index actifs sans réécrire le snapshot. La migration ajoute les colonnes et la contrainte d’annulation à une base locale existante ; le trigger bloque ensuite toute réactivation ou réécriture de la preuve d’annulation. La projection calendrier relit le hash canonique et l’approbation à chaque requête : un snapshot invalidé n’est pas affiché, et une variante n’est candidate que si elle est `APPROVED`, datée dans la fenêtre et sans snapshot actif valide. `scheduled_posts`, `post_variants.delivery_state`, approvals, médias, jobs et connecteurs restent inchangés. Les audits append-only `post_variant.internal_scheduled` et `post_variant.internal_schedule_cancelled` ne contiennent que des identifiants et états nécessaires.

Une approbation `APPROVED` n’autorise que le `payload_hash`, le compte, la plateforme et l’horaire validés. Toute modification significative l’invalide. Dans le MVP, `PUBLISH` demande toujours une action humaine explicite.

### Réseaux sociaux et analytics

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `platforms` | `id`, `key`, `name`, `is_active` | Référentiel : Instagram, TikTok, YouTube, Facebook, etc. `key` unique. |
| `platform_capabilities` | `id`, `platform_id`, `version`, `oauth_supported`, `draft_supported`, `schedule_supported`, `publish_supported`, `analytics_supported`, `notes`, `verified_at` | Matrice de capacités vérifiées par documentation officielle. |
| `social_accounts` | `id`, `workspace_id`, `platform_id`, `external_account_id`, `display_name`, `status`, `scopes_json`, `token_expires_at?`, `last_checked_at?`, `last_error_code?` | Un compte connecté. Unique sur `(platform_id, external_account_id)` lorsque la politique produit le permet. |
| `social_credentials` | `id`, `social_account_id`, `ciphertext`, `nonce`, `key_reference`, `expires_at?`, `rotated_at?`, `revoked_at?` | Jetons OAuth chiffrés et séparés des données de compte. Aucune valeur en clair dans les logs ou réponses API. |
| `analytics_syncs` | `id`, `social_account_id`, `scope`, `started_at`, `completed_at?`, `state`, `cursor?`, `error_code?` | Synchronisation d’analytics, utile pour diagnostic et reprise. |
| `analytics` | `id`, `workspace_id`, `social_account_id?`, `post_variant_id?`, `metric_name`, `metric_value`, `period_start`, `period_end`, `granularity`, `source_payload_json?`, `captured_at` | Métriques normalisées et provenance. Indexes temporels obligatoires. |

Les payloads bruts d’analytics doivent être minimisés, retenus selon une politique claire et séparés de l’interface utilisateur. Les définitions de métriques ne sont pas universelles entre plateformes.

### Notifications et travaux asynchrones

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `notifications` | `id`, `workspace_id`, `user_id?`, `type`, `title`, `body`, `state`, `entity_type?`, `entity_id?` | Notifications in-app ; les canaux push/email seront des adapters ultérieurs. |
| `outbox_events` | `id`, `workspace_id`, `event_type`, `payload_redacted`, `state`, `available_at`, `processed_at?` | Transactional outbox pour les effets asynchrones. À créer avant les publications réelles. |
| `jobs` | `id`, `kind`, `state`, `payload_redacted`, `attempts`, `run_at`, `locked_at?`, `completed_at?` | Scheduler, analyse média, synchronisation analytics et notifications. |

La présence d’une ligne `local_owner_credentials` force le mode effectif `LOCAL_LOCK` au démarrage ; elle ne peut pas être ignorée par une configuration `LOCAL_DEMO`. La résolution passive utilisée par l’état du verrou vérifie les échéances sans mettre à jour `last_seen_at` ni `idle_expires_at`.

### Révocation locale définitive

`revokeLocalAuthSessionsForClient` traite le verrouillage explicite de l’instance locale fixée côté serveur. Une instruction SQL commune révoque ses sessions locales et Identity avec audit idempotent ; les sessions techniques et les autres instances restent intactes. Le cookie peut être absent ou obsolète : la cible ne dépend pas de la réception de la dernière réponse d’unlock.

Les triggers de changement de statut sur `users`, `client_instances`, `memberships` et `client_workspace_grants` révoquent transactionnellement les sessions `LOCAL_LOCK` dont l’autorisation devient inactive, avec un événement `LOCAL_SESSION_REVOKED` idempotent par session. Ils ne révoquent pas les sessions techniques `LOCAL_DEMO`. Une annulation de transaction annule aussi la révocation et l’événement. La migration répare les sessions historiques encore actives sous une autorisation inactive.

Des gardes `BEFORE UPDATE` interdisent `REVOKED → ACTIVE` dans `local_auth_sessions` et dans ses `identity_sessions` associées. Réactiver un appareil ou grant exige donc un nouveau token. Les autres instances autorisées, y compris celles du même propriétaire, conservent leur propre session et leurs droits restreints.

Limite volontaire du profil mono-workspace : la session locale ne porte pas de `workspace_id` propre. Un grant ou une membership inactive révoque donc conservativement les sessions locales de l’instance/utilisateur associés, même si un autre grant reste actif. Avant le login multi-workspaces, définir explicitement la portée de session ; ne pas alléger ces gardes sans tests d’isolation. Les migrations/accès SQL privilégiés ne sont pas une interface de gestion d’appareil et ne remplacent pas les futurs endpoints contrôlés.

## Relations, contraintes et index indispensables

- `workspaces 1:n memberships`, `users 1:n memberships`; une seule adhésion par utilisateur et workspace.
- `workspaces 1:n artist_projects`, puis `artist_projects 1:n releases/tracks/campaigns/content_plans/posts`.
- `releases 1:n tracks` mais `tracks.release_id` reste nullable pour les démos et unreleased. Une liaison explicite est autorisée seulement à la création d’un track et reste dans le même workspace et projet artistique.
- `campaigns 0..1 release` via `release_id` et `campaigns 0..1 track` via `track_id`; les FK garantissent l’existence et une garde de base vérifie l’égalité de workspace et de projet artistique, y compris pour les écritures SQL futures. Le write path refait ces contrôles pour préserver des erreurs API non révélatrices. `row_version > 0` et le compare-and-swap protègent les rattachements concurrents desktop/mobile.
- `media_assets 0..1 release` et `0..1 track` via les champs directs locaux, chaque référence devant partager workspace et projet avec l’asset ; tags restent n:n. Une future extension n:n migrera ces deux références sans champ polymorphique `entity_type/entity_id`.
- `posts 1:n post_variants`; une variante est unique sur `(post_id, platform_id)` au MVP. La table locale porte aussi `workspace_id` pour vérifier chaque jointure de décision avec le post parent.
- `post_variants n:n media_assets` et `n:n tracks`; une livraison est liée à une seule variante. La tranche locale ne crée que le lien média, jamais une livraison.
- `platforms 1:n social_accounts`, `social_accounts 1:n analytics_syncs/analytics`.
- Index minimum sur chaque `(workspace_id, created_at DESC)` et `(workspace_id, status)` lorsque le statut est filtré.
- Index local sur `local_auth_sessions(status, idle_expires_at)` pour l’état/expiration et sur `identity_security_events(user_id, created_at DESC)` pour la revue chronologique bornée.
- La timeline locale utilise aussi `activity_logs(workspace_id, created_at DESC, id DESC)` pour sa pagination par cléset stable ; l’index ne donne accès ni au payload ni à un autre workspace.
- Index sur `tracks(artist_project_id, release_date)`, `releases(artist_project_id, release_date)`, `post_variants(platform_id, scheduled_at)`, `analytics(social_account_id, captured_at DESC)`, `media_assets(workspace_id, sha256)` et `media_asset_tags(media_tag_id, media_asset_id)`.
- Recherche plein texte PostgreSQL sur titres, descriptions et noms de tags. Les embeddings sont une extension, non un prérequis.
- Ajouter une colonne `row_version` ou utiliser ETag/`updated_at` pour les modifications concurrentes depuis desktop et mobile.

## Suppression, rétention et sauvegarde

- Suppression logique : `artist_projects`, `releases`, `tracks`, `media_assets`, `posts`, `campaigns`, `tasks`, `memories` si le produit doit permettre une restauration.
- Pas de suppression logique des `approvals`, `internal_post_schedules`, `activity_logs`, `tool_executions`, `publication_deliveries`, `system_events` et `identity_security_events` : ces tables conservent l’audit. La table locale d’événements n’est toutefois pas encore protégée par un support WORM ou une politique de rétention de production.
- Les jetons OAuth sont révoqués/chiffrés et purgés selon la politique de sécurité ; ils ne sont pas archivés dans les sauvegardes applicatives lisibles.
- Les politiques de rétention, export et effacement doivent être précisées avant la mise en production.

## Extensions prévues, non implémentées

Ces tables ne font pas partie du MVP. Elles sont documentées pour préserver les frontières du noyau sans créer de fonctionnalités prématurées.

### Finance et Banque

| Table future | Finalité |
|---|---|
| `finance_connections` | Connexion consentie à un agrégateur bancaire ; conserve uniquement les références externes et états, jamais des identifiants bancaires. |
| `financial_accounts` | Comptes bancaires ou de paiement référencés par l’agrégateur. |
| `financial_transactions` | Transactions importées, catégorisées et soumises à rétention/consentement renforcés. |
| `budgets` / `budget_lines` | Budgets personnels ou projets artistiques. |
| `finance_rules` | Règles de catégorisation explicites et révisables. |

Ces données exigent un consentement séparé, un fournisseur agréé, un chiffrement renforcé, des scopes lecture seule par défaut et une politique de conservation dédiée. Aucun outil financier ne doit être branché au système d’action d’IDA sans une phase de sécurité et conformité propre.

### Courses (liste de courses)

| Table future | Finalité |
|---|---|
| `shopping_lists` | Liste de courses personnelle ou par projet. |
| `shopping_items` | Article, quantité, unité, statut, note et priorité. |
| `shopping_preferences` | Préférences alimentaires, enseignes, budget ou récurrence explicitement confirmés. |
| `shopping_price_observations` | Prix éventuellement importés plus tard, avec source et date. |

Ce module reste indépendant de la musique. Il réutilisera uniquement le socle `workspace`, `tasks`, `memory`, `activity_logs`, notifications et outils autorisés.

### Agent Registry et Module Registry

| Table future | Finalité |
|---|---|
| `module_registry` | Modules fonctionnels activables : musique, contenu, finance, courses, documents, etc. |
| `module_versions` | Version et migration de configuration par module. |
| `module_capabilities` | Capacités déclarées et permissions requises. |
| `agent_registry` | Métadonnées d’agents connus : clé, module propriétaire, statut, version et contrat. |
| `agent_versions` | Versions d’instructions et de schémas d’entrée/sortie. |

Le registre n’exécute jamais du code stocké en base. Les modules et agents sont livrés par du code revu et signé ; la base enregistre seulement leur disponibilité, configuration et état. Cela évite de transformer IDA en plateforme de plugins non sécurisée avant d’en avoir le besoin.

## Évolution contrôlée

### Instantané local identité et contexte musical

`LocalMusicContextAuthority` exécute le résolveur Identity existant et la projection `MusicContextStore` dans la même transaction brève `REPEATABLE READ, READ ONLY`. Un paramètre interne `reader` facultatif de `resolveRequestIdentityContext` accepte le lecteur transactionnel ; omis, tous les anciens appels utilisent toujours `this.pglite`. Aucune nouvelle table, migration ou modification des données utilisateur dans cette tranche.

Cette composition exige une session locale réelle et ne prolonge pas l'inactivité. Elle compare les faits courants à ceux sélectionnés avant l'inférence et avant restitution. Ni réseau ni audit dans la transaction. Un snapshot SQL cohérent n'est pas un verrou global sur un modèle externe : voir limites et tests dans [MUSIC_PROPOSALS.md](docs/MUSIC_PROPOSALS.md).

### Dates des nouvelles données de démonstration

L’amorçage reçoit l’horloge `DemoDatabaseOptions.now`, partagée avec `CreateAppOptions.now` et évaluée une seule fois pour le seed. `getDemoDates` calcule à partir du jour UTC de référence : teaser studio à J+2 18:00 UTC, hook à J+4 17:30 UTC et release/morceau associés à J+19. Les horaires sont stockés en UTC et présentés dans le fuseau du workspace ; ils ne garantissent pas une heure locale identique été/hiver. Les exemples historiques et les données d’isolation restent fixes.

Les hashes sont calculés après ces dates. Tous les inserts concernés restent `ON CONFLICT DO NOTHING` : aucun post, approbation, snapshot, morceau ou release existant n’est redaté au redémarrage. Aucun rattrapage ni migration de données utilisateur n’est effectué. Les tests injectent leur horloge historique lorsque nécessaire et vérifient les changements de mois/année ainsi que le redémarrage avec des décisions persistées. Les anciennes bases conservent leurs anciennes dates, y compris leur refus de planification si elles sont passées.

La future extension d’IDA doit ajouter un module métier, ses tables, ses outils, ses permissions et ses événements ; elle ne doit pas contourner le noyau. Les invariants qui restent constants sont : `workspace`, identité, politique d’autorisation, audit, mémoire consentie, contrats API et séparation entre proposition IA et effet externe.
