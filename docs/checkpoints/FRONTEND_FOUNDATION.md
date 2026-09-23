# IDA Frontend Foundation + Fabrique Web — checkpoint actif

Mission utilisateur : pièce jointe `52028722-05ca-4b28-811b-41d5a0f46feb/Texte collé.txt`, lue intégralement.
Date de départ : 2026-09-22. HEAD de départ : `97be4c8`.

## Phase 0–2 — audit terminé, fondation installée, MCP en vérification

Stack observée : pnpm 11, React 19.2.8, TypeScript 7, Vite 8.2.2, CSS existant sans Tailwind ni shadcn.
Monolithe modulaire API-first ; thèmes Classic / Sci-Fi existants à préserver.
Fabrique existante : briefs liés aux tâches et Creative Engine documentaire (références/plans/progress/notes/reviews).
MCP métier déjà dans IDA ; ne pas confondre les serveurs UI de développement avec les outils métier autorisés.
Luna possède les connexions/voix/gestes : voir `LUNA_CONNECTIONS.md`.

## Ordre inchangé

0–1 audit → 2 shadcn/MCP → 3 Watermelon → 4 Motion Primitives → 5 Magic UI → 6 React Bits →
7 Cult → 8 Origin → 9 Haikei → 10 R3F optionnel → 11 couche commune → 12 resolver →
13 Design Brain → 14 intégration Fabrique → 15 composer → 16 preview/validation → 17 tests → 18 docs.

## Stratégie de livraison

Audit ciblé des URLs fournies ; pas de copie massive ni exécution automatique de code de registry non relu.
Composants sélectionnés, versions épinglées, CSS isolé, imports lazy. Composer visible depuis La Fabrique.
Réutiliser tâches/API existantes pour toute persistance ; aucun nouveau magasin métier client.
Preview isolée et export local ; aucune publication externe implicite.

## Journal

- Transition : checkpoints créés avant modifications. Audit des sources délégué ; aucun changement au runtime des connexions.
- Phase 0–1 : chemins Fabrique, CreativeEngineWorkspace, thèmes CSS, routing App et build Vite identifiés. Pas de Tailwind/shadcn préexistant. SDK MCP métier v2 déjà installé côté API.
- Phase 2 : shadcn 4.21.0 (développement), Tailwind 4.3.3 sans Preflight + préfixe `ui`, Motion 13.4.0,
  cva/clsx/tailwind-merge installés avec `--ignore-scripts`. `components.json` et alias Vite/TS ajoutés.
  `shadcn info --cwd apps/web` reconnaît Vite, Tailwind4 et tous les chemins. Un bouton adapté aux tokens IDA est local.
  TypeScript7 refuse `baseUrl` : supprimé, alias conservé via `paths`. Handshake MCP pas encore testé.
- Préparation parallèle : resolver/design brain purs et leurs 13 tests livrés ; UI composer en cours, pas encore validée ni annoncée opérationnelle.
- Reprise après quota : sources et UI récupérées sur disque, pas de reprise à zéro. Shadcn et Magic UI MCP : initialize + recherche réelle réussis ; Watermelon initialise, outil de recherche réellement nommé `search` (config corrigée).
- Demande de sauvegarde : `tmp/frontend-checkpoints/2026-09-22T16-43-23-514Z-before` créé, 250 fichiers vérifiés SHA-256, 87 412 460 octets.
  `dist/` contient l'ancienne version compilée réelle avant cette livraison. `working-source/` est l'état en cours lors de la sauvegarde,
  pas une reconstruction des modifications non committées antérieures. `last-committed-frontend.zip` conserve HEAD `97be4c8`.
  Le snapshot AFTER reste à créer après build/validation.

## Reprise vérifiée — 23 septembre 2026

- Fondation, registry et composer montés dans La Fabrique. `pnpm build` complet réussi ;
  40 tests unitaires frontend ciblés passent. Les trois MCP UI ont répondu réellement (voir `FABRIQUE_MCP.md`).
- Parcours navigateur isolé terminé : **6/6 réussis** (Web Studio + MCP). Génération,
  responsive 390/768/desktop, export HTML sans scripts, CSP, mouvement réduit, catalogue,
  retour clavier, lecture MCP et révocation vérifiés. Aucun compte ni provider réel sollicité.
