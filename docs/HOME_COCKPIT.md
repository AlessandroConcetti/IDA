# IDA Home — interface mise à jour le 12 septembre 2026

## Correctif du 12 septembre

- Cause reproduite dans le navigateur : `.house-environment { position: relative }` annulait le plein écran commun. Après masquage du rail de l'accueil, Home occupait sa première colonne de **150 px**, avec sa colonne de contenu à **0 px**. Le pseudo-élément hérité affichait le sprite spatial agrandi sur le reste du viewport.
- Home conserve maintenant `position: fixed` et supprime explicitement les deux pseudo-éléments génériques. Contrôle après compilation/rechargement : largeur Home égale au viewport (2372,8 px CSS observés), position (0,0), aucun sprite hérité. Les libellés sur les points holographiques et les titres des dialogues restent lisibles dans Classic.
- « Voir la maison holographique » ouvre une image entière avec quatre accès aux pièces, sans capteur ni état fictif. Sur petit écran, accueil intérieur lumineux et six raccourcis ; l'image entière reste accessible par ce bouton. La vignette de citation secondaire est masquée pour ne pas précéder le hero lors du réordonnancement mobile.
- Accueil épuré : clic direct sur les cartes, suppression du bouton « Entrer dans… », du second explorateur, du contrôle d'ambiances de la roue et du bandeau blanc de signature. « Explorer tous les espaces » est conservé. Les préférences système de mouvement réduit restent respectées ; Home conserve ses réglages dans Paramètres.
- Navigation et dimensions vérifiées dans le navigateur connecté en grand et petit viewport (480/488 px CSS), ouverture du panneau holographique et fermeture. L'outil de capture présente un décalage de taille avec le zoom du navigateur : les images de capture seules ne constituent pas une qualification pixel à pixel. Téléphone physique et accès réseau restent non qualifiés.
- Vérifications : 78 tests ciblés, types Web/API, lint des 15 fichiers TS concernés et build Web réussis. API locale redémarrée avec le build, toujours sur `127.0.0.1:8787`, sans exposition LAN.

Les indications de validation et de taille de bundle du 11 septembre ci-dessous sont historiques ; cette section prévaut.

## Intégration

L'environnement `home` de la roue ouvre désormais `HomeEnvironment`, chargé à la demande. Il remplace l'ancien menu Home générique, sans créer de nouvelle application, de mémoire cliente ou d'identité.

Les trois références fournies (`IMG_1839.jpeg`, `IMG_1840.jpeg`, `05E09360-9CE1-4D92-A180-04A0EB6D4AD3.jpeg`) guident la composition : rail latéral, maison holographique, pièces, panneaux, verre bleu, navigation mobile et orbe centrale. Le décor ne contient pas d'interface rasterisée. Toutes les commandes sont des éléments HTML séparés. Il ne s'agit ni d'un modèle WebGL ni d'un relevé du logement réel. Une reproduction pixel à pixel n'a pas été qualifiée.

## Parcours branchés

| Entrée | Destination / effet réel | Limite |
|---|---|---|
| Cuisine / Mon frigo | Interface Classic ou Sci-fi existante, selon le thème | Inventaire manuel temporaire, aucune détection |
| Salon / Médias | Music Studio, bibliothèque et lecteur existants | Ni scène HA ni commande des enceintes |
| Chambre | Ma journée partagée et Care | Pas de capteur santé ou sauvegarde médicale implicite |
| Terrasse / Météo | Météo existante et Travel | Données météo chargées explicitement |
| Pièces / recherche | Vue de cartes agrandies, filtre sans accents et fiche par pièce | Espaces éditoriaux de navigation, pas inventaire HA |
| Lampe / Appareils | `HomeConnections` → routes authentifiées Core | Une lampe, READ seulement, connexion non activée |
| Orbe Parler à IDA | Dialogue local partagé avec commandes de voix | Le premier clic ouvre le dialogue, pas le micro |
| Ambiances | Maison, Lecture, Cinéma, Nuit : rendu temporaire de l'écran | Aucun ordre physique, aucun état domotique modifié |
| Automatisations | Brief La Fabrique ou tâche réelle du Core | Pas de routine exécutée |
| Énergie, Climatisation, Sécurité, Caméras | Limite de capacité et prérequis clairement affichés | Aucun faux compteur, surveillance, thermostat ou flux vidéo |
| Paramètres | Thème existant, pause des animations, accès système | Aucun changement de permissions Core |

L'état d'une lampe n'est pas affirmé sur le décor. Le panneau de lecture affiche une observation uniquement après une réponse serveur validée et l'efface après une minute, fermeture ou masquage de page. L'horloge est locale au navigateur ; aucune ville, température ou identité utilisateur n'est inventée.

