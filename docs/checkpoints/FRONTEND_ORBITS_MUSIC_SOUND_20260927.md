# Frontend — orbites, Music Studio et ambiance d'accueil

## Piste active et prochaine action

Frontend Astra uniquement. Backend Luna, API/providers et frigo laissés intacts.
L'ordre inversé de `../audit/FRONTEND_PRIORITIES_20260927.md` reste actif.
Les sept maquettes et les demandes récentes sont conservées dans
`../audit/FRONTEND_REFERENCE_REGISTER_20260927.md`.

**Reprendre par Chat Classic/Sci-Fi** : prénom réel, orbes signature, proportions
des trois colonnes, captures comparées 1536 × 1024 et 390 × 844. Ensuite Mail,
puis la variante Classic manquante du Calendrier. Les états et chiffres des
maquettes sont illustratifs, jamais des données personnelles à copier.
Cette tranche ne clôt ni la fidélité de tous les écrans ni le lancement natif.

## Changements vérifiés

- Hub : orbe à gauche du champ de la barre commune, commandes caméra/voix à
  droite. Ordre et absence de chevauchement contrôlés à 390, 1672 et 3840 px,
  dans les deux palettes. Les autres écrans conservent leur barre commune.
- Carrousel : révolution réelle des bulles autour du centre, contre-rotation
  pour garder les textes droits, ligne/repères tournant au même rythme. Pause
  souris, clavier, bouton, onglet masqué et mouvement réduit. En petit écran,
  grille tactile fixe accessible. Le matériau glass global ne dessine plus
  de rectangle autour des bulles, y compris sélectionnées/survolées.
- Music Studio : flammes, braises et lumière du foyer calées dans les coordonnées
  du décor 1536 × 1024. Néons et halos Ambre/Glacier/Violet/Rose/Menthe, intensité
  réglable. Contrôles beige Classic, sombres Sci-Fi, dans les bornes mobiles.
  Pause « Reflets », modale, onglet masqué, mouvement réduit. **Décor virtuel
  uniquement**, sans commande Home Assistant ni préférence persistante.
- Connexion : nappe synthétisée localement après activation volontaire,
  indépendante de la piste audio et du mouvement de la vidéo. La vidéo reste
  muette. Silence initial, arrêt immédiat, suspension masquée, libération à la
  connexion. Erreur visible si le navigateur refuse la lecture ; pas de bouton
  prétendant jouer lorsque le contexte reste suspendu.
- Moteur son : volume de la nappe relevé et borné ; confirmation d'état après
  démarrage réel. Course corrigée lorsqu'une pause/visibilité change pendant
  la permission audio initiale, avec deux tests de régression dédiés.

L'ancien bouton d'accueil démutait seulement la vidéo sans mesurer de signal.
Le média possède une piste audio : il n'est donc pas établi qu'elle était
absente. Le correctif rend la nappe indépendante de cette incertitude.

## Preuves de cette reprise

- 21 tests unitaires PASS : son (10), orbites (8), Music Studio (3).
- 12 cas navigateur PASS, runner exit 0 : Hub (6), audio (3), Music Studio (2),
  Carrousel (1), serveur de fixture isolé 8791, données synthétiques, réseau
  externe bloqué. Les trois tests audio ont été rejoués après correction de la
  course ; le Carrousel après suppression des cadres : PASS, exit 0.
- Audio : vrai AudioContext/AnalyserNode du navigateur, RMS supérieur à 0,003,
  crête inférieure à 0,1, contexte `running`, puis `closed` à la coupure et au
  déverrouillage. Fonctionne également avec vidéo absente en mouvement réduit.
  **Ce n'est pas une écoute des enceintes physiques Windows.**
- TypeScript Web PASS ; Vite build PASS. Avertissement existant de bundle
  principal supérieur à 500 kB (environ 920 kB minifié), à optimiser séparément.
- Biome : 12 fichiers ciblés sans diagnostic. Pas de revendication de lint
  global propre sur l'arbre partagé. Aucun nouveau paquet, fournisseur, média,
  secret, capteur ni changement de permissions.
- Captures inspectées : Music Classic bureau et Sci-Fi mobile ; Carrousel
  bureau avant/après retrait du matériau rectangle. Les captures ne prouvent
  pas une conformité globale pixel-perfect aux sept maquettes.

Résultats locaux : `tmp/frontend-final-20260927/`,
`tmp/frontend-sound-confirmed-20260927/`,
`tmp/frontend-orbits-confirmed-20260927/`.
Serveur de tests séparé du serveur personnel ; pas de redémarrage du `.exe`
ni preuve de rafraîchissement de l'onglet personnel.

## Sauvegarde et périmètre Git

Sources avant : `tmp/frontend-checkpoints/references-20260928/` (nom historique
du dossier), et `tmp/frontend-checkpoints/music-room-20260927/` pour le raccord
Music Studio. Sources après : `tmp/frontend-checkpoints/orbits-music-sound-20260927/`.

L'arbre contient de très nombreuses modifications antérieures, frontend et
backend. Commit ciblé du son d'accueil, du composant Music et de son raccord
seul, du placement Hub et de cette documentation ; aucune inclusion globale
de l'arbre, aucun média. Le raccord Music est indexé par patch isolé pour ne
pas capturer les autres changements Google/La Fondation du même fichier.
Le Carrousel et les extensions des tests navigateur restent dans leurs fichiers
locaux préexistants, sauvegardés après, sans embarquer toute la réécriture
antérieure de WorldWheel ni les autres tests de la branche partagée.

## Reste explicite

Chat/Mail/Calendrier fidèles aux références ; décor/colonnes complets Carrousel ;
orbe signature universel dont bulle Windows ; recette native startup/voix.
Les limitations fonctionnelles de l'audit principal restent vraies : des
animations vérifiées ne prouvent pas l'activité d'agents ou l'accès aux API.
