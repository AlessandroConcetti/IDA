# SECURITY — principes de sécurité et d’exploitation

> **Statut :** architecture complétée et première tranche locale implémentée ; aucune donnée réelle ni intégration externe n’est active.
> **Dernière revue :** 3 septembre 2026.
> **Règle MVP :** aucune publication publique, aucun paiement et aucun transfert ne peuvent être déclenchés sans une validation humaine explicite — et les paiements/transferts ne font pas partie du périmètre MVP.

## 1. Objectif

IDA centralisera des actifs sensibles : morceaux non publiés, stems, stratégie artistique, mémoire, calendrier, comptes sociaux et, plus tard, éventuellement des données personnelles générales. La sécurité doit donc être une propriété du noyau et de l’API partagée par le Web/PWA et les futurs clients Windows, macOS, iOS, Android ou TV, pas une fonction ajoutée dans les interfaces.

Le choix initial recommandé est un **monolithe modulaire avec des workers isolés**, et non des microservices prématurés. Les frontières de domaine, les permissions et les secrets doivent cependant être réels dès la Phase 1 afin de permettre une évolution sûre.

## 2. Actifs et classification

| Niveau | Données | Règle minimale |
|---|---|---|
| S0 — secret | clés de signature, clés de chiffrement, mots de passe, jetons OAuth, chaînes de connexion | Jamais dans le frontend, Git, les logs ou les prompts. Coffre à secrets et chiffrement applicatif. |
| S1 — privé sensible | démos, masters, stems, unreleased, mémoire artistique, calendrier, stratégie, conversations | Accès par workspace uniquement, stockage privé, URLs signées temporaires, journalisation d’accès sensible. |
| S2 — interne | brouillons, campagnes, tâches, règles éditoriales, statistiques non publiques | Autorisation serveur et conservation définie. |
| S3 — public | publications effectivement publiées, liens publics, métadonnées choisies | Toujours relié à sa source et à son historique d’approbation. |

Une donnée ne doit être envoyée à un modèle IA ou à un fournisseur externe que si elle est nécessaire à la demande, autorisée pour cet usage et jamais de niveau S0.

## 3. Frontières de confiance

```text
Desktop / Mobile
       │
API partagée — authentification, validation, limites de débit
       │
Couche de politique — autorisation, consentement, audit
       │
IDA Core — interprète et prépare une action structurée
       │
Tool Gateway — vérifie droit, schéma, état, idempotence
       ├── Base relationnelle et mémoire
       ├── Stockage média privé
       ├── Queue / workers isolés
       └── Adaptateurs OAuth et APIs externes
```

L’IA n’obtient ni accès direct à la base de données, ni clé de production, ni jeton social. Elle peut demander un outil via une sortie structurée ; le serveur décide ensuite de l’autoriser, de créer une proposition ou de la refuser.

### 3.1 Frontières temporaires du runtime local

