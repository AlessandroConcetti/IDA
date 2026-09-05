# SECURITY — principes de sécurité et d’exploitation

> **Statut :** architecture complétée et première tranche locale implémentée ; aucune donnée réelle ni intégration externe n’est active.
> **Dernière revue :** 5 septembre 2026.
> **Règle MVP :** aucune publication publique, aucun paiement et aucun transfert ne peuvent être déclenchés sans une validation humaine explicite — et les paiements/transferts ne font pas partie du périmètre MVP.

## 1. Objectif

IDA centralisera des actifs sensibles : morceaux non publiés, stems, stratégie artistique, mémoire, calendrier, comptes sociaux et, plus tard, éventuellement des données personnelles générales. La sécurité doit donc être une propriété du noyau et de l’API partagée par le Web/PWA sur ordinateur ou navigateur mobile et les futurs clients Windows, macOS, iOS, Android ou TV, pas une fonction ajoutée dans les interfaces.

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

- Deux modes locaux existent. `LOCAL_DEMO`, toujours utilisé par défaut, conserve l’identité technique fixée uniquement côté serveur et n’accepte aucun credential ou cookie. `LOCAL_LOCK` est un verrou propriétaire opt-in activable par `IDA_IDENTITY_MODE=LOCAL_LOCK` ; son backend est livré, mais aucun écran de création/déverrouillage n’est encore disponible et il ne constitue ni une identité réseau, ni du Device Linking, ni une authentification de production.
- Dans les deux modes, un header, un query string ou le corps d’une requête ne peut pas choisir un autre acteur ou workspace. Les métadonnées de l'instance, de la session et du grant locaux sont persistées, jointes par clés composées et relues avant chaque requête métier `/v1`. Le contexte résultant est profondément gelé et conservé dans une `WeakMap` privée liée à la requête : une route ou un plugin ne peut pas le remplacer. La permission effective est l'intersection du rôle, du grant d'instance et de la permission d'outil ; un refus d'action reste générique.
- En `LOCAL_LOCK`, la passphrase brute n’est jamais persistée : la base conserve seulement un verifier scrypt salé et ses paramètres versionnés (`N=131072`, `r=8`, `p=1`, clé de 32 octets). Le navigateur reçoit un token de session opaque aléatoire ; seul son digest SHA-256 est stocké. Une nouvelle ouverture révoque la session locale active précédente. La session expire après 8 heures au maximum et après 30 minutes d’inactivité, avec glissement de cette limite d’inactivité sans dépasser l’échéance absolue. Un échec de déverrouillage déclenche un backoff exponentiel persisté, démarrant à 500 ms et plafonné à 5 minutes.
- Le cookie local est host-only, `HttpOnly` et `SameSite=Strict`; la variante destinée à un contexte HTTPS ajoute `Secure` et le préfixe `__Host-`. Les cookies dupliqués ou mal formés sont refusés. Les routes bootstrap exactes sont limitées à l’état, l’initialisation et le déverrouillage ; toute autre route `/v1` requiert une session valide. En `LOCAL_LOCK`, les requêtes à effet venant d’une origine étrangère ou marquées cross-site sont refusées, et un `Host` non loopback est rejeté. Le serveur lui-même refuse également de démarrer sur une adresse autre que `127.0.0.1`, `::1` ou `localhost`.
- PGlite est conservé dans un dossier local ignoré par Git. En `LOCAL_LOCK`, il contient le verifier salé et les digests de sessions décrits ci-dessus, jamais la passphrase ni le token opaque ; il ne contient aucun token social ou identifiant bancaire. Les fichiers importés localement résident séparément dans un stockage privé ignoré par Git ; cette solution de développement ne remplace pas le stockage objet, le scan et la quarantaine de production.
- Les événements dédiés `LOCAL_CREDENTIAL_CREATED`, `LOCAL_UNLOCK`, `LOCAL_SESSION_EXPIRED` et `LOCAL_SESSION_REVOKED` sont insérés sans payload libre, IP, user-agent, cookie, token ou dérivé de passphrase. Le code applicatif ne prévoit que l’ajout de ces événements ; ce journal local n’est cependant pas encore un stockage WORM ou un audit de production immuable.
- Les outils réellement exposés sont les lectures contrôlées et des écritures internes allowlistées : `update_artist_profile`, `create_release`, `create_track`, `import_media`, les transitions de mémoire consentie, les opérations Task Center et `decide_post_variant`. Toutes sont validées par schéma, limitées au workspace serveur, journalisées et sans effet externe. `create_release` accepte uniquement des métadonnées bornées : l’identifiant, le scope, les liens, tracks et médias sont refusés, et son audit ne garde ni titre, ni tags, ni description. `create_track` peut recevoir la seule relation `releaseId`, mais la résout toujours contre le workspace et projet serveur ; une garde SQL protège à nouveau cette invariance, y compris contre une écriture SQL future mal câblée, et l’audit ne garde que l’état et la présence de cette liaison. `import_media` peut recevoir les seules références `releaseId` et `trackId`, chacune résolue dans le même workspace et projet que le média ; une migration répare les anciens liens incompatibles et une garde SQL impose à nouveau cette invariance contre les writes directs. Son audit ne garde que le type et les booléens de référence, jamais nom, hash, tags, description ou titres liés. Il limite toujours un fichier à 25 MiB et valide actuellement son couple MIME/extension, mais ne remplace pas le contrôle de signature binaire et la quarantaine requis avant toute donnée personnelle réelle. `decide_post_variant` est le seul outil local en `CONTENT` / `APPROVAL_REQUIRED` : la route résout d’abord une approbation et son hash dans le workspace, puis construit la preuve `explicitApproval` côté serveur ; elle n’accepte jamais une preuve, un acteur ou un état fourni par le client. `PUBLISH` et `SYSTEM` restent inaccessibles depuis le runtime local.
- `GET /v1/social/platforms` est une projection déclarative sans compte social, identifiant de compte, token, secret, scope accordé ni état de connexion. Elle ne lance pas OAuth, ne contacte aucune plateforme et ne crée pas d’audit ; ses booléens ne sont jamais une autorisation d’effectuer une action externe.
- `GET /v1/agents` est une projection déclarative des manifestes revus. Elle ne contient ni contenu de prompt, secret, token, workspace, utilisateur ni capacité exécutable ; les deux manifestes locaux sont `PLANNED` et `PROPOSAL_ONLY`. Le registre refuse toute invocation tant que l’agent n’est pas `ACTIVE`, puis contrôle l’outil, le module et la permission exacts déclarés. Sa lecture ne démarre aucun modèle, ne contacte aucun fournisseur et ne crée pas d’audit.
- `GET /v1/dashboard/summary` est une projection lecture seule à paramètres stricts : le scope et le jour civil sont résolus côté serveur, les compteurs ne contiennent ni payload, média, hash, acteur, compte ni token et la consultation n’écrit aucun audit. Les planifications comptées sont uniquement des snapshots internes ; elles ne peuvent pas être interprétées comme des livraisons ou publications sociales.
- Ce runtime n’est pas éligible à une bêta avec données personnelles. Avant cela, les exigences de la section 12 restent obligatoires.

