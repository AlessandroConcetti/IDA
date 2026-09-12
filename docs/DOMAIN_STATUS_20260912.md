# IDA — état réel des domaines au 12 septembre 2026

## Portée

État fondé sur les routes, contrats, composants et services présents dans le code, complété par les corrections d’interface de cette session. **Fonctionnel local** signifie qu’un parcours logiciel est implémenté ; cela ne prouve ni une connexion fournisseur actuelle ni une validation sur téléphone physique. **Préparé** signifie que des briques existent sans service complet actif. **Non connecté** signale une intégration absente ; **non vérifié** signale l’absence de recette réelle dans cet audit.

Audit du code sans lecture des dossiers privés ni appel fournisseur. La recette UI complémentaire utilise la session déjà ouverte dans le navigateur. Les tests ne sont pas une preuve de branchement réel.

Vérifications de cette session : 78 tests ciblés Home/Care/roue et contrat/transport/statut HA réussis ; types Web/API, lint ciblé et build réussis. Bug Home reproduit (colonne de 150 px), corrigé et dimensions plein viewport contrôlées après rechargement. Contrôle responsive à 480/488 px CSS et ouverture des panneaux Home/Care. Aucun téléphone physique, micro, appareil domotique ou fournisseur n'a été activé pour cette recette. Voir `HOME_COCKPIT.md` et `CARE_INTERFACE.md`.

## Domaines

Complément hors domicile : [analyse des VPN et préparation IDA](PRIVATE_WEB_ACCESS.md). Diagnostic opérateur en lecture seule ajouté ; identité distante et essai téléphone extérieur toujours non réalisés. Aucune modification Home Assistant ni exposition réseau dans cette tranche.

| Domaine | État | Disponible | Limite / action restante |
|---|---|---|---|
| Core / API | Fonctionnel local | Commandes déterministes, permissions serveur, isolation workspace, Tool Gateway, audit | Pas d’orchestration générale autonome |
| Cerveau conversationnel | Branchement local ; runtime non vérifié ici | Dialogue partagé vers Ollama/Qwen sous activation explicite | Réponse sans outils, web, fichiers ou mémoire ; Astra non connecté |
| Music : catalogue / contenus | Fonctionnel local | Morceaux, releases, recherche, liens médias, bibliothèque privée, upload authentifié | Import effectif du dossier utilisateur non vérifié dans cet audit |
| Music : versions / gros exports | Partiel | Sélection du fichier le plus récent par nom normalisé, contrôle des doublons exacts | Limite 25 Mio ; titre existant conservé sans réconciliation des versions. Finaliser l’unicité côté serveur et l’import des masters |
| Music : écoute | Fonctionnel client | Lecture, boucle, EQ et compression d’écoute | Pas de DAW, export master traité ou mesure LUFS |
| Music : agents spécialisés | Préparé | Services de propositions, contexte borné, manifests et évaluations | Music Librarian et profils métier `PLANNED`, pas de route runtime activant ce service |
| Contenus / Approval Center | Fonctionnel local | Propositions manuelles, approbation/rejet et contrôle du hash du contenu | Aucune publication externe |
| Social / analytics | Non connecté | Matrice déclarative des capacités, interfaces sans métriques inventées | OAuth, comptes, synchronisation des mesures et publication à développer |
| Campagnes | Fonctionnel local partiel | Briefs et rattachement aux releases/morceaux | Campaign Manager, recommandations et automatisations désactivés |
| Tâches / calendrier | Fonctionnel local | Création, échéances, complétion ; programmation éditoriale interne validée/annulable | Pas de Google Calendar, scheduler d’exécution ou notifications |
| Mémoire | Fonctionnel local | Préférences proposées puis confirmées/rejetées | Conversation non mémorisée automatiquement ; agent Memory Manager `PLANNED` |
| Research | Fonctionnel manuel ; IA spécialisée non connectée | Documents du Core, liens de recherche, notes exportables, carte d’idées manuelle, briefs en tâches | Aucun RAG/index, extraction PDF/OCR ou vérification automatique des sources |
| Travel | Fonctionnel local | Menu pays animé/filtrable, carnets persistés en tâches, dates, étapes, budget, checklist, export et lien carte | Suggestions éditoriales ; pas de réservations, tarifs ou vols live |
| La Fabrique | Fonctionnel préparatoire | Templates, briefs/projets en tâches, export et suivi | Aucun agent, application ou workflow construit/déployé par le brief ; aucune invitation envoyée |
| Care | Interface dédiée ; métier préparé | Nouvelle interface clinique/recherche Classic/Sci-fi/mobile, navigation, dialogue général et profil facultatif éphémère | Aucun dossier médical persistant, pathologie enregistrée, analyse clinique, professionnel ou agent santé actif |
| Frigo | Brouillon client ; sauvegarde partielle | Inventaire manuel temporaire, achats, recettes éditoriales ; Classic exporte courses/repas vers les tâches | Inventaire durable, OCR/caméra et détection non connectés |
| Home | Interface fonctionnelle ; domotique préparée | Cockpit corrigé plein viewport, sans sprite générique superposé ; maison holographique illustrée, pièces, recherche et ambiances d’écran | Pas de jumeau 3D du domicile ni de capteurs présumés connectés |
| Home Assistant | Pilote lecture seule ; connexion non vérifiée | Statut authentifié, cible fixe d’une lampe, HTTPS borné, coffre serveur et audit | Nom de token annoncé par l’utilisateur, mais secret utilisable non confirmé. Qualifier coffre, HTTPS et entité, puis lecture réelle ; aucune commande physique |
| Météo | Adaptateur implémenté ; runtime non vérifié ici | Open-Meteo par API partagée, choix de ville, consentement, audit et cache | Confirmer une lecture réelle et sa fraîcheur ; pas de géolocalisation implicite |
| Voix | Conditionnelle ; matériel non vérifié | Dictée française locale si navigateur/pack compatibles, TTS locale, clic explicite et arrêt | Recette micro/haut-parleur/iPhone ; aucun fallback cloud silencieux |
| Robot / hologrammes | Visuel interactif | Vidéo décorative, pause, dialogue, états écoute/parole | Pas de motion tracking, caméra, biométrie ou synchronisation des lèvres |
| Identité / téléphone | Fonctionnel local ; réseau non exposé | Verrou, sessions révocables, contrôle serveur ; frontend compilé local et layouts mobiles | Appairage distinct, HTTPS privé et jalon sécurité réseau non livrés ; `127.0.0.1` n’est pas l’adresse du PC depuis le téléphone |
| Finance | Non disponible | Carte et profil de gouvernance planifié | Aucun compte, budget métier ou API bancaire ; lecture seule par défaut lors de la future intégration |
| Employment | Non disponible | Aucune implémentation identifiée dans les modules, contrats, routes ou manifests | Définir le domaine et sa première tranche ; ne pas annoncer d’offres, candidatures ou connexion LinkedIn |
| Admin / Legal / IDACAR | Planifié | Navigation et profils `PLANNED` | Aucun connecteur ni outil métier spécifique |