- L’identité et le workspace de démonstration sont fixés uniquement côté serveur ; un header, un query string ou le corps d’une requête ne peut pas choisir un autre workspace.
- PGlite est conservé dans un dossier local ignoré par Git. Il ne contient que des métadonnées de démonstration, aucun secret, token ou identifiant bancaire. Les fichiers importés localement résident séparément dans un stockage privé ignoré par Git ; cette solution de développement ne remplace pas le stockage objet, le scan et la quarantaine de production.
- L’API locale n’accepte que l’origine du Command Center de développement et n’utilise pas de cookies de session tant que l’authentification réelle n’est pas livrée.
- Les outils réellement exposés sont les lectures contrôlées et des écritures internes allowlistées : `update_artist_profile`, `create_release`, `create_track`, `import_media`, les transitions de mémoire consentie, les opérations Task Center et `decide_post_variant`. Toutes sont validées par schéma, limitées au workspace serveur, journalisées et sans effet externe. `create_release` accepte uniquement des métadonnées bornées : l’identifiant, le scope, les liens, tracks et médias sont refusés, et son audit ne garde ni titre, ni tags, ni description. `create_track` peut recevoir la seule relation `releaseId`, mais la résout toujours contre le workspace et projet serveur ; une garde SQL protège à nouveau cette invariance, y compris contre une écriture SQL future mal câblée, et l’audit ne garde que l’état et la présence de cette liaison. `import_media` peut recevoir les seules références `releaseId` et `trackId`, chacune résolue dans le même workspace et projet que le média ; une migration répare les anciens liens incompatibles et une garde SQL impose à nouveau cette invariance contre les writes directs. Son audit ne garde que le type et les booléens de référence, jamais nom, hash, tags, description ou titres liés. Il limite toujours un fichier à 25 MiB et valide actuellement son couple MIME/extension, mais ne remplace pas le contrôle de signature binaire et la quarantaine requis avant toute donnée personnelle réelle. `decide_post_variant` est le seul outil local en `CONTENT` / `APPROVAL_REQUIRED` : la route résout d’abord une approbation et son hash dans le workspace, puis construit la preuve `explicitApproval` côté serveur ; elle n’accepte jamais une preuve, un acteur ou un état fourni par le client. `PUBLISH` et `SYSTEM` restent inaccessibles depuis le runtime local.
- `GET /v1/social/platforms` est une projection déclarative sans compte social, identifiant de compte, token, secret, scope accordé ni état de connexion. Elle ne lance pas OAuth, ne contacte aucune plateforme et ne crée pas d’audit ; ses booléens ne sont jamais une autorisation d’effectuer une action externe.
- `GET /v1/agents` est une projection déclarative des manifestes revus. Elle ne contient ni contenu de prompt, secret, token, workspace, utilisateur ni capacité exécutable ; les deux manifestes locaux sont `PLANNED` et `PROPOSAL_ONLY`. Le registre refuse toute invocation tant que l’agent n’est pas `ACTIVE`, puis contrôle l’outil, le module et la permission exacts déclarés. Sa lecture ne démarre aucun modèle, ne contacte aucun fournisseur et ne crée pas d’audit.
- `GET /v1/dashboard/summary` est une projection lecture seule à paramètres stricts : le scope et le jour civil sont résolus côté serveur, les compteurs ne contiennent ni payload, média, hash, acteur, compte ni token et la consultation n’écrit aucun audit. Les planifications comptées sont uniquement des snapshots internes ; elles ne peuvent pas être interprétées comme des livraisons ou publications sociales.
- Ce runtime n’est pas éligible à une bêta avec données personnelles. Avant cela, les exigences de la section 12 restent obligatoires.

## 4. Identité, appareils et autorisation

### Multi-appareils

- Utiliser un fournisseur d’identité/OIDC géré ou une implémentation équivalente maintenue ; ne pas fabriquer un système de mots de passe maison.
- Centraliser les sessions côté backend. Pour le web, employer des cookies `HttpOnly`, `Secure` et adaptés à la protection CSRF ; pour une future application native, utiliser le stockage sécurisé de l’OS.
- Prévoir des sessions courtes, rotation des refresh tokens, liste des appareils, révocation par appareil et révocation globale.
- Exiger une authentification multifacteur du propriétaire avant la connexion d’un réseau social ou toute élévation de privilège.
- Appliquer des limites de tentative de connexion, la vérification d’e-mail et une notification de nouvel appareil.

L'adresse e-mail ne constitue jamais une preuve d'accès. Chaque appareil possède sa propre identité cryptographique, sa session révocable et des grants qui peuvent uniquement réduire les droits de la membership. Un appareil nouveau doit être confirmé explicitement depuis un appareil déjà autorisé au moyen d'un challenge court, à usage unique et protégé contre le rejeu. La révocation d'un appareil invalide toutes ses sessions sans supprimer le compte ni accorder de privilèges aux autres appareils. L'analyse complète et les décisions encore requises figurent dans `IDENTITY_DEVICE_LINKING.md`.

Les jetons de session, JWT et refresh tokens ne doivent jamais être stockés dans `localStorage` ou `sessionStorage` : une vulnérabilité XSS suffirait à les exfiltrer.

### Caméra, microphone et gestes

La permission OS ne suffit jamais à activer un capteur. **Sans demande explicite de l'utilisateur dans le parcours courant, aucun accès caméra n'est autorisé.** Le démarrage, l'ouverture de Home, un agent, une automatisation, une préférence enregistrée ou une commande distante ne peuvent pas créer cette demande. Toute capture future utilise une session courte, un indicateur visible et un arrêt immédiat ; aucune image n'entre dans les prompts, logs, mémoire ou backend. Le contrôle gestuel futur reste limité à des événements UI et ne constitue ni une commande Core ni une approbation. Voir `INPUT_PROVIDERS.md`.

