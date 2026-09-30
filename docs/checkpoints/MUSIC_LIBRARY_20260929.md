# Checkpoint — Music, relevé local accessible

29 septembre 2026. Reprise après interruption de quota. Music reste le chantier
actif ; IDA Finance est la grande étape suivante demandée, pas démarrée ici.

## Tranche B.2 : références de versions et préécoute

La capacité suivante du prompt est maintenant exposée depuis la bibliothèque
locale : **Rattacher / préécouter**. L’utilisateur choisit un track existant ;
IDA persiste une référence au fichier choisi, son snapshot et son SHA-256, puis
peut accorder une préécoute locale temporaire. Aucun original n’est copié ou
modifié et aucun média n’est envoyé à un fournisseur.

- Vérification API : 2 tests PASS. La référence survit à la recréation du runtime ;
  même requête idempotente ; plage audio réelle et arrêt/expiration ; scope, Gateway,
  fichier absent/modifié, snapshot périmé et chemin invalide couverts. Le lecteur
  refuse les symlinks ; cette recette ne crée pas de lien symbolique Windows réel.
- Régression API : 5 fichiers Music/média, 33 tests PASS (inventaire, bibliothèque,
  sélection de projet, références locales et médias liés).
- Playwright : 4 tests PASS en Classic et Sci-Fi pour la bibliothèque et le nouveau
  lien/préécoute. La lecture est effectivement avancée dans un WAV synthétique de
  4 secondes. Responsive 390 px, arrêt, fermeture/réouverture persistante et erreur
  de fichier simulée couverts. Aucun original musical personnel n’est prétendu testé.
- Limites : préécoute jusqu’à 1 Gio, validation SHA-256 en blocs de 128 Kio, délai
  maximal 60 s ; ticket temporaire de 120 s lié à la session. Codec dépend du
  navigateur. Les fichiers excédant ces limites restent indisponibles pour ce lecteur.
- Typecheck Contracts/Domain/API/Web et leurs builds : PASS. Biome des 9 fichiers
  nouveaux de la tranche : PASS. Le build Web signale son chunk principal ~968 Ko.
- Le pourcentage de 23 % correspondait à l’ancien relevé et n’est plus le compteur
  de référence.

## Tranche B.3 : analyse WAV et waveform

Le panneau des versions rattachées propose désormais **Analyser ce WAV** et
**Consulter l’analyse enregistrée**. Le premier contrôle l’original puis lit le
WAV local par blocs ; le second reste disponible après redémarrage ou déconnexion
du disque et l’indique comme mesure historique non revérifiée.

- WAV RIFF standard PCM 8/16/24/32 bits et float 32/64 bits, 1–8 canaux,
  8–192 kHz, au plus 1 h et 256 Mio.
- Résultat : durée, fréquence, canaux, crête d’échantillon dBFS, RMS dBFS et
  waveform mesurée de 256 segments. Aucun BPM, LUFS ou tonalité n’est inventé.
- Persistance liée au workspace, propriétaire, version et empreinte SHA-256 ;
  doublons réutilisés après revalidation. Annulation, timeout, fichier modifié,
  format invalide et accès refusé ont des erreurs explicites.
- Smoke test réel via le runtime IDA : PASS sur un WAV du dossier configuré,
  54 754 640 octets, 44,1 kHz, 2 canaux, 310,4 s, crête −0,30 dBFS, RMS
  −6,05 dBFS, 256 segments et relecture persistée. La base était en mémoire ;
  le fichier original n’a pas été écrit.
- 43 tests API Music ciblés PASS, dont 22 tests du décodeur et les scénarios de
  persistance/scope/annulation. Playwright : 4 tests Classic/Sci-Fi PASS avec
  waveform visible, historique, préécoute synthétique et responsive 390 px.

### Avancement après B.3 (historique)

La grille stable des 17 conditions du brief vaut 475/1 700, soit **27,9 % →
28 %** : 0 absent, 25 amorce, 50 parcours partiel prouvé, 75 parcours vérifié
mais incomplet, 100 parcours complet avec persistance et erreurs. Le détail et
les points restants sont dans `docs/audit/MUSIC_STUDIO_PROGRESS_20260929.md`.

## Tranche B.4 : rôles de versions — vérifiée

- Rôles exclusifs À classer / Version courante / Master validé / Archivée,
  sélection explicite dans les versions locales. Pas de fichier supprimé.