Le verrou est fail-safe au redémarrage : dès qu’un `local_owner_credentials` existe, le mode effectif reste `LOCAL_LOCK`, même si la variable d’environnement est absente ou vaut ensuite `LOCAL_DEMO`. La lecture passive de `GET /v1/auth/status` ne renouvelle pas l’expiration d’inactivité et ne permet donc pas à un polling d’interface de maintenir seul une session ouverte. Toutes les réponses `/v1`, succès comme erreurs, portent `Cache-Control: no-store` afin qu’un navigateur ou proxy local ne conserve pas les statuts Identity ou données privées. En HTTP loopback, le cookie est limité à `Path=/v1`, mais les cookies navigateur ne sont pas isolés par port : cette réduction ne transforme pas `127.0.0.1` en frontière contre un autre service local. Avant données réelles, le client distribué devra employer une origine dédiée/intégrée et un profil HTTPS revu.

### 3.2 Défense en profondeur contre les intrusions

Aucune architecture ne peut garantir l'absence totale de compromission. IDA cherche à réduire simultanément la probabilité d'une attaque, son rayon d'impact et le temps nécessaire pour la détecter et la contenir. Les contrôles seront suivis dans une matrice versionnée dérivée d'OWASP ASVS, des recommandations NIST sur l'identité et le Zero Trust, puis de MASVS/TCASVS pour les clients natifs.