- AFTER fondation : `tmp/frontend-checkpoints/2026-09-22T23-32-33-553Z-after`,
  **298 fichiers / 172 211 752 octets**, copiés et SHA-256 vérifiés. BEFORE inchangé,
  250/250 hashes revérifiés. Le AFTER inclut désormais `apps/web/public`.
- Limite : snapshots frontend uniquement, pas API, coffre, données ni dépendances workspace.
  `working-source` BEFORE est une capture en cours, pas les sources exactes avant session.
- Docs sources, MCP, design system et notices complétées ; usages préparés distincts des installés.

## Extension explicite utilisateur — Chat Sci-Fi

Référence : `C592EF64-0103-46D0-A510-2B99223E1406.png` (Downloads).
Le thème Classic ne doit pas être refondu. ChatStarfield vectoriel et CSS sombre créés ;
raccordement ChatWorkspace/LocalDialogue en cours. Les actions/chat/voix doivent réutiliser
les handlers existants, aucun faux statut, message ou compteur. Fond animé qui respecte
OFF/réduction de mouvement/page cachée. Connexions Luna hors périmètre.

## Prochaine action exacte

### Progression enregistrée le 23 septembre, reprise frontend uniquement

- Fabrique et Finance Classic/Sci-Fi créés avec décors propres locaux, vrais boutons et aucune somme fictive. Modules Finance encore sans sources réelles ; ne pas les annoncer connectés.
- Care/Home mobile : structures des références, palettes Classic/Sci-Fi, aucun faux statut médical/domotique ; vérification visuelle en cours (cadrage Home corrigé après détection d’un sélecteur de sprite hérité).
- Son local Web Audio : matin/soir, clics par thème, opt-in pour cette session, volume/coupure, pause voix/onglet/dialogue. 5 tests unitaires et parcours navigateur réussis. Pas de nouvelle dépendance runtime.
- Roue : Legal retiré du catalogue client ; cartes répétées pour boucle sans retour arrière, rotation automatique, pause hover/focus/préférence. 2 parcours navigateur passent. Navigation Core inchangée.
- Ajouts utilisateur à terminer dans l’ordre : robot Immersif MOBILE aller-retour depuis `F:/IDA/ROBOT MOBILE.mp4`, puis thème Modern depuis `B475EF16-903E-4B6C-B919-14AEC4725ED8.png`. Format robot PC non reçu : ne pas le remplacer.
- Dernier build web passe. 56 tests unitaires ciblés passent. Aucun redémarrage supplémentaire d’IDA, aucun travail Google/OAuth/HA.
- Snapshot AFTER final reste à créer une fois ces nouveaux ajouts vérifiés. BEFORE et AFTER fondation intacts.

Terminer les interfaces demandées le 23 septembre : Fabrique Classic et Sci-Fi (bibliothèque,
quatre modules, domaines), Finance Classic et Sci-Fi (toutes valeurs fictives supprimées),
navigation commune escamotable au bord gauche avec clavier/tactile. Chat Sci-Fi raccordé,
audit indépendant : send/auth/idempotence inchangés, aucun micro/envoi implicite.
Fonds propres dérivés des références via imagegen ; originaux préservés.
Vérifier build/types + E2E dédié et rendu captures, puis créer un AFTER final distinct.
Ne pas relancer Google, OAuth, Home Assistant ou une migration du Core.

## Reprise active — paramètres, robot et Modern

**Section historique ci-dessous. Consulter la livraison du 23 septembre en fin de fichier
pour la prochaine action ; le diagnostic Modern décrit ici est résolu.**

- Paramètres globaux branchés dans App (toutes branches authentifiées) : gear bas/centre,
  zone tactile 44 px, dialogue natif, thème/mouvement/son/accès voix/connexions/mémoire/verrou.
  Son déplacé du menu latéral au panneau ; aucun son ni capteur implicite.
- Robot mobile livré sur disque : `robot-mobile-loop.mp4`, 20,04 s, 481 frames, H.264 High
  720×1232, 24 fps, muet, décodage complet réussi. Source originale intacte.
  RobotMobileBackdrop conserve la frame en pause ; arrêt dialogue/voix/OFF/reduced/pagehidden.
  Deux E2E robot réussis ; PC inchangé. Son/mouvement/settings validés desktop/mobile.