- Changement optimiste par révision, remplacement atomique de l’ancien détenteur,
  historique append-only paginé et limité au propriétaire/workspace.
- Courante/master : empreinte originale revalidée ; archivage utilisable hors
  disque. Rôle inchangé idempotent, conflit de révision 409.
- Tests API et E2E Classic/Sci-Fi desktop/390 passés : choix, historique,
  fermeture/réouverture, archivage, reprise après réouverture de la base,
  fichier déplacé/modifié, autorisation et concurrence.
- Avancement de cette seule tranche : 500/1 700 → 29 %.

## Tranche B.5 : préparation partagée Music/La Baraque/Workspace — vérifiée

Entrées : **Music Studio → Contenus & promotion** ; **Demandes Music** dans
La Baraque et Workspace. Le même dossier s’ouvre dans chaque monde depuis les
boutons de la demande. La tâche est réutilisée, pas copiée.

- Morceau réel choisi, nature, titre, brief, échéance ; création transactionnelle
  via le moteur de tâches existant et une relation Music dédiée.
- Même dossier de notes/plans/revues documentaires dans les trois mondes.
  Depuis Workspace, fin de préparation après confirmation ; retour visible Music.
- Idempotence y compris réponse réseau perdue, erreur et réessai, isolation,
  révocation avant commit, reçu et dossier conservés après redémarrage.
- 9 tests API dédiés PASS. Régression commune : 7 fichiers API Music/Creative,
  **62 tests PASS** ; 2 fichiers Web, **6 tests PASS** ; navigateur, **6 PASS**
  (bibliothèque, versions, handoff, chacun Classic/Sci-Fi et responsive 390).
- Défaut trouvé puis corrigé par E2E : dossier créatif hors du flux, masquant les
  boutons de navigation. Aucun clic forcé utilisé pour faire passer le test.