### Isolation des données et RBAC

Même pour un seul propriétaire, créer dès le départ un `Workspace` et une `Membership`. `ArtistProject` appartient au workspace ; il ne le remplace pas. Chaque donnée métier persistante porte un `workspace_id` non nul, et les requêtes sont filtrées par cette clé côté service et, lorsque la base le permet, par Row Level Security.

Rôles initiaux :

- `OWNER` : propriétaire du workspace ; seul rôle exposé dans le premier MVP.
- `EDITOR` et `VIEWER` : prévus au modèle de permission, sans nécessairement être exposés dans l’interface initiale.
- `SYSTEM` : identité de service limitée à une fonction précise, jamais une session utilisateur déguisée.

Les niveaux fonctionnels demandés par IDA s’appliquent côté serveur :

| Niveau | Effet autorisé |
|---|---|
| `READ` | Consulter des données déjà autorisées dans le workspace. |
| `WRITE` | Créer ou modifier des données internes et des brouillons. |
| `APPROVAL_REQUIRED` | Créer une proposition ; aucune mutation publique externe. |
| `PUBLISH` | Exécuter une publication uniquement sur une approbation durable et explicite du propriétaire. |
| `SYSTEM` | Configurer une intégration ou un service ; réservé et audité. |

L’interface ne constitue jamais une preuve d’autorisation. Une URL, un ID ou un outil reçu du client doit être revérifié dans son workspace au moment de l’action.

## 5. Approval Center et sécurité des agents

Une action à effet externe suit l’état :

```text
DRAFT → PROPOSED → APPROVED → SCHEDULED → DISPATCHING → PUBLISHED | FAILED
```

- Une `Approval` référence le média, la caption, la plateforme, le compte, la date et la **version** exacte du post.
- Modifier un de ces éléments invalide l’approbation et renvoie le post à `PROPOSED`.
- Le worker vérifie de nouveau l’approbation, l’état du compte et la version juste avant l’envoi.
- Une clé d’idempotence et un verrou de job empêchent les doubles publications lors d’un retry.
- L’« AI reasoning » affiché à l’utilisateur est une justification courte et vérifiable, pas une chaîne de raisonnement interne ni un secret de système.

Les contenus importés, les commentaires sociaux et les pages web sont des **données non fiables**. Ils ne peuvent pas modifier les instructions système ni élargir les permissions d’un outil. Chaque appel d’outil doit passer par une liste blanche, un schéma de paramètres, une politique d’autorisation et un journal d’audit.

### Limite explicite de l’Approval Center local

Le runtime local ne livre qu’une décision interne sur une variante seedée. La file expose seulement les demandes `REQUESTED` appartenant au workspace serveur et des métadonnées média sûres (`id`, nom, type, statut), jamais une clé de stockage, un chemin ou une URL. Les routes `approve` / `reject` exigent `approvalId` et `expectedPayloadHash`, recalculent le hash canonique de la version courante (titre, objectif, rationale éventuelle, plateforme, texte, hashtags ordonnés, CTA, date/fuseau et médias ordonnés) avant toute mutation et traitent toute divergence comme une précondition obsolète. Une décision terminale est immuable ; le retry identique ne crée ni nouvelle date ni audit, tandis qu’une décision opposée est refusée.

La preuve transmise au `ToolGateway` est construite après cette résolution avec l’approbation serveur, l’acteur serveur et l’instant serveur. En `LOCAL_DEMO`, l’acteur est fixe : ce mécanisme établit la frontière applicative et ne constitue pas encore une authentification humaine de production. Une décision conserve strictement `NOT_CONFIGURED` comme état de livraison. Elle n’écrit ni `scheduled_posts`, ni médias, jobs, tokens, OAuth, comptes sociaux ou adaptateur réseau.

### Calendrier et planification interne locale

