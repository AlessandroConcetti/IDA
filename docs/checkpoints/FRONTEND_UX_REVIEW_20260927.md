# Reprise frontend Astra — audit UX du 27 septembre 2026

## Point de reprise

L'utilisateur demande maintenant un audit de **tout le frontend restant**, trié
du fonctionnement le plus important aux finitions, avant poursuite de la
consolidation. Référence active :
[`FRONTEND_PRIORITIES_20260927.md`](../audit/FRONTEND_PRIORITIES_20260927.md).

Backend Luna en pause dans `AGENTIC_LIBRARY_GOVERNANCE_20260927.md`, non modifié.
Pas de nouvelle dépendance, fournisseur, dépense, connexion privée ou capteur.

## Corrections frontend de cette tranche

- `ConnectionsPanel.tsx` : accès direct Google Calendar → lecteur lecture seule,
  sans atterrissage sur la grille éditoriale. Six cartes conservées en cas de
  statut indisponible ; ce dernier n'est ni « configuré » ni « clé absente ».
- `fridge-inventory.ts`, `use-fridge-inventory.ts` : proposition d'import des
  anciens produits calculée sur ceux restant réellement à importer, doublons
  regroupés, liste de courses conservée, aucune suppression de la copie locale.
  Données navigateur privées de toute identité/révision serveur lors d'un ajout.
- `ClassicFridge.tsx`, `FridgeSyncNotice.tsx` : pas de message de sauvegarde
  réussie pendant chargement/échec ; compteur d'import explicite.
- `experience-system.css` : halo décoratif des modales contenu dans la largeur
  (débordement observé de 110 px à 390 px avant correction), titre/actions
  réorganisés sur mobile ; en-tête transparent au lieu du pavé marine en Classic,
  bouton Accueil distinct de la croix et sans rotation au survol.
- `google-environment-panel.css` : erreur plus contrastée en Classic.
- Tests ajoutés : `connections-panel.test.ts`, import legacy dans
  `fridge-inventory.test.ts`, `e2e/ux-capabilities.spec.ts`.

Le frigo photo et l'image générée du contenu ont été demandés puis explicitement
mis en attente par l'utilisateur au profit de l'UX. Aucun moteur d'images
opérationnel trouvé dans le dépôt. Ne pas prétendre qu'un quota de trois jours
rend une API gratuite. La photo doit produire des propositions à valider,
jamais des ajouts implicites. Aucun de ces deux parcours n'est implémenté ici.

## Vérifications

- Builds contracts/domain/API pour fixture et build Web Vite : PASS.
- Typage Web : PASS.
- 54 tests unitaires ciblés, 7 fichiers : PASS (frigo, connexions, Google tools,
  données Workspace et champ neuronal).
- Biome sur 9 fichiers de la tranche : PASS. Pour `experience-system.css`,
  analyse sans reformatage global : 16 avertissements ; le formatage global
  préexistant n'a pas été réécrit. Ne pas annoncer un lint du dépôt entier.
- Playwright, dernière série : **20 cas passent** — Baraque 7, paramètres 2,
  frigo/connexions 4, Workspace 7. Refus 409, brouillon conservé, reprise après
  relecture, vraie sauvegarde dans fixture, import sans doublons, aucun capteur,
  Google indisponible/navigation/focus/390 px vérifiés.
- Série précédente : **9 cas Hub passent** (Classic/Sci-Fi mobile, bureau, TV,
  erreurs/masquage et animations/pause) et **2 cas sidebar passent**.
- Les premières tentatives des nouveaux E2E ont échoué sur des sélecteurs trop
  stricts/ambigus, puis sur la modale débordante. Sélecteurs et défaut CSS
  corrigés, cas rejoués. Ne pas citer ces séries initiales comme totalement vertes.
- Limite du runner Windows : après les résultats des cas, le processus reste
  en attente de teardown ; les séries concernées sont interrompues dans leur
  propre session après terminaison des cas. Les résultats par cas sont verts,
  **pas une sortie globale Playwright 0 certifiée**. Diagnostic de fermeture de
  fixture distinct à prévoir ; aucun serveur IDA personnel n'a été arrêté.
- Avertissement build : chunk principal supérieur à 500 Ko, environ 918 Ko
  minifié / 271 Ko gzip. Optimisation de chargement à conserver dans l'audit,
  pas traitée par une refonte de dépendances ici.

Commandes via Node bundlé : `tsc -p apps/web/tsconfig.json --noEmit`,
`vite build apps/web`, `vitest run` ciblé et `playwright test` sur les fichiers
ci-dessus. Serveur éphémère localhost:8791, données synthétiques uniquement.

## Captures contrôlées

Copie locale conservée dans `tmp/ux-audit-20260927/`, hors sources et Git :

- `hub-classic-desktop.png`, `hub-scifi-desktop.png`
- `baraque-classic.png`, `baraque-scifi.png`
- `workspace-classic-desktop.png`, `workspace-scifi-desktop.png`

Les captures sont des rendus du build, pas les maquettes. Certains états sont
vides/désactivés car la fixture n'accède pas aux comptes ou services réels.
Hub Classic/Sci-Fi, Baraque Classic, Workspace Classic/Sci-Fi et la modale
Google Classic corrigée ont été inspectés visuellement dans cette tranche.
La palette Baraque reste volontairement commune à tous les thèmes.

## Limites / prochaine action exacte

1. Suivre les rangs du nouvel audit, sans recommencer les décors ni le backend.
2. Finir la recette des modales communes et coffres CARE, puis Finance :
   import/lecture/selection/révocation, focus, erreurs, mobile et persistance.
3. Poursuivre Mail/Calendar (états honnêtes), puis Menuiserie persistante.
4. Reprendre fidélité Chat et trois environnements, identité orbe et sous-vues.
5. Réserver exécutable, vraie voix, gestes et appareils à une recette autorisée
   ciblée ; aucun résultat synthétique ne clôture ces besoins.

Le dépôt reste partagé et très modifié. Ne pas tout stager ni committer des
médias, secrets ou modifications backend de Luna. Les corrections source de
cette reprise restent mêlées à la consolidation frontend antérieure ; les
documents d'audit peuvent être enregistrés séparément sans prétendre créer
une version logicielle complète ni un exécutable nouvellement déployé.