- Captures : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-NjLjLn/`.
- Types/builds PASS. Nouveau chunk MusicPromotion ~12 Ko, chargé avec les mondes.
  Pas de polling, cloud, copie d’originaux, génération ni envoi ajouté.

Limite : il s’agit du **dossier de préparation**, pas du retour de média, du CRM,
d’un brouillon mail ou d’une publication programmée. Le détail est dans
`docs/MUSIC_CONTENT_HANDOFF.md`. Le serveur personnel n’a pas été redémarré.

### Compteur à reprendre désormais

550/1 700 → **32 %**, grille inchangée : critère 2 augmenté pour les rôles ;
critères 5 et 8 augmentés pour notes/tâche et demande de contenu suivie.
Le critère 13 reste à zéro puisqu’aucun brouillon mail n’est encore transmis.
L’utilisateur a demandé le compteur à chaque début de session, sauf demande
contraire ponctuelle (comme sa dernière reprise). Ne pas recycler 23/28/29 comme
état courant sans relire l’audit et ses preuves.

## Livré dans les sources et le build

- Inventaire conservant les versions et proposant le fichier le plus récemment
  modifié de chaque groupe de titre, sans déplacer ni importer les originaux.
- Lecture API authentifiée du relevé rattaché à un propriétaire/workspace,
  contrôles d’intégrité, recherche et pagination des groupes et versions.
- Music Studio → Bibliothèque → Consulter la sélection locale ; les parcours
  Classic/Sci-Fi et mobile sont testés. La fermeture restaure le focus du bouton.
- `Row` est défini au niveau du module dans `ReferenceEnvironment.tsx` : son
  identité React reste stable lors des rafraîchissements ; réouverture vérifiée
  au clic et au clavier, après Échap et après fermeture par bouton.
- Documentation API alignée sur la sélection explicite du projet artistique,
  en retirant l’ancienne mention erronée du « premier projet » choisi implicitement.

## Données locales

Le relevé réel est rattaché dans `.data/music-inventories/current.json` :
2 608 fichiers / 1 970 groupes, 104 Astromer, 38 Makerz, 1 828 à attribuer.
Ce dossier reste privé et ignoré par Git. Les versions existent dans le relevé,
mais ne sont pas encore des versions métier approuvées de tracks.

Le build a été reconstruit ; aucun processus personnel d’IDA n’a été arrêté ou
redémarré par cette tranche. Un serveur déjà ouvert doit être relancé pour charger
les nouvelles routes et la liaison du lancement local. Ne pas confondre les tests
isolés avec une recette de la session personnelle déjà ouverte.

## Preuves du 29 septembre

| Vérification | Résultat |
| --- | --- |
| Vitest `music-library`, `music-file-inventory`, `music-project-selection` | 3 fichiers, 19 tests PASS, 22,97 s |
| Playwright `e2e/music-library.spec.ts` | 2 tests PASS, 13,5 s, sortie 0 |
| `pnpm typecheck` | Contrats, domaine, API, web PASS |
| `pnpm build` | Tous packages PASS ; avertissement existant du chunk web principal de 957 Ko |
| Biome des nouveaux contrats/API/UI/CSS/test navigateur/scripts | 9 fichiers PASS |
| Relevé réel via `scripts/verify-music-inventory.mjs` | PASS : 2 608 / 1 970 ; page 13 913 octets ; 131 ms sur la seconde mesure |

Les tests navigateur utilisent un propriétaire et des données synthétiques sur
8791, aucun compte externe. Les premières exécutions dans le bac à sable passaient
leurs assertions mais la fermeture du processus Windows restait suspendue. La
dernière exécution isolée hors bac à sable s’est terminée normalement (sortie 0).

Captures relues (données synthétiques) :
`C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-m5XM0a/`, sous les dossiers
`music-library-Music-librar-c6b9b-ons-search-error-and-mobile` (Classic) et
`music-library-Music-librar-10fd3-ons-search-error-and-mobile` (Sci-Fi).
Chacun contient bureau, 390 px et détail des versions à 390 px.

Le test API réouvre son runtime et sa base persistante avant de vérifier le même
relevé. Il couvre aussi authentification, autre propriétaire/workspace, Gateway,
paramètres invalides, dépassement de taille, corruption, conflit de snapshot et
cohérence des données. Il ne prouve pas une analyse acoustique des fichiers.

## Restauration et Git

Checkpoint sources avant la tranche :
`tmp/source-checkpoints/2026-09-29T00-17-52-693Z-source` (873 fichiers).
Un checkpoint `source` est créé après cette validation ; son `manifest.json`
donne les tailles et SHA-256. Son chemin exact est reporté dans le compte rendu
de la session.
Vérifier avec `node scripts/checkpoint-frontend.mjs verify <chemin>` avant une
restauration dans un **nouveau checkout**. Ne jamais écraser l’arbre partagé.

Le manifeste du checkpoint B.3 a été vérifié (`895` fichiers, intégrité PASS).
Il contient sources, tests et documentation, mais pas les médias personnels, la
base locale, le coffre ou les sorties de build.

Le snapshot porte sur sources/configuration/tests/docs, pas sur les médias,
secrets, base utilisateur, `.data`, ni les fichiers de build. Les originaux du
dossier musical n’ont pas été modifiés. Ce n’est pas une sauvegarde intégrale du PC.

L’arbre Git partagé contient de très nombreux changements antérieurs non commités.
Ne pas effectuer de commit global : les fichiers d’intégration `app.ts`, `App.tsx`,
`ReferenceEnvironment.tsx` et les exports recouvrent aussi ces travaux. Le checkpoint
préserve cet assemblage sans enrôler les modifications des autres chantiers.

## Reprise exacte

1. Lire `docs/audit/MUSIC_STUDIO_PROGRESS_20260929.md` : grille globale 34 % au 30 septembre,
   matrice explicite des 17 conditions du prompt, pas un Music OS terminé.
2. Retour d’image réelle validé dans `docs/checkpoints/MUSIC_HANDOFF_ASSETS_20260930.md`.
   Prochaine tranche : checklist de release. Les rôles CURRENT/MASTER/ARCHIVED locaux et le dossier
   partagé sont vérifiés ; restent draft/mix/stems et carnet de sessions.
   Ne pas réimporter les 59,3 Go ni assimiler mtime à validation de master.
3. Ajouter ensuite CRM et
   échanges Workspace/La Baraque/Finance selon le brief.
4. Garder un point d’entrée visuel dans Music pour chaque capacité ajoutée.

Les prototypes recouvrement Fabrique et analyse vidéo La Baraque restent décrits
dans leurs documents dédiés ; cette tranche ne leur ajoute ni émission client,
ni paiement, ni le moteur Python complet de l’archive vidéo fournie.