1. **Surface minimale :** boucle locale tant que le jalon réseau n'est pas satisfait, aucun port ou service inutile, aucune route de debug en production et aucun secret dans le client.
2. **Zero Trust applicatif :** réseau local, propriétaire du matériel, navigateur connu, agent et modèle ne confèrent aucune confiance implicite. Utilisateur, session, instance, workspace, ressource, outil et action sont contrôlés côté serveur.
3. **Identité résistante au phishing :** passkeys privilégiées, sessions courtes et rotatives, révocation immédiate, step-up lié au hash exact de l'action et récupération sans dépendre de la seule adresse e-mail.
4. **Web et API :** HTTPS avec origine stable, cookies `HttpOnly`/`Secure`/`SameSite`, CSRF, CSP restrictive, schémas stricts, autorisation objet par objet, limites de débit et quotas de coût/taille/temps.
5. **IA à pouvoir minimal :** aucune clé, SQL, shell ou sortie réseau générale remise à un modèle ; contexte minimal, contenu externe non fiable, outils granulaires refusés par défaut et approbation indépendante pour tout effet sensible.
6. **Secrets et données :** coffres OS ou gestionnaire de secrets, chiffrement par enveloppe lorsque nécessaire, séparation dev/prod, rotation, redaction et sauvegardes chiffrées dont la restauration est testée.
7. **Chaîne logicielle :** versions et lockfile contrôlés, inventaire/SBOM, scan de secrets et dépendances, analyse statique, mises à jour signées et reproductibles, provenance des artefacts et délai défini pour corriger une vulnérabilité critique.
8. **Confinement :** services et workers sous identités séparées à moindre privilège, stockage privé, traitements média isolés, allowlist d'egress et protections SSRF/rejeu/idempotence.
9. **Détection et réponse :** événements sécurité append-only, alertes sur anomalies, intégrité et coûts, horloge fiable, procédures de révocation/rotation/restauration et exercices d'incident.
10. **Validation indépendante :** tests négatifs continus, revue de configuration, scan dynamique puis test d'intrusion externe avant exposition Internet, connecteurs sociaux sensibles, données bancaires ou actions physiques.

Le futur `Security Guardian` consolidera uniquement des événements et résultats de scanners redacted pour expliquer les alertes et proposer une remédiation. Les blocages urgents, quotas, révocations automatiques autorisées et coupe-circuits restent des règles déterministes testées ; l'agent n'obtient ni secrets, ni shell, ni pouvoir général de modifier le système.

| Jalon | Barrières minimales avant activation |
|---|---|
| Accès navigateur mobile/réseau privé | identité réelle, HTTPS stable, cookies/CSRF/CSP, rate limiting, révocation, journaux et configuration fail-closed |
| Bêta avec données personnelles | sauvegarde/restauration, scan fichiers, inventaire des données, alertes, mises à jour sûres et runbooks d'incident |
| OAuth social avec écriture | PKCE/state/nonce, scopes minimaux, coffre de secrets, anti-rejeu, idempotence et approbation humaine finale |
| Client natif public | contrôles OWASP MASVS ou TCASVS applicables, Keychain/Keystore/coffre OS, signature, mise à jour vérifiée et tests de stockage/réseau |
| Finance, banque, santé, legal ou contrôle physique | threat model distinct, steward du domaine, validation professionnelle/réglementaire, test d'intrusion indépendant et aucun effet critique autonome |

