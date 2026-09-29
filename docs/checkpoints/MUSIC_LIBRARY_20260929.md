# Checkpoint — Music, relevé local accessible

29 septembre 2026. Reprise après interruption de quota. Music reste le chantier
actif ; IDA Finance est la grande étape suivante demandée, pas démarrée ici.

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
Un nouveau checkpoint `source` est créé après cette validation, sous le même
répertoire ; son `manifest.json` donne la date, les tailles et SHA-256.
Vérifier avec `node scripts/checkpoint-frontend.mjs verify <chemin>` avant une
restauration dans un **nouveau checkout**. Ne jamais écraser l’arbre partagé.

Le snapshot porte sur sources/configuration/tests/docs, pas sur les médias,
secrets, base utilisateur, `.data`, ni les fichiers de build. Les originaux du
dossier musical n’ont pas été modifiés. Ce n’est pas une sauvegarde intégrale du PC.

L’arbre Git partagé contient de très nombreux changements antérieurs non commités.
Ne pas effectuer de commit global : les fichiers d’intégration `app.ts`, `App.tsx`,
`ReferenceEnvironment.tsx` et les exports recouvrent aussi ces travaux. Le checkpoint
préserve cet assemblage sans enrôler les modifications des autres chantiers.

## Reprise exacte

1. Lire `docs/audit/MUSIC_STUDIO_PROGRESS_20260929.md` : estimation globale ~20 %,
   matrice explicite des 17 conditions du prompt, pas un Music OS terminé.
2. Prochaine tranche : références de fichiers → tracks/versions choisies → preview
   réelle. Ne pas réimporter les 59,3 Go ni assimiler mtime à validation de master.
3. Ajouter ensuite analyse/waveform locale, notes/checklist de release, CRM et
   échanges Workspace/La Baraque/Finance selon le brief.
4. Garder un point d’entrée visuel dans Music pour chaque capacité ajoutée.

Les prototypes recouvrement Fabrique et analyse vidéo La Baraque restent décrits
dans leurs documents dédiés ; cette tranche ne leur ajoute ni émission client,
ni paiement, ni le moteur Python complet de l’archive vidéo fournie.