## Preuves de code

- Modules et activation réelle : `packages/domain/src/modules.ts`, `agent-registry.ts`, `environment-brains.ts`.
- Core, catalogue, mémoire, validations, calendrier et tâches : `apps/api/src/app.ts`, `database.ts`, `ida-core.ts`.
- Dialogue et préparation musicale : `apps/api/src/local-dialogue.ts`, `local-music-proposal.ts` ; `apps/web/src/MusicFolderImport.tsx`, `music-import-selection.ts`, `StudioPlayer.tsx`.
- Research / Travel / Fabrique : `apps/web/src/ReferenceEnvironment.tsx`, `TravelNotebook.tsx`, `DestinationMenu.tsx`, `FabriqueEnvironment.tsx`.
- Care : `apps/web/src/CareEnvironment.tsx`, `CareProfile.tsx`, `EnvironmentLobby.tsx`. Les exemples médicaux des maquettes ne deviennent pas des données utilisateur.
- Home : `apps/web/src/HomeEnvironment.tsx`, `home-environment.css`. Le décor `/design/user-20260909/home-hologram-v1.png` est référencé dans le hero ; ce média local n’est pas un plan capté du domicile.
- Intégrations : `apps/api/src/home-device.ts`, `home-assistant-transport.ts`, `connector-vault.ts`, `home-weather.ts` ; `apps/web/src/local-voice.ts`, `ImmersivePresence.tsx`.
- Limites réseau : `apps/api/src/runtime-config.ts`, `identity-context.ts`, `local-preview.ts`.

Le statut « AI ONLINE » de `ida-core.ts` est construit pour le Core déterministe : il ne prouve pas que le modèle répond. De même, `CONFIGURED` pour Home Assistant ne prouve pas une lecture réussie. Le rapport `FINALIZATION_STATUS_20260911.md` reste historique, notamment sa mention d’un token encore non créé.

## Actions prioritaires

1. Home Assistant : renseigner le secret uniquement dans un parcours serveur sécurisé, jamais en conversation ou frontend. Le coffre local ne contient pas encore le token annoncé. Préparer un transport HTTPS vérifié et une entité réelle, puis réussir une lecture auditée avant tout contrôle physique. Le diagnostic distingue maintenant ces prérequis sans déchiffrer le secret ou contacter le hub. Le redémarrage local a remis le navigateur sur le verrou : affichage du nouveau diagnostic dans la session à recontrôler après déverrouillage.
2. Cerveau/actions : confirmer la réponse du modèle local, puis relier progressivement ses propositions structurées aux seuls outils autorisés du Core avec validation, audit et approbation. Aucune capacité d'action générale ne doit être déduite d'une simple réponse textuelle.
3. Téléphone : livrer l'identité/appairage distinct avec HTTPS privé et jalon de sécurité réseau ; contrôler ensuite l'accès sur un appareil physique. Le responsive Home/Care a été contrôlé, ce qui ne vaut pas accès réseau opérationnel.
4. Voix : recette micro, arrêt et lecture vocale sur PC puis iPhone, en respectant les capacités réelles du navigateur, sans fallback cloud implicite.
5. Données : finaliser imports volumineux et versions musicales, puis la persistance sécurisée Frigo/Care avec consentement, suppression et gouvernance.
6. Domaines : documents/sources pour Research, contrats métier pour Employment, puis connecteurs externes avec autorisations explicites. Les cartes et boutons ne valent jamais connexion.