## 4. Identité, appareils et autorisation

### Multi-appareils

- Pour l’identité distante et multi-appareils de production, utiliser un fournisseur d’identité/OIDC géré ou une implémentation équivalente maintenue ; ne pas étendre le verrou local en système de mots de passe réseau maison.
- Centraliser les sessions côté backend. Pour le web, employer des cookies `HttpOnly`, `Secure` et adaptés à la protection CSRF ; pour une future application native, utiliser le stockage sécurisé de l’OS.
- Prévoir des sessions courtes, rotation des refresh tokens, liste des appareils, révocation par appareil et révocation globale.
- Exiger une authentification multifacteur du propriétaire avant la connexion d’un réseau social ou toute élévation de privilège.
- Appliquer des limites de tentative de connexion, la vérification d’e-mail et une notification de nouvel appareil.

Dans l’architecture cible, l'accès depuis le navigateur Web/PWA d'un téléphone restera disponible en parallèle de l'application native iOS ou Android. Ces deux installations seront des instances clientes distinctes : elles ne partageront ni credential durable ni session, et chacune pourra être révoquée sans invalider automatiquement l'autre.

L'adresse e-mail ne constitue jamais une preuve d'accès. Chaque future instance cliente autorisée possédera sa propre identité cryptographique ou liaison serveur, sa session révocable et des grants qui peuvent uniquement réduire les droits de la membership. Une instance nouvelle devra être confirmée explicitement depuis une instance déjà autorisée au moyen d'un challenge court, à usage unique et protégé contre le rejeu. Sa révocation invalidera toutes ses sessions sans supprimer le compte ni accorder de privilèges aux autres appareils ou instances. L'architecture et les décisions validées figurent dans `IDENTITY_DEVICE_LINKING.md` ; les contrats, la politique et les tests de frontière sont livrés, mais les endpoints de liaison d’appareil, passkeys, récupération et accès distant restent futurs. Les endpoints locaux de `LOCAL_LOCK` ne réalisent aucune de ces fonctions.

Le navigateur mobile accédera au Core uniquement via une origine HTTPS stable et authentifiée, idéalement same-origin avec l'API. Une adresse `http://<ip-locale>` ne convient pas : elle dégrade les garanties de cookies et ne fournit pas le contexte sécurisé attendu par passkeys, PWA ou permissions navigateur. Aucun fingerprint, IP ou user-agent ne servira de preuve d'identité. Les motifs détaillés de refus Identity resteront dans l'audit serveur ; l’API distante renverra des erreurs publiques génériques afin de ne pas devenir un oracle de comptes, sessions ou instances.

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

Chaque domaine réglementé ou assimilable à une responsabilité professionnelle ajoutera ultérieurement son propre `Domain Steward Agent`. Pour le RGPD, un `Privacy Steward` séparé par domaine observera les résultats déterministes de consentement, finalité, rétention, export, suppression et transfert. Une policy est évaluée à chaque action et des audits sont planifiés ; aucun LLM ne lit continuellement toutes les données ni ne peut déclarer seul IDA conforme. Les constats nécessitant une décision sont escaladés vers l'utilisateur et, selon le contexte, un DPO, juriste ou autre professionnel compétent.

### Limite explicite de l’Approval Center local