`POST /v1/post-variants/:variantId/internal-schedules` ne reçoit que `approvalId` et `expectedPayloadHash`, tous deux strictement validés. Avant l’outil et dans la transaction, le serveur vérifie le scope de la variante, l’état `APPROVED` de la variante et de son approbation, l’égalité du hash client/approval/variante et le recalcul canonique courant. Il copie ensuite exclusivement la date et le fuseau déjà approuvés ; aucune valeur d’horaire, de plateforme, d’acteur, d’état ou de livraison client n’est acceptée. Une date absente ou passée est refusée et le retry exact d’un snapshot actif reste idempotent sans réécriture.

La preuve `CALENDAR` / `APPROVAL_REQUIRED` est construite avec l’identifiant, l’auteur et l’instant de l’approbation résolue côté serveur. L’outil `schedule_approved_post_variant` est limité au gateway de cette route et n’est pas une capacité de `ida-core`. Les contraintes transactionnelles interdisent un second snapshot actif par variante ou un second créneau plateforme au même instant dans le workspace; les snapshots date/fuseau/approval/hash sont immuables. La route ne peut ni publier, ni créer une livraison, ni modifier `scheduled_posts`, `delivery_state`, les médias, OAuth, jobs, comptes ou réseau. Elle écrit uniquement l’audit redacted `post_variant.internal_scheduled` (identifiants, hash, date, fuseau, état).

`POST /v1/internal-post-schedules/:scheduleId/cancel` n’accepte aucun corps et ne résout jamais un scope depuis le client. Le serveur applique seulement la transition transactionnelle `SCHEDULED → CANCELLED` dans son workspace, puis fixe l’acteur et l’instant côté serveur. Le retry voit la ligne `CANCELLED` et reste sans effet : il ne réécrit ni `cancelled_by`, ni `cancelled_at`, ni l’audit. L’annulation ne dépend pas du hash ou de l’approbation courante, afin qu’un snapshot devenu obsolète puisse toujours être retiré. Le trigger de base bloque aussi toute réactivation, mutation de snapshot ou modification ultérieure de la preuve d’annulation. L’outil `cancel_internal_post_schedule` est limité à `CALENDAR` / `WRITE`, n’appelle aucun service externe et ne modifie que le snapshot et un audit redacted `post_variant.internal_schedule_cancelled`.

### Intégrité du lien Campaign Brief–release

Le chemin API vérifie le workspace et le projet artistique avant toute écriture afin de retourner un `404` générique si une release est étrangère ou incompatible. La base applique la même règle avec une garde `BEFORE INSERT OR UPDATE` sur `campaigns` : un futur accès SQL interne ne peut pas contourner l’isolation en associant une campagne à la release d’un autre workspace ou projet. Lors d’une migration locale, les liens historiques incompatibles sont détachés avant l’installation de cette garde. La version de campagne est également normalisée puis soumise à `row_version > 0` directement en base.

## 6. OAuth, secrets et connecteurs

- Séparer `SocialAccount` (identité et état public du compte) de `SocialCredential` (jetons chiffrés et métadonnées d’expiration).
- Employer Authorization Code + PKCE, `state` lié à la session, redirect URIs strictement enregistrées et scopes minimaux.
- Chiffrer les refresh tokens et autres secrets applicativement par enveloppe avec un KMS/coffre à secrets ; conserver le `key_id`, pas la clé elle-même.
- Ne déchiffrer un secret qu’au sein de l’adaptateur concerné, au dernier moment ; ne jamais le renvoyer au navigateur ni le copier dans une queue.
- Prévoir expiration, réauthentification, révocation, rotation et l’état `REAUTH_REQUIRED` d’un compte connecté.
- Les webhooks ultérieurs doivent vérifier signature, date/rejeu et source avant de créer un événement.

L’authentification d’IDA et l’autorisation d’un compte Instagram, TikTok, YouTube ou Facebook sont deux flux distincts. L’un ne doit jamais donner accès à l’autre.

## 7. Médias et bibliothèque de contenu

Le flux d’upload recommandé est :

```text
Demande d’upload autorisée → URL signée courte vers zone de quarantaine
→ contrôle taille/type/signature/hash → scan et traitement worker isolé
→ dérivés/aperçus → statut READY ou REJECTED
```