- Modern implémenté (ModernHome/ModernWorlds/CSS, thème n°5) avec assets propres imagegen.
  Limite encore ouverte : centrage initial se décale vers Music après capture/layout ;
  diagnostic `e2e/modern.spec.ts` provisoirement instrumenté, à retirer après correction.
  Le sélecteur actif Modern a été renforcé pour palette nacrée, pas bleu hérité.
- Résultats : 83 tests purs passent. Batterie 20 E2E : 17 passent, 3 échouaient.
  Deux tests Chat passent depuis correction de la collision gear/Explorer (espace réservé).
  Les deux E2E Modern restent à finaliser ; ne pas annoncer une validation complète.
- Dernier build web réussi ; aucun redémarrage utilisateur. Warning bundle principal ~777 kB.
- Prochain ordre : corriger centrage Modern → vérifier screenshots/rotation/navigation →
  E2E ciblés + lint + build final → AFTER distinct → préparer Azure/Vertex, voir CLOUD_BUILD_NEXT.md.
- Le dépôt contient beaucoup de modifications précédentes mêlées (Luna/API/connexions).
  Ne pas les inclure aveuglément dans un commit frontend et ne pas committer les médias.

## Livraison frontend et reprise — 23 septembre 2026

- Modern : centrage initial, resize, navigation, reflets et boucle vérifiés PC/mobile.
  Le saut était induit par capture fullPage du navigateur ; captures viewport désormais,
  tests resize indépendants. Vrai retour visible au-dessus des environnements plein écran.
- Robot mobile aller-retour, sons volontaires, chat Sci-Fi, Fabrique/Finance deux thèmes,
  Care/Home mobile et paramètres partagés validés en navigateur isolé.
- Trois boutons ronds bas/centre : micro, paramètres, caméra. Reflets/orbite animés selon
  palette, OFF/réduction/visibilité respectés. Le mouvement décoratif n’indique pas un
  capteur actif. Réserve d’espace ajoutée aux docks mobiles pour éviter leur superposition.
- CameraPreview réutilise CameraManager. Autorisation explicite, vidéo seule ; annulation
  permission tardive, arrêt pistes sur échec, fermeture/démontage/masquage/invalidation.
  **Utilisateur confirme voir son image réelle le 23 septembre.** L’extinction du voyant
  matériel à fermeture n’est pas encore confirmée personnellement ; arrêt simulé testé.
  Reconnaissance MediaPipe live PAS encore branchée (panneau le dit explicitement).
- Tests purs : 88/88 dans 12 fichiers ; lint ciblé sans erreur ; build/types web réussis.
  21 parcours frontend réussis en batterie + 2 contrôles capteurs réussis en reprise ciblée.
  Les deux échecs initiaux capteurs concernaient la simulation pagehide/pageshow du test,
  pas l’arrêt des pistes (compteur d’arrêt confirmé). Détails finals de placement ci-après.
- Le serveur et Ollama étaient tous deux arrêtés : préflight puis relance du launcher existant.
  API PID43544, Ollama PID32212, pin modèle vérifié ; HTTP8787 répond200 avec build courant.
  Origin privée conservée https://zaratustraama.taild50a0e.ts.net ; aucun Funnel ni changement HA.
  Dialogue local actif, Notion flag actif, Outlook flag transmis. Google/iCloud/Maps/YouTube
  non activés par cette relance, leurs consentements restent distincts et non attestés.
- Aucun appel provider, email ou action TV effectué pour tester ce frontend.
- Les interfaces ne prouvent PAS la connexion des fonctions Finance, IDACAR, labos,
  prospection, etc. Les panneaux de prérequis restent à remplacer par leurs fonctions
  dans les tranches métier ; ne pas déclarer « tous boutons métier100% ».
- Nouvelle roadmap utilisateur : `DELIVERY_ROADMAP_20260923.md`. Après clôture frontend,
  raccordement Qwen/Gemini puis voix/motion, cloud/agents, Fabrique, Tailscale, HA en dernier.
  Proposition crédit cloud : `../CLOUD_BUILD_PREPARATION.md`, aucune dépense activée.