Le runtime local ne livre qu’une décision interne sur une variante seedée. La file expose seulement les demandes `REQUESTED` appartenant au workspace serveur et des métadonnées média sûres (`id`, nom, type, statut), jamais une clé de stockage, un chemin ou une URL. Les routes `approve` / `reject` exigent `approvalId` et `expectedPayloadHash`, recalculent le hash canonique de la version courante (titre, objectif, rationale éventuelle, plateforme, texte, hashtags ordonnés, CTA, date/fuseau et médias ordonnés) avant toute mutation et traitent toute divergence comme une précondition obsolète. Une décision terminale est immuable ; le retry identique ne crée ni nouvelle date ni audit, tandis qu’une décision opposée est refusée.

La preuve transmise au `ToolGateway` est construite après cette résolution avec l’approbation serveur, l’acteur du contexte de requête et l’instant serveur. En `LOCAL_DEMO`, la session qui produit ce contexte reste technique : ce mécanisme établit la frontière applicative et ne constitue pas encore une authentification humaine de production. Une décision conserve strictement `NOT_CONFIGURED` comme état de livraison. Elle n’écrit ni `scheduled_posts`, ni médias, jobs, tokens, OAuth, comptes sociaux ou adaptateur réseau.

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

L’historique local des commandes (`command_runs`) est une donnée privée distincte de la projection d’audit : lorsqu'une identité possède aussi `WRITE`, il stocke la demande et la réponse affichable d’une commande `COMPLETED / READ` pour restaurer le même hub, pour le même acteur du workspace résolu par le serveur. Un client `VIEW_ONLY` reçoit la réponse de lecture sans persistance ni audit, plutôt que de se voir refuser la commande pour un effet secondaire facultatif. Les deux textes persistés sont limités à 4&nbsp;000 caractères ; l’API ne sélectionne ni ne retourne l’acteur, le workspace, les paramètres, prompts, résultats ou payloads d’outil, traces de modèle, pièces jointes ou secrets. Son écriture exige l’outil interne allowlisté `IDA / WRITE` et crée l’audit `command.completed` redacted (intention, état, permission), exclu de la timeline utilisateur ; sa consultation n’écrit pas d’activité et ne rejoue aucune commande. Ce registre ne crée pas de mémoire durable : la mémoire reste soumise à son consentement explicite. Avant toute donnée personnelle réelle, il devra recevoir authentification, politiques de rétention/suppression, chiffrement approprié et contrôles d’accès de production ; il ne remplace pas le futur modèle de conversations complet.

Le verrou du propriétaire local spécifié dans `docs/adr/0004-local-owner-lock-and-session.md` est livré côté backend en mode opt-in `LOCAL_LOCK`. Il regroupe dérivation scrypt, token opaque non persisté, cookie local protégé, échéances idle/absolue, rotation/révocation, backoff de tentative, contrôles `Host`/origine et tests négatifs. `LOCAL_DEMO` reste le défaut et aucun écran ne l’active encore. Cette tranche demeure strictement loopback : elle ne doit jamais servir à exposer IDA sur le réseau et ne remplace pas les passkeys, HTTPS, protections Web complètes, récupération et Device Linking requis pour les clients distants.

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
11. matrice de contrôles OWASP ASVS versionnée, revue des risques API/IA et test dynamique de la configuration destinée à la bêta ;
12. aucune exposition réseau tant que les contrôles du jalon correspondant à la section 3.2 ne sont pas vérifiés.

## Références de conception

- [OWASP OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [OWASP Application Security Verification Standard 5.0](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [OWASP GenAI Security — Top 10 for LLM and GenAI](https://genai.owasp.org/initiatives/top-10-for-llm-and-genai/)
- [OWASP Mobile Application Security Verification Standard](https://mas.owasp.org/MASVS/)
- [OWASP Thick Client Application Security Verification Standard](https://owasp.org/TCASVS/)
- [NIST SP 800-63-4 — Digital Identity Guidelines](https://pages.nist.gov/800-63-4/)
- [NIST SP 800-207 — Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [ANSSI — Architectures sécurisées](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_architecture_securisee_v1.0.pdf)