- Stocker les originaux dans un stockage objet privé, avec une clé générée côté serveur ; ne jamais employer le nom fourni comme chemin de stockage.
- Limiter strictement extensions, MIME réel, signature binaire, taille, durée et nombre de fichiers. Ne pas faire confiance au seul `Content-Type` envoyé par le navigateur.
- Ne jamais servir un fichier non contrôlé directement depuis le domaine applicatif. Générer des aperçus et transcodages dans un environnement isolé.
- Mettre en quarantaine et scanner les médias avant usage. Les archives et formats actifs ou exécutables ne sont pas nécessaires au MVP.
- Les URLs de lecture sont signées, courtes et liées à un objet autorisé. Les médias non publiés ne doivent pas être indexables ou publics.
- Dans le runtime local, un aperçu ne contourne pas cette politique : `GET /v1/media/:mediaId/preview` résout d’abord le workspace et le média, ne sert que les images, audios et vidéos importés, vérifie que la clé générée reste confinée dans le stockage privé et que hash/type/MIME/extension/taille sont cohérents. La réponse est `private, no-store`, supporte une seule plage HTTP et ne retourne ni clé, chemin, URL de stockage ni audit. Cette route temporaire autorisée sera remplacée ou complétée par une lecture signée courte avec le stockage objet de production.
- Le hash de déduplication est utile, mais son usage doit rester limité au workspace afin de ne pas révéler indirectement qu’un autre utilisateur possède le même fichier.
- Une recherche de bibliothèque ne renvoie que des métadonnées autorisées et applique le workspace côté serveur ; clés de stockage, chemins et URLs signées ne sont ni sélectionnés ni rendus. Les motifs de recherche sont liés comme paramètres SQL et leurs caractères joker sont échappés. Les filtres `releaseId` et `trackId` ne consultent que les références déjà portées par des assets du workspace résolu ; une valeur étrangère ou inconnue ne renvoie donc rien et ne devient jamais une sonde d’existence.
- La projection locale de rotation de contenus limite strictement `limit`, impose le workspace côté serveur et ne rend que les métadonnées minimales d’un média `UNUSED` sans lien éditorial. Elle ne retourne ni hash, clé de stockage, compteur d’usage, statut détaillé ni relation de post, et sa lecture n’écrit ni audit ni état.
- Prévoir une option de suppression des métadonnées GPS/EXIF des dérivés destinés à la publication.

## 8. API, limites et traitements asynchrones

- Valider toutes les entrées avec des schémas partagés et des IDs non prédictibles. Ajouter pagination, limites de taille et contrôles de concurrence sur les écritures sensibles.
- Appliquer des limites de débit distribuées par IP, utilisateur, workspace et route ; protéger particulièrement login, upload, commandes IA, callbacks OAuth et endpoints de publication.
- Imposer des quotas de stockage, de transcodage et de consommation IA. Les erreurs de quota doivent être claires et ne jamais contourner la file d’approbation.
- Exécuter analyse de médias, imports, synchronisations et publications dans des workers séparés du serveur HTTP.
- Les jobs sont idempotents, bornés en retries, avec backoff, dead-letter queue et alertes. Le payload d’un job contient des IDs et des versions, pas des secrets ni un média complet.
- Les dates sont stockées en UTC avec le fuseau du workspace conservé explicitement ; le scheduler doit gérer le changement d’heure et les retries sans dupliquer un post.

## 9. Journalisation, mémoire et confidentialité

Conserver séparément :

- les logs opérationnels (erreurs, performance, corrélation) ;
- les `ActivityLog` d’audit (acteur humain, agent ou système ; action ; cible ; version ; résultat ; date) ;
- l’historique conversationnel et la mémoire, dont la rétention est contrôlée par l’utilisateur.

Journaliser notamment : connexion/révocation, changement de rôle, connexion sociale, upload/suppression, création/modification de mémoire, approbation/rejet, déclenchement/résultat de job et changement de configuration. Ne jamais journaliser secrets, mots de passe, cookies, jetons, clés, chaînes de connexion, médias privés ou prompts complets.

La timeline locale `GET /v1/activity-logs` est une projection de lecture distincte du journal append-only. Elle est strictement bornée (`limit` de `1` à `30` et curseur de continuation), filtrée par le workspace résolu côté serveur et limitée aux actions Phase 1 explicitement autorisées. Elle retourne uniquement `id`, `action`, `entityType`, `entityId` et `createdAt` : aucune lecture de `payload`, `actor_user_id` ou `workspace_id` n’est exposée, et ni caption, préférence, hash, token, chemin, média privé ou texte libre ne peut passer cette frontière. La consultation n’écrit pas `activity.viewed`, afin de rester sans effet et d’éviter une boucle d’audit. Les actions de domaines futurs sensibles, en particulier Finance/Banque, restent masquées jusqu’à une projection, une politique de rétention et une revue de sécurité propres à ce domaine.

