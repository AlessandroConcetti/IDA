# SOCIAL_APIS — capacités, contraintes et règles d’intégration

> **État de vérification :** 30 août 2026.
> **Portée :** Instagram, Facebook Pages, TikTok et YouTube. Les plateformes modifient fréquemment leurs API, permissions, quotas et critères d’audit ; cette matrice doit être revue sur la documentation officielle versionnée juste avant chaque implémentation.
> **Règle absolue :** IDA n’emploie pas de scraping lorsque l’API officielle existe. Il n’utilise ni navigateur automatisé, ni cookie utilisateur, ni mot de passe, ni API non documentée pour contourner une capacité absente.

## 1. Principes communs

- Chaque plateforme est derrière un `SocialPlatformAdapter` isolé et un registre de capacités (`canPublish`, `canUploadDraft`, `canReadAnalytics`, `requiresAudit`, etc.). Aucun écran ne promet une fonction non confirmée par l’adaptateur.
- L’authentification IDA et le consentement OAuth d’un compte social sont séparés. Les jetons restent chiffrés côté serveur et ne sont jamais exposés au frontend.
- Utiliser Authorization Code + PKCE, scopes minimaux, URLs de redirection exactes, état OAuth anti-CSRF, gestion d’expiration/révocation et audit de chaque action.
- IDA garde ses propres états `DRAFT`, `PROPOSED`, `APPROVED`, `SCHEDULED`, `PUBLISHED` et `FAILED`. Un « brouillon » ou un conteneur plateforme n’est pas forcément un brouillon utilisateur durable.
- Dans le MVP, toute publication publique passe par l’IDA Approval Center. Le scheduler, si nécessaire, diffère l’appel officiel ; il ne contourne jamais l’approbation ni une limitation de plateforme.
- Une publication ou synchronisation doit être idempotente, journalisée et afficher à l’utilisateur le compte cible, le média, la visibilité, la date et le résultat exact de l’API.

## 2. Matrice de capacité — état actuel

| Plateforme | Compte et OAuth | Publication / planification | Brouillons | Analytics disponibles | Contraintes majeures | Décision IDA |
|---|---|---|---|---|---|---|
| **Instagram** | Comptes professionnels uniquement (Business ou Creator). Deux configurations officielles existent : connexion Facebook avec Page liée, ou Instagram Login. | Images, vidéos, Reels et carrousels pour comptes professionnels ; Stories réservées aux comptes Business dans la configuration Facebook Login. L’API ne fournit pas une promesse générique de planification native : IDA doit conserver la proposition puis appeler l’API au moment approuvé. | Pas de gestion universelle de brouillon natif à promettre ; les propositions restent dans IDA. | Insights des comptes professionnels, sous réserve des scopes, métriques et périodes exposés par la configuration choisie. | Pas de compte personnel/consumer ; App Review/Advanced Access pour un usage réel ; limite officielle de 100 publications API par compte sur une fenêtre mobile de 24 h ; média à fournir selon les spécifications de publication. | Candidat Phase 3 après POC sandbox et validation App Review. |
| **Facebook Pages** | Pages uniquement, jamais profil personnel. OAuth Meta + rôle Page et Page Access Token. | Publications Page (texte/liens/médias, et formats dépendants de la version Graph API). La planification native et les formats doivent être validés par POC pour la version ciblée ; sinon le scheduler IDA appelle l’API à l’heure approuvée. | Brouillons et propositions gérés d’abord par IDA. | Page Insights selon permissions et champs autorisés. | Permissions, rôle Page, App Review/Business Verification et version Graph API peuvent conditionner l’accès. Aucune automatisation de profils personnels. | Candidat Phase 3 après POC par format et compte de test. |
| **TikTok** | App TikTok for Developers, Login Kit/produit API et scopes approuvés. `video.publish` pour Direct Post ; `video.upload` pour envoyer un brouillon à TikTok ; `video.list`/`user.info.stats` pour lecture limitée. | Direct Post peut publier vidéo et photo, mais nécessite l’audit pour une visibilité publique. L’Upload API envoie un brouillon à TikTok ; l’utilisateur achève l’édition/publication dans TikTok. Pas de planification autonome à promettre. | Oui, via Upload API vers le flux de création TikTok, mais la publication finale reste dans TikTok. | Vidéos propres : vues, likes, commentaires et partages via `video.list`; compte : followers, likes cumulés, etc. Les Research Tools ne sont pas un substitut d’analytics pour un assistant personnel. | Risque d’éligibilité élevé : la politique Direct Post impose contrôle explicite de l’utilisateur, UX de visibilité/consentement, audit et limites. Une app non auditée est limitée à `SELF_ONLY`. Les usages réservés à un groupe interne ou à la gestion de ses propres comptes sont explicitement signalés comme non acceptables dans les directives actuelles. | Commencer par étude d’éligibilité et Upload API ; ne pas promettre de Direct Post public avant confirmation écrite de TikTok. |
| **YouTube** | OAuth Google au nom de la chaîne ; pas de service account pour les données/chaînes YouTube. Scope minimal d’upload : `youtube.upload`; scopes analytics séparés. | `videos.insert` charge une vidéo et ses métadonnées. `status.publishAt` permet une publication planifiée uniquement pour une vidéo privée qui n’a jamais été publiée. | Une vidéo privée peut servir de brouillon technique ; IDA conserve néanmoins son propre état de proposition et l’utilisateur choisit visibilité/titre/description. | YouTube Analytics API : `yt-analytics.readonly`; données monétaires sous scope séparé `yt-analytics-monetary.readonly`, à ne pas demander par défaut. | Les uploads d’un projet API non vérifié sont privés jusqu’à audit. Quotas, validation de projet et politiques UX obligent à laisser l’utilisateur choisir titre, description et confidentialité. | Bon candidat Phase 3, après OAuth, audit Google si nécessaire et POC d’upload privé/planifié. |

