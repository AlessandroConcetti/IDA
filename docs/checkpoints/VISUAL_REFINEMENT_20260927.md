# Frontend — ordre inversé, premier lot visuel

## Reprise active

À la demande explicite de l'utilisateur, travailler dans l'ordre inverse de la
liste de l'audit : **visuel/orbe/animations → données Hub/Workspace → Fabrique
Menuiserie → CARE/Finance → Mail/Calendar → démarrage/voix → navigation globale**.
Le backend Agentic Library de Luna et le frigo photo/image restent en pause.
Le présent lot ne termine pas à lui seul le premier point.

## Réalisé

- Hub : zone cliquable de présence transparente, sans le disque opaque du
  matériau générique des boutons. Le focus clavier et le contraste forcé sont
  conservés. La sphère CSS/SVG a un bord plus fin, des reflets moins saturés et
  laisse voir le décor, particulièrement en Classic.
- Hub : remplacement du wordmark du bouton Accueil par l'orbe bleu de la barre
  commune. Le centre utilise une onde graphique à sept traits plutôt qu'une
  note de musique. C'est un décor, pas un indicateur de microphone ouvert.
- Workspace : deux filaments entrelacés souples par liaison, avec volume doux.
  Les extrémités et les contrôles restent fixes. Aucun mouvement n'invente un
  événement ou une activité d'agent. Seuls les événements déjà fournis au
  composant déclenchent les signaux d'activité existants.
- Budget de rendu conservé : 20 images/s en compact, 30 au bureau ; 17 ou 29
  échantillons par nouveau filament. Même arrêt masqué, pause et réduction.
- Aucune nouvelle dépendance, API, dépense, permission, donnée ou connexion.

Le shader WebGL progressif du Hub n'est pas réécrit : la correction du disque
touche son support commun, mais les captures de composition en mouvement réduit
montrent le rendu de repli CSS/SVG. Pas de promesse d'orbe universel déjà fini
sur le bureau Windows ou sur toutes les pages.

## Sauvegarde avant et preuves locales

- Copie des sources touchées avant édition :
  `tmp/frontend-checkpoints/visual-refinement-20260927-211627/`.
- Captures bureau inspectées après modification :
  `tmp/visual-refinement-20260927/hub-classic-desktop.png`,
  `hub-scifi-desktop.png`, `workspace-classic-desktop.png`,
  `workspace-scifi-desktop.png`.
- Tous les comptes et contenus des captures viennent de la fixture synthétique,
  pas des connexions personnelles. Les états vides restent honnêtes.
- 33 tests unitaires passent : rubans, géométrie réseau, données Workspace et
  politiques de mouvement. Vérification TypeScript Web et build Vite passent.
- 6 cas Hub passent : Classic/Sci-Fi × mobile/bureau/4K, transparence du support,
  orbe de marque, onde, retour accueil et barre commune unique.
- 7 cas Workspace passent : 2 palettes × bureau/mobile, tâche persistante,
  mouvement réduit, profondeur/pause/TV.
- 2 cas Hub passent : lumière/feuillage/icônes, pause/reprise et réduction.
  L'onde centrale est ajoutée aux éléments d'animation contrôlés.
  Une première reprise a échoué en Classic parce que WebGL masquait normalement
  l'orbe CSS attendu par ce test. Le scénario teste désormais explicitement le
  repli sans WebGL, tout en conservant Canvas2D ; les deux cas repassent.
- Biome : zéro erreur ; 55 avertissements préexistants dans la sélection
  Hub/E2E (notamment `!important`). Nouveaux fichiers rubans sans diagnostic.
- Limite conservée : Playwright finit les cas mais reste bloqué au nettoyage
  de son serveur Windows ; les sessions de test sont interrompues après les
  résultats. Il ne s'agit pas d'un exit 0 global du runner.
- Aperçu intégré non validé : le navigateur a conservé une page d'erreur après
  une connexion refusée au port de test. Aucun contournement de sa politique,
  aucune intervention sur l'instance personnelle. Recette par tests du dépôt.

## Périmètre Git et prochain pas

Arbre partagé très modifié. Isoler le commit des seules modifications Hub et
documentation ; ne pas embarquer les anciennes modifications du renderer Hub,
  des données ni l'ensemble du Workspace non suivi. Les rubans et leur raccord
Workspace restent aussi sauvegardés localement et décrits ici, dans le
sous-dossier `after/` de la sauvegarde avant. Ils sont dans la build testée.

Continuer le **point visuel** avec la revue comparative Chat et Mail Classic/
Sci-Fi, puis l'identité commune sur les autres pages et la bulle desktop.
Conserver les limites de l'audit : effets de présentation ≠ données utiles,
éditeur complet, preuve d'agent actif ou conformité exacte à toutes les maquettes.
Ne passer aux données Hub/Workspace qu'après cette tranche visuelle ou nouvelle
priorité explicite. Ne pas reprendre les connexions cloud à sa place.