L’historique local des commandes (`command_runs`) est une donnée privée distincte de la projection d’audit : il stocke la demande et la réponse affichable d’une commande `COMPLETED / READ` pour restaurer le même hub, pour le même acteur du workspace résolu par le serveur. Les deux textes sont limités à 4&nbsp;000 caractères ; l’API ne sélectionne ni ne retourne l’acteur, le workspace, les paramètres, prompts, résultats ou payloads d’outil, traces de modèle, pièces jointes ou secrets. Son écriture exige l’outil interne allowlisté `IDA / WRITE` et crée l’audit `command.completed` redacted (intention, état, permission), exclu de la timeline utilisateur ; sa consultation n’écrit pas d’activité et ne rejoue aucune commande. Ce registre ne crée pas de mémoire durable : la mémoire reste soumise à son consentement explicite. Avant toute donnée personnelle réelle, il devra recevoir authentification, politiques de rétention/suppression, chiffrement approprié et contrôles d’accès de production ; il ne remplace pas le futur modèle de conversations complet.

La mémoire permanente reste opt-in : IDA demande confirmation avant de stocker une préférence durable. Le flux local crée uniquement une proposition `PENDING`, puis accepte seulement `PENDING → CONFIRMED` ou `PENDING → REJECTED` via deux routes sans corps. Toute décision finale est immuable, et l’identifiant est recherché dans le workspace serveur avant la transition afin de ne pas révéler les mémoires d’un autre périmètre. Les actions sont allowlistées en `MEMORY` / `WRITE` et écrivent `memory.proposed`, `memory.confirmed` ou `memory.rejected` dans l’audit sans recopier le contenu de la préférence. L’utilisateur doit pouvoir consulter, corriger et supprimer sa mémoire. Les données servant au contexte IA sont minimisées et filtrées par workspace.

Le Task Center local applique les mêmes bornes : création strictement `TODO`, scope et acteur résolus côté serveur, et finalisation sans corps uniquement via `TODO|IN_PROGRESS → DONE`. Un retry de finalisation sur `DONE` est idempotent et ne réécrit ni données ni audit ; les autres états finaux sont non actionnables. Les outils `TASKS` / `WRITE` sont allowlistés, une tâche hors workspace répond comme absente, et les audits `task.created` / `task.completed` n’embarquent ni titre ni description.

Le Campaign Brief Registry local accepte seulement `name` et `objective` sous `CAMPAIGNS` / `WRITE`. Le serveur impose workspace, projet, acteur, identifiant et état `DRAFT`, normalise le nom pour empêcher les doublons équivalents, et ne renvoie jamais le brief d’un autre workspace. Deux routes distinctes reçoivent seulement `releaseId` ou `trackId` (ou `null`) et `expectedVersion` : elles ne rattachent une référence que si elle partage le workspace et le projet artistique de la campagne. Une cible étrangère ou incompatible répond par un `404` générique ; une version commune dépassée répond `409 CAMPAIGN_STALE` sans écriture. Les retries demandant le lien déjà présent sont idempotents. Les audits `campaign.created`, `campaign.release_linked`, `campaign.release_unlinked`, `campaign.track_linked` et `campaign.track_unlinked` sont append-only et redacted : ils ne contiennent que les identifiants, l’état ou la version, jamais le nom, l’objectif ou les titres Music Brain. Ces écritures ne créent ni date, contenu, post, calendrier, tâche, média, compte social, OAuth, notification, scheduler, appel IA ou réseau ; l’ajout futur de ces relations devra obtenir ses propres contrats, tests de permissions et autorisations.

L’Approval Center local ajoute seulement `post_variant.approved` et `post_variant.rejected` au journal append-only. Leurs payloads redacted contiennent les IDs, les états et le hash, jamais caption, hashtags, rationale, clé de stockage, chemin ou média privé. Une variante ou une approbation hors workspace répond comme absente ; une précondition erronée n’inscrit aucun audit.