## Reprise active — éclairages et adoption Fabrique, 23 septembre au soir

La demande utilisateur d'accentuer l'éclairage a repris la priorité sur Qwen/Gemini.
Ne pas recommencer les connexions Luna ni la webcam (image physique confirmée).

- Placements des trois boutons : 7 E2E ciblés passent (capteurs, Home/Care mobile,
  paramètres). Snapshot précédant le renforcement lumineux :
  `tmp/frontend-checkpoints/2026-09-23T16-20-04-679Z-after`, 343 fichiers,
  224343619 octets vérifiés SHA-256. Sauvegardes BEFORE et AFTER fondation conservées.
- Éclairages renforcés dans `SceneAtmosphere` : variations plafond/fenêtres,
  reflets au sol, ombre progressive ; primitive `AnimatedBackdrop` de la Fabrique
  réutilisée réellement dans IDA. Lumières adaptées à Finance/Fabrique/Care/Home.
- Finance : retrait du WebGL qui montrait une photo d'accueil erronée ; chaque
  thème réutilise sa propre image. Classic : plus de distorsion des montants de
  fenêtres par l'ancien effet d'eau ; lumière/reflets conservés.
- Audit adoption : MotionPanel n'était plus utilisé après la refonte du landing.
  Il anime maintenant les 4 modules et Domaines populaires, avec policy commune,
  OFF/LOW/réduction et pauses. Aucun wrapper qui change leur disposition.
  MCP UI = outils de découverte développeur, pas effets runtime automatiques.
- 50 tests purs ciblés passent, 7 fichiers ; vérification TypeScript/build web
  réussie ; lint 9 fichiers centraux sans avertissement. D'autres CSS existantes
  gardent des warnings de spécificité non bloquants. Chunk principal ~831kB,
  warning de taille à garder dans le travail d'optimisation, pas de nouveau package.
- 7 E2E Fabrique/Finance/Web Studio + 6 E2E éclairages passent. Le seul échec
  intermédiaire était un test exigeant `paused` alors que OFF supprime entièrement
  l'animation : assertion corrigée pour accepter `animation-name:none` en OFF.
  Les variations effectives light/shade, survol Motion, arrêt et page cachée sont
  vérifiés ; aucun capteur ni appel fournisseur pendant ces tests.
- Captures isolées : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-TT5cl9`.
  Comparaison accueil Classic et Finance Sci-Fi, Fabrique Classic/Sci-Fi vues.
  Intensité sur écran réel encore soumise au retour utilisateur, pas une fidélité
  cinématique «100%» certifiée par les styles calculés.
- Snapshot après éclairages : `tmp/frontend-checkpoints/2026-09-23T21-14-00-686Z-after`,
  345 fichiers / 224438390 octets vérifiés SHA-256. Pas de coffre ni données privées.
- À la reprise du soir, ports8787 et11434 absents. Launcher existant redémarré sans
  tuer de processus : API42960, Ollama39632 ; pin Qwen vérifié, mêmes options.
  HTTP8787 répond200 ; index-EOUi9JaF.js / index-B4Ko9M_y.css servis et les sélecteurs
  éclairages/Fabrique présents. Aucun test navigateur de session réelle après ce
  démarrage ; l'utilisateur peut devoir recharger et déverrouiller lui-même.

### Prochaine action, sans changement de roadmap

Revue visuelle utilisateur, puis inventaire boutons réellement utiles et Qwen/Gemini.
Audit lecture seule déjà fait : `local-preview.ts` ET `server.ts` ne passent pas
`cloudChat` à createApp ; Gemini y reste DISABLED malgré une clé au coffre.
Il manque une configuration revue (plan, conservation, quota observé/péremption).
Ne jamais inventer les quotas ni forcer READY. Qwen reste le défaut.
`PendingLocalChatRequests` indexe le prompt seul : séparer provider et requête avant
ajout Gemini, préserver requêtes incertaines, idempotence, emails et commandes TV.
La route Gemini ne reçoit actuellement ni outil ni contexte email. Quota en mémoire
à rendre sûr au redémarrage avant automatisation quotidienne. Gemini AI Studio
n'est pas Vertex/les crédits Google Cloud. Aucun raccordement API réalisé ici.
