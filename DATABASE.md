# IDA — Modèle de données

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

L’API utilise actuellement **PGlite** dans `apps/api/.data/` pour les tests et l’exécution locale. Cette base est ignorée par Git et est initialisée avec un workspace de démonstration ; elle ne reçoit ni données réelles, ni secrets, ni tokens sociaux.

Les tables minimales actuellement créées couvrent l’identité de démonstration, workspaces et memberships, projets/profils artistiques, releases, tracks, médias/tags, mémoires, plateformes sociales, tâches et posts planifiés. L’Artist Brain local persiste identité, ton, genres, influences, vocabulaire, objectifs, audience et préférences de plateforme via une migration additive qui ne réinitialise pas un profil déjà édité. Chaque méthode de lecture ou d’écriture du repository applique le `workspace_id` fixé côté serveur ; les paramètres du client ne peuvent pas sélectionner un workspace arbitraire.

Cette implémentation n’est pas encore la base de production : il n’y a pas de fournisseur d’identité réel, de migrations versionnées de production, de stockage média, ni de connexion PostgreSQL centralisée. Ces éléments seront introduits ensemble avant toute bêta avec données personnelles.

## Vue d’ensemble des relations

```text
User ──< Membership >── Workspace ──< ArtistProject ──< Release ──< Track
                              │                 │             │
                              │                 └──< MediaAsset >──< MediaTag
                              │                         │
                              │                         └──< PostVariant >── Post
                              │                                      │            │
                              │                                      └──< Approval │
                              │                                                   │
                              ├──< Conversation ──< Message ──< CommandRun      │
                              ├──< Memory / Task / ActivityLog / SystemEvent    │
                              ├──< Campaign ──< ContentPlan                     │
                              └──< SocialAccount >── Platform ──< Analytics     │
```

Un calendrier est une **projection** de releases, publications planifiées, campagnes, tâches et événements manuels. Il ne doit pas dupliquer leurs données dans une table de calendrier générique.

## Tables du MVP

### Identité et périmètre

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `users` | `id`, `email`, `display_name`, `timezone`, `auth_subject` | Compte authentifié. `email` et `auth_subject` sont uniques. Les identifiants et mots de passe du fournisseur d’identité ne sont jamais recopiés. |
| `workspaces` | `id`, `name`, `timezone`, `locale`, `owner_user_id` | Périmètre racine d’IDA. Le MVP crée un workspace personnel par défaut. |
| `memberships` | `workspace_id`, `user_id`, `role`, `status` | Relation utilisateur/workspace. Unique sur `(workspace_id, user_id)`. Les rôles initiaux : `OWNER`, `EDITOR`, `VIEWER`. |

### Artist Brain et règles éditoriales

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `artist_projects` | `id`, `workspace_id`, `name`, `kind`, `status`, `description` | Artiste, alias, label ou projet créatif. Unique sur `(workspace_id, name)` parmi les lignes non supprimées. |
| `artist_profiles` | `id`, `artist_project_id`, `identity`, `genres`, `influences`, `audience`, `goals`, `platform_preferences` | Profil structuré de l’Artist Brain. Relation 1:1 avec `artist_projects` au MVP. Certains champs peuvent être `jsonb` versionné, mais doivent rester éditables et documentés. |
| `editorial_rules` | `id`, `artist_project_id`, `scope`, `rule_type`, `value`, `priority`, `is_active` | Ton, vocabulaire préféré/interdit, CTA, fréquence et restrictions. Une règle est explicitement activable/désactivable. |
| `memories` | `id`, `workspace_id`, `artist_project_id?`, `category`, `content`, `state`, `source_message_id?`, `confirmed_by?` | Mémoire durable proposée ou confirmée. Voir les états plus bas. Une conversation n’est pas une mémoire par défaut. |

Les catégories de `memories` sont : `ARTIST_MEMORY`, `CONTENT_MEMORY`, `CAMPAIGN_MEMORY`, `SOCIAL_MEMORY`, `PREFERENCE_MEMORY`, `SYSTEM_MEMORY`.

### Catalogue musical

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `releases` | `id`, `workspace_id`, `artist_project_id`, `title`, `release_type`, `release_date`, `label`, `status`, `description` | Release, EP, single ou compilation. `release_date` peut être inconnue pour un projet en préparation. |
| `tracks` | `id`, `workspace_id`, `artist_project_id`, `release_id?`, `title`, `artist_credit`, `genre`, `bpm`, `musical_key`, `release_date?`, `label`, `status`, `description` | Morceau, démo ou master. `bpm` est contraint à une valeur positive réaliste ; `release_id` est facultatif pour les unreleased. |