## 10. Exploitation, sauvegardes et environnements

### Environnements

- Séparer comptes, bases, buckets, secrets, clients OAuth et noms de domaine de développement, staging et production.
- Ne jamais copier les données de production vers dev. Utiliser des jeux de données synthétiques ou anonymisés.
- Garder les secrets hors du dépôt ; scanner les commits et la CI pour les fuites. Les migrations sont testées en staging et précédées d’une sauvegarde vérifiée.
- Restreindre CORS aux origines IDA connues ; exposer des contrôles de santé minimaux sans détail interne.

### Sauvegarde et observabilité

- Automatiser les sauvegardes de base et activer le point-in-time recovery lorsqu’il est disponible. Versionner le stockage média et chiffrer les backups.
- Définir avant bêta un RPO/RTO réaliste ; point de départ recommandé : perte de données maximale de 24 h et restauration cible sous 4 h, à adapter au budget.
- Tester une restauration complète dans un environnement isolé avant toute promesse de sauvegarde.
- Alerter sur échec de backup, saturation stockage/queue, dead-letter queue, hausse d’erreurs, expiration de jeton, échec de publication et pic inhabituel de coût IA.
- Maintenir des runbooks courts : perte de téléphone, compte compromis, jeton expiré, job bloqué, erreur de publication et restauration.

## 11. Domaine futur : Finance et Banque

IDA ne met **aucune** fonction Finance/Banque en œuvre dans le MVP. L’architecture doit néanmoins empêcher ce futur domaine de devenir une extension banale du chat ou des outils sociaux.

### Principes non négociables

- **Isolation forte :** domaine `Finance` séparé, données et clés de chiffrement séparées, identité de service dédiée, logs d’audit dédiés et absence d’accès par défaut depuis les agents généralistes, sociaux ou marketing.
- **Lecture seule par défaut :** un futur connecteur ne peut lire que les données explicitement consenties. Aucun paiement, virement, ordre de trading, prélèvement, ajout de bénéficiaire ou modification bancaire ne sera proposé ou exécuté par IDA.
- **Consentement granulaire :** connexion, périmètre, durée, finalité et révocation doivent être visibles et confirmés par l’utilisateur. Toute reconnexion ou élargissement de scope redemande un consentement.
- **Pas d’identifiants bancaires :** ne jamais demander ni stocker mot de passe bancaire, code SMS, PIN ou secret d’authentification. N’étudier plus tard que les parcours OAuth/Open Banking officiellement autorisés et des partenaires régulés.
- **Aucun accès IA implicite :** les transactions et soldes bruts ne sont pas injectés dans le contexte IA par défaut. Une requête explicite peut fournir un résumé minimal, filtré et audité ; jamais de secret ou d’identifiant complet.
- **Pas de mélange silencieux :** les données financières ne sont pas rapprochées de la mémoire artistique, des données sociales ou de la publicité sans opt-in explicite et finalité déclarée.

Avant toute intégration financière, il faudra réaliser un threat model dédié, vérifier les obligations réglementaires et contractuelles applicables (notamment Open Banking/PSD2 selon les territoires), choisir un fournisseur habilité, définir une politique de conservation/suppression et faire valider le modèle de consentement. Cette étude est une phase distincte, non une sous-tâche de l’intégration sociale.

## 12. Conditions de sortie de Phase 1

Avant une bêta avec données réelles :

1. tests prouvant qu’un utilisateur/workspace ne peut jamais lire ou modifier l’objet d’un autre ;
2. tests montrant qu’une commande IA ne peut pas publier ni élargir ses droits ;
3. upload de fichiers invalides/malveillants refusé ou mis en quarantaine ;
4. approbation invalidée après toute modification pertinente ;
5. scan de secrets et dépendances dans la CI ;
6. sauvegarde automatisée et restauration testée ;
7. runbooks d’incident disponibles ;
8. inventaire des fournisseurs externes, de leurs données reçues et des règles de rétention ;
9. authentification réelle, expiration des sessions, association et révocation des appareils vérifiées ;
10. tests prouvant qu'aucun capteur n'est ouvert sans demande explicite et que les thèmes ne changent aucune permission.

## Références de conception

- [OWASP OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