## Mobile, accessibilité et ressources

- Au-dessous de 650 px : disparition du rail, recherche compacte, cartes sur deux colonnes et dock inférieur avec zone sûre. La disposition s'adapte aussi aux largeurs intermédiaires.
- Boutons nommés, recherche labellisée, messages de statut, focus visible, fermeture des volets par Échap via le composant partagé, navigation clavier sans capteur.
- Orbe décorative légère, suspendue en page masquée, volet ouvert, pause utilisateur ou mode Nuit. Respect des préférences mouvement réduit et transparence réduite ; fallback couleurs forcées.
- Aucune vidéo en autoplay dans Home. Les vidéos des mondes restent réservées à la roue ; le robot Immersive reste l'exception demandée.
- Chargement différé du composant et des validations. Build observé : entrée JS 457,89 kB / 130,44 kB gzip, Home 26,65 kB / 8,11 kB gzip, schémas communs différés 81,82 kB / 22,76 kB gzip. Ne pas interpréter ceci comme un FPS mesuré.
- Rendu serveur et comportement des données vérifiés automatiquement. Recette visuelle authentifiée et téléphone physique non réalisés : le navigateur observé est sur le verrou IDA, conservé intact.

## Asset et provenance

Généré avec imagegen intégré à partir des références utilisateur, puis inspecté et copié dans le dossier média local ignoré par Git. Aucun texte ni faux appareil connecté n'est gravé dans l'image.

Fichier final : `apps/web/public/design/user-20260909/home-hologram-v1.png` — 1536 × 1024. URL locale : `/design/user-20260909/home-hologram-v1.png`. Le média n'est pas committé, conformément aux règles du projet ; le conserver avec les autres assets locaux pour reproduire cette installation.

### Prompt final utilisé

```text
Use case: stylized-concept.
Asset type: one cinematic clean environment hero image for a home dashboard, also suitable for a centered mobile crop; no interface is part of the image.
Input images: Image 1 is the visual reference for the contemporary Mediterranean glass house, holographic blue architectural filaments, dark premium atmosphere and Marseille waterfront at dusk. Image 2 is only a supporting reference for the miniature/isometric house presentation and visible distinct rooms. Ignore and remove all interface content from both references.
Primary request: Create a complete contemporary Mediterranean home as a refined miniature/isometric architectural model, glazed and semi-transparent with luminous blue holographic filaments tracing its structure, resting on a dark platform. Marseille at twilight is visible behind it. Deliver a 3:2 landscape image, ideally 1536x1024.
Scene/backdrop: Atmospheric Marseille Mediterranean waterfront at blue hour, distant softly lit buildings and the recognizable hilltop silhouette of Notre-Dame de la Garde, calm water with a few warm reflections, dusky blue and muted peach sky. Keep the background understated and cinematic.
Subject: One entire central house, two contemporary levels with generous glass walls, a visible warm living room, kitchen/dining room, bedroom and an outdoor terrace with tasteful Mediterranean greenery. A small terrace pool is consistent with Image 1. Realistic miniature furniture, warm interior lights, subtle stone and wood, dark framing and clear glass. Thin electric-blue glowing structural lines run along the edges and join at small light points, with subtle filaments extending just above the roof and across the platform. They are architectural hologram effects, not interface graphics.
Composition/framing: Elevated three-quarter isometric view, like an exquisite architectural scale model. The whole house and its platform remain visible with breathing room on every side, centered in the middle of the 3:2 frame; keep the principal building compact within the central approximately 55% of the width and 65% of the height so a mobile center crop retains the core home. Clearly readable distinct rooms visible through the glazing. No clipped roof or cut-off platform. The environment fills the entire canvas naturally.
Style/medium: Premium detailed 3D architectural visualization with photorealistic glass, stone, metal and warm miniature interior materials. Moody deep navy and black, refined restrained cyan-blue holographic light, warm amber interior glow, soft depth and realistic reflections. Match the references' sophisticated home environment.
Constraints: Artwork only. Absolutely no text, letters, numbers, labels, room names, badges, buttons, circles for hotspots, callout lines, panels, cards, widgets, graphs, icons, menu, navigation, status indicators, logo, watermark, phone/device frame, screenshot layout or any UI anywhere. No people or silhouettes inside the home. Do not reproduce the supplied interface screenshot. No extra houses or distracting foreground objects.
```

Branchements et frontières : [Voix et Home Assistant](VOICE_HOME_CONNECTIONS.md). État transversal : [Bilan de finalisation](FINALIZATION_STATUS_20260911.md).