États de `tracks` : `DEMO`, `UNRELEASED`, `SCHEDULED`, `RELEASED`, `ARCHIVED`.

### Bibliothèque média / DAM

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `media_assets` | `id`, `workspace_id`, `artist_project_id?`, `filename`, `media_type`, `mime_type`, `byte_size`, `sha256`, `storage_key`, `created_at_source?`, `status`, `description`, `usage_count`, `last_used_at` | Métadonnées d’un fichier. `sha256` est calculé côté serveur ou worker après upload ; unique sur `(workspace_id, sha256)` pour détecter les doublons exacts. |
| `media_tags` | `id`, `workspace_id`, `name`, `normalized_name` | Tag réutilisable. Unique sur `(workspace_id, normalized_name)`. |
| `media_asset_tags` | `media_asset_id`, `media_tag_id` | Relation n:n asset/tag, clé primaire composée. |
| `media_asset_tracks` | `media_asset_id`, `track_id` | Relation n:n média/morceau ; évite de limiter un asset à un seul titre. |
| `media_asset_releases` | `media_asset_id`, `release_id` | Relation n:n média/release. |

États de `media_assets` : `UNUSED`, `USED`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`.

`usage_count` et `last_used_at` sont des caches de consultation. Leur source de vérité est l’historique des liens `post_variant_media` et des livraisons publiées. Le score de fraîcheur est calculé par service selon les usages, dates, plateformes et règles éditoriales ; il ne doit pas devenir une donnée figée au départ.

### Conversations, IDA Core et traçabilité

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `conversations` | `id`, `workspace_id`, `user_id`, `title`, `last_message_at`, `archived_at?` | Historique synchronisé entre desktop et mobile. |
| `messages` | `id`, `conversation_id`, `role`, `content`, `attachments_json`, `created_at` | Messages `USER`, `ASSISTANT`, `TOOL`, `SYSTEM`. Les secrets et payloads sensibles ne sont jamais ajoutés à `content`. |
| `command_runs` | `id`, `workspace_id`, `conversation_id?`, `source_message_id?`, `intent`, `state`, `input_snapshot`, `result_snapshot`, `correlation_id` | Exécution d’une commande naturelle et lien vers les agents/outils appelés. |
| `prompts` | `id`, `key`, `version`, `purpose`, `template`, `is_active` | Versionne les prompts contrôlés par le produit. Unique sur `(key, version)`. |
| `agent_runs` | `id`, `command_run_id`, `agent_key`, `input_summary`, `output_summary`, `state`, `duration_ms` | Journalise le routage sans donner de pouvoir direct aux agents. |
| `tools` | `id`, `key`, `version`, `permission_level`, `input_schema_version`, `is_active` | Catalogue déclaratif des outils autorisés. Le code reste la source de vérité des implémentations. |
| `tool_executions` | `id`, `command_run_id`, `tool_id`, `state`, `idempotency_key`, `input_redacted`, `output_redacted`, `error_code?` | Preuve d’appel d’outil et gestion des retries. Clé unique sur l’idempotence pertinente. |
| `activity_logs` | `id`, `workspace_id`, `actor_type`, `actor_id?`, `action`, `entity_type`, `entity_id`, `metadata_redacted`, `correlation_id`, `created_at` | Journal append-only pour audit, diagnostic et explication des actions d’IDA. |
| `system_events` | `id`, `workspace_id?`, `component`, `severity`, `code`, `message`, `details_redacted`, `resolved_at?` | État et incidents : IA, stockage, scheduler, intégrations. |

États de `command_runs` : `RECEIVED`, `PLANNING`, `AWAITING_APPROVAL`, `EXECUTING`, `COMPLETED`, `FAILED`, `CANCELLED`.

### Contenu, approbation, calendrier et tâches

| Table | Colonnes clés | Rôle et contraintes |
|---|---|---|
| `campaigns` | `id`, `workspace_id`, `artist_project_id`, `release_id?`, `name`, `objective`, `status`, `starts_at?`, `ends_at?` | Campagne créative ou de release. |
| `campaign_pillars` | `id`, `campaign_id`, `name`, `description`, `sort_order` | Teaser, studio, artwork, live, social proof, reminder. |
| `content_plans` | `id`, `workspace_id`, `artist_project_id`, `campaign_id?`, `period_start`, `period_end`, `plan_type`, `status`, `rationale` | Plan quotidien, hebdomadaire ou de campagne. |
| `content_plan_items` | `id`, `content_plan_id`, `planned_at?`, `objective`, `status`, `post_id?` | Élément de plan, lié à un post lorsqu’il est matérialisé. |
| `posts` | `id`, `workspace_id`, `artist_project_id`, `campaign_id?`, `content_plan_item_id?`, `title`, `objective`, `status`, `rationale` | Unité créative transverse, pouvant posséder plusieurs variantes plateformes. |
| `post_variants` | `id`, `post_id`, `platform_id`, `caption`, `hashtags_json`, `cta`, `scheduled_at?`, `timezone`, `approval_state`, `delivery_state`, `payload_hash` | Variante Instagram, TikTok, YouTube, etc. `payload_hash` lie l’approbation au contenu exact. |
| `post_variant_media` | `post_variant_id`, `media_asset_id`, `sort_order` | Médias attachés à une variante. |
| `post_variant_tracks` | `post_variant_id`, `track_id` | Morceaux utilisés dans une variante. |
| `approvals` | `id`, `post_variant_id`, `state`, `requested_at`, `decided_at?`, `decided_by?`, `payload_hash`, `comment?` | Décision humaine immuable. Une édition qui modifie le hash crée une nouvelle approbation. |
| `publication_deliveries` | `id`, `post_variant_id`, `social_account_id?`, `external_post_id?`, `state`, `attempt_count`, `last_attempt_at?`, `published_at?`, `error_code?` | Livraison effective vers une plateforme, à introduire avec les connecteurs sociaux. |
| `calendar_events` | `id`, `workspace_id`, `artist_project_id?`, `kind`, `title`, `starts_at`, `ends_at?`, `timezone`, `status` | Événement manuel : studio, concert, rendez-vous, échéance. |
| `tasks` | `id`, `workspace_id`, `artist_project_id?`, `campaign_id?`, `title`, `description`, `status`, `due_at?`, `assigned_to?` | Tâche interne, hors calendrier personnel avancé. |

États recommandés :

```text
Post             DRAFT → PROPOSED → APPROVED | CHANGES_REQUESTED | REJECTED
Approval         REQUESTED → APPROVED | REJECTED | INVALIDATED
Delivery         NOT_CONFIGURED → SCHEDULED → PUBLISHING → PUBLISHED | FAILED | CANCELLED
Campaign         DRAFT → ACTIVE → PAUSED | COMPLETED | ARCHIVED
Content plan     DRAFT → PROPOSED → APPROVED | ARCHIVED
Task             TODO → IN_PROGRESS → DONE | CANCELLED
```

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

## Relations, contraintes et index indispensables

- `workspaces 1:n memberships`, `users 1:n memberships`; une seule adhésion par utilisateur et workspace.
- `workspaces 1:n artist_projects`, puis `artist_projects 1:n releases/tracks/campaigns/content_plans/posts`.
- `releases 1:n tracks` mais `tracks.release_id` reste nullable pour les démos et unreleased.
- `media_assets n:n tracks/releases/tags` via tables de liaison ; aucun champ polymorphique du type `entity_type/entity_id` pour ces relations cœur.
- `posts 1:n post_variants`; une variante est unique sur `(post_id, platform_id)` au MVP.
- `post_variants n:n media_assets` et `n:n tracks`; une livraison est liée à une seule variante.
- `platforms 1:n social_accounts`, `social_accounts 1:n analytics_syncs/analytics`.
- Index minimum sur chaque `(workspace_id, created_at DESC)` et `(workspace_id, status)` lorsque le statut est filtré.
- Index sur `tracks(artist_project_id, release_date)`, `releases(artist_project_id, release_date)`, `post_variants(platform_id, scheduled_at)`, `analytics(social_account_id, captured_at DESC)` et `media_assets(workspace_id, sha256)`.
- Recherche plein texte PostgreSQL sur titres, descriptions et noms de tags. Les embeddings sont une extension, non un prérequis.
- Ajouter une colonne `row_version` ou utiliser ETag/`updated_at` pour les modifications concurrentes depuis desktop et mobile.

## Suppression, rétention et sauvegarde

- Suppression logique : `artist_projects`, `releases`, `tracks`, `media_assets`, `posts`, `campaigns`, `tasks`, `memories` si le produit doit permettre une restauration.
- Pas de suppression logique des `approvals`, `activity_logs`, `tool_executions`, `publication_deliveries` et `system_events` : ces tables conservent l’audit.
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

La future extension d’IDA doit ajouter un module métier, ses tables, ses outils, ses permissions et ses événements ; elle ne doit pas contourner le noyau. Les invariants qui restent constants sont : `workspace`, identité, politique d’autorisation, audit, mémoire consentie, contrats API et séparation entre proposition IA et effet externe.