## 3. Détail des permissions et limites à valider au moment du build

### Instagram

**Éligibilité et configurations**

- L’API Instagram vise les comptes professionnels ; les comptes consumer/personnels ne sont pas accessibles.
- Avec Facebook Login, le compte professionnel doit être lié à une Facebook Page. La collection officielle Meta mentionne notamment `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` et, selon la fonction, `instagram_manage_comments`.
- Avec Instagram Login, Meta expose des noms de permissions différents, notamment `instagram_business_basic` et `instagram_business_content_publish`. Cette configuration ne donne pas accès aux publicités ni au tagging selon la documentation actuelle.
- Ne jamais figer les noms de scopes dans le produit avant d’avoir choisi une seule configuration, une version Graph API et l’accès accordé par Meta.

**Publication et limites**

- La publication passe par un conteneur puis une publication ; les formats et champs exacts dépendent de l’endpoint et de la version.
- La documentation Meta actuelle indique une limite de 100 publications API par compte Instagram professionnel sur 24 heures glissantes ; les carrousels comptent comme une publication. L’adaptateur doit consulter la capacité/consommation prévue par Meta et bloquer avant erreur.
- Les médias doivent satisfaire les spécifications de format et de transfert de Meta. L’API ne rend pas un média privé IDA publiquement accessible par magie ; l’adaptateur doit employer le mécanisme officiel de transfert approprié.

**MVP**

- Propositions et calendrier dans IDA ; appel de publication seulement après approbation.
- Synchronisation et insights en lecture seule avant toute automatisation avancée.

Sources : [collection officielle Meta Instagram](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [Instagram Platform — Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [Instagram Platform Overview](https://developers.facebook.com/docs/instagram-platform/overview/).

### Facebook Pages

**Éligibilité et OAuth**

- L’API concerne des Pages administrées par l’utilisateur autorisant l’application ; elle ne permet pas de publier au nom d’un profil Facebook personnel.
- Les permissions habituellement nécessaires à la gestion/publication d’une Page sont `pages_show_list`, `pages_read_engagement` et `pages_manage_posts`. `pages_manage_metadata` est notamment pertinent pour les webhooks ; les insights peuvent demander une permission dédiée selon l’endpoint et la version.
- Le token de travail est un Page Access Token obtenu après consentement et rôle Page valide. Il reste chiffré serveur et lié au workspace propriétaire.

**Publication, planification et analytics**

- Tester séparément texte/lien, image, vidéo et Reel : ils peuvent utiliser des endpoints et contraintes de transfert différents.
- Ne pas assumer qu’une planification native est disponible pour tous les formats. Le contrat IDA est une planification interne validée ; l’adaptateur choisit la fonction officielle compatible ou effectue l’appel au moment prévu.
- Lire les Page Insights seulement pour les métriques et fenêtres réellement autorisées par l’API cible ; stocker la date de collecte et la version de l’API.

Sources : [Meta Pages API](https://developers.facebook.com/docs/pages-api/), [Meta Pages API — Posts](https://developers.facebook.com/docs/pages-api/posts/), [Meta App Review](https://developers.facebook.com/docs/app-review/).

### TikTok

**Deux chemins distincts**

| Besoin | Produit / scope officiel | Comportement |
|---|---|---|
| Publication directe | Content Posting API + `video.publish` | Publie sur le profil après contrôles de l’API ; interroger `creator_info` juste avant l’action et suivre le statut. |
| Export comme brouillon | Content Posting API + `video.upload` | Envoie le média vers TikTok et notifie l’utilisateur ; celui-ci doit finir l’édition/publication dans le flux TikTok. |
| Lecture de profil / vidéos propres | Display API + `user.info.basic`, `user.info.stats`, `video.list` | Profil, liste et métriques limitées des propres vidéos autorisées. |

**Contraintes déterminantes**

- Un client Direct Post non audité ne peut publier qu’en visibilité `SELF_ONLY`; la levée de cette restriction demande un audit TikTok.
- Les limites de publication dépendent du créateur et du client ; l’application doit interroger les informations créateur et respecter les limites retournées. Les directives indiquent une limite typique d’environ 15 posts/jour/créateur, sans en faire une garantie fixe.
- L’interface doit montrer le compte cible, laisser l’utilisateur choisir lui-même visibilité, commentaires/Duet/Stitch quand applicables, afficher un aperçu et recueillir un consentement explicite avant l’envoi. Elle ne peut pas définir ces choix sensibles par défaut.
- TikTok requiert une déclaration de consentement liée à l’utilisation musicale et, selon le cas, de contenu commercial. L’adaptateur doit traiter ces champs de conformité comme obligatoires lorsque l’API l’exige.
- Pour `PULL_FROM_URL`, l’URL doit appartenir à un domaine ou préfixe vérifié dans l’application TikTok. Les médias IDA déjà côté serveur doivent utiliser ce chemin officiel, pas une simulation de l’upload mobile.
- Les directives actuelles indiquent qu’une application limitée à une équipe interne ou à l’upload de ses propres comptes n’est pas un usage accepté de Direct Post. C’est un risque produit majeur pour un assistant exclusivement personnel : demander confirmation à TikTok avant de développer ou commercialiser cette fonction.
- Les Research Tools sont réservés à des usages et critères d’éligibilité particuliers ; ils ne doivent jamais servir à contourner les limites de l’API de compte/analytics.

Sources : [Content Posting — Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [Upload API](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video), [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [TikTok scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes), [Video Query v2](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query).

### YouTube

**Upload et planification**

- `videos.insert` requiert au minimum le scope `https://www.googleapis.com/auth/youtube.upload` et charge la vidéo avec ses métadonnées.
- Les projets API non vérifiés créés après le 28 juillet 2020 voient leurs uploads forcés en privé jusqu’à audit de conformité. IDA doit donc considérer l’upload privé comme le comportement initial sûr, pas comme une erreur à contourner.
- `status.publishAt` ne peut être défini que pour une vidéo privée qui n’a jamais été publiée. Une date dans le passé la rend publique immédiatement : le worker doit valider fuseau, horodatage, approval et idempotence.
- La politique YouTube exige que l’utilisateur puisse choisir titre, description et statut de confidentialité. IDA peut proposer ces éléments, pas les masquer ni les modifier silencieusement.

**Analytics et quotas**

- `yt-analytics.readonly` autorise les rapports d’analytics non monétaires. Le scope monétaire est séparé et ne doit être demandé que si une future fonctionnalité explicitement validée le nécessite.
- Toute requête, y compris invalide, consomme du quota. L’adaptateur doit budgéter les appels, gérer backoff et lire les quotas réels dans la console du projet plutôt que compter sur une valeur codée en dur.
- Les données Analytics sont soumises à leurs fenêtres, délais et métriques officiellement disponibles ; IDA stocke la date de collecte et ne présente pas une estimation comme une métrique officielle.

Sources : [YouTube Data API — videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [YouTube Data API — video status](https://developers.google.com/youtube/v3/docs/videos), [YouTube OAuth](https://developers.google.com/youtube/v3/guides/authentication), [YouTube Analytics API](https://developers.google.com/youtube/analytics/reference), [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

## 4. Règles de mise en œuvre IDA

1. Réaliser un POC isolé par plateforme et par format avant de construire l’interface définitive.
2. Enregistrer dans `PlatformCapability` la version d’API, les scopes accordés, le compte, la date de validation et les opérations réellement activées.
3. Ne montrer dans l’UI que les actions possibles pour le compte connecté. Une incapacité API devient un message clair, jamais un bouton trompeur.
4. Demander les scopes de manière incrémentale : lecture/analytics d’abord, publication seulement lorsque l’utilisateur active réellement cette fonction.
5. Exiger une approbation IDA explicite avant toute mutation externe, puis conserver la réponse brute réduite/redactée de l’API et son identifiant externe.
6. Passer un compte en `REAUTH_REQUIRED`, `RATE_LIMITED` ou `CAPABILITY_UNAVAILABLE` lorsqu’une réponse officielle le justifie ; ne pas retry aveuglément.
7. Revoir cette matrice à chaque nouvelle version d’API, renouvellement d’audit, changement de permission ou incident de plateforme.

## 5. Interdictions

- Pas de scraping HTML, automatisation Playwright/Selenium, cookies de session, extension navigateur ou mot de passe pour publier/lire des données lorsqu’une API officielle existe ou lorsqu’une capacité officielle n’est pas accordée.
- Pas de faux contournement de quotas, d’audit, de visibilité privée, de restrictions de contenu ou de consentement utilisateur.
- Pas de publication « autonome » par l’agent : seule une approbation humaine durable peut rendre un job publiable.
- Pas d’exposition d’un secret, d’un token OAuth, d’un `upload_url` sensible ou d’une réponse API non filtrée dans l’interface, les logs ou le prompt IA.
