# Décors vivants — 19 septembre 2026

`SceneAtmosphere` compose les images locales existantes : déplacement masqué du ciel,
ondulation de la zone d'eau, reflets et variation lumineuse. Il ne s'agit pas d'une
vidéo générée : les photos originales restent intactes et les commandes ne bougent pas.

Couverture : accueil Classic/Sci-Fi/Carrousel, Care Classic/Sci-Fi, Music,
Research, Travel, Home et pièces, Fabrique, environnements génériques, météo,
réfrigérateurs, Chat et calendrier. Les scènes Immersive et l'accueil/profil Care
conservent leurs vidéos locales et le cycle de vie `WorldAmbience`.

Les couches de Home ont été déplacées **dans** le décor du héros, entre la photo
et les commandes. Les fonds de pièces et météo emploient la même géométrie que
leurs photographies. L'accueil sous un environnement ouvert est masqué.

Sur mobile, LOW ne ralentit plus tous les effets à 24 secondes : les reflets
restent perceptibles en quatre secondes environ, avec moins de particules.
OFF, réduction de mouvement, contraste renforcé, onglet masqué et panneaux
obscurcissants restent respectés. Aucun capteur, secret, provider ou outil activé.

Vérification : tests de montage inerte et couverture ; contrôles navigateur des
styles calculés (images, état de pause, transformations et opacité évolutives).
Une capture statique seule ne prouve pas une animation. La fidélité artistique
et le cadrage restent à apprécier sur les formats PC et téléphone réels.

## Correction visible des accueils — 20 septembre

Les superpositions CSS initiales n'étaient pas assez perceptibles pour l'utilisateur.
`LivingBackdrop` anime désormais les **pixels de la photo** sur l'accueil PC en
mode STANDARD : ondulation de l'eau, reflet et ciel Classic ; déplacement des
nuages terrestres, scintillement des étoiles et éclairage Sci-Fi. Les masques
sont définis dans les coordonnées de chaque image, avant son recadrage `cover`.
L'architecture et les commandes restent fixes ; le thème Carrousel reste séparé.

WebGL natif sans dépendance, plafond 24 images/s, largeur de rendu maximale
1 600 pixels, arrêt de la boucle hors écran/onglet masqué, libération des
ressources au démontage. Sans WebGL, en cas de perte de contexte ou en mode
LOW/mobile, les couches CSS restent le repli. Le visuel mobile conserve son
fichier distinct. OFF et les réglages d'accessibilité priment toujours.

Contrôle navigateur réel effectué sur `http://127.0.0.1:8787/` : nouvelle version
chargée, canvas `ready=true`, `running=true` et compteur d’images progressif.
Contrôle de composition par capture Sci-Fi ; aucune capture n'est présentée
comme une preuve de qualité cinématique ou de fluidité sur tous les appareils.

## Correction de visibilité des accueils — 21 septembre

Les accueils Classic et Sci-Fi utilisent un conteneur isolé. L'atmosphère ne
doit donc pas être négative dans la pile (`z-index: -1`) : elle passait derrière
le fond opaque de l'accueil et ses animations devenaient invisibles. Elle est
maintenant au plan 0, les commandes restent au plan 1, et une variation
lumineuse dédiée à la pièce Classic (avec une variante froide Sci-Fi) reste
visible au-dessus de la toile WebGL. La réduction de mouvement, la pause,
l'onglet masqué et les préférences d'accessibilité continuent de suspendre ou
d'annuler l'animation.

## Renforcement demandé — 23 septembre

- Variation volontairement plus perceptible : source lumineuse localisée, reflet
  large au sol et ombre progressive, en cycles doux de 6 à 9 secondes, sans flash.
  Intensité du halo principal de 0,12 à 0,95 ; teinte champagne Classic, froide
  Sci-Fi. Les ombres et reflets ont des phases distinctes.
- Réemploi réel de `frontend/components.AnimatedBackdrop` dans `SceneAtmosphere` :
  c'est la même primitive structurelle que le créateur de sites, avec un rendu
  adapté aux lieux d'IDA. Les textes et commandes ne sont pas transformés.
- Placements propres à Fabrique, Finance et Care/Home mobile. LOW garde un éclairage
  visible sans canvas ; HIGH n'éteint plus la toile vivante de l'accueil.
- Finance ne charge plus la photo WebGL réservée à l'accueil : ses deux thèmes
  utilisent exclusivement leur décor Finance pour les couches d'image.
- La déformation de l'eau Classic traversait des montants de fenêtres ; elle est
  remplacée par une variation de lumière/reflet sans déplacement de ces pixels.
- OFF/réduction de mouvement masquent les couches ; panneaux et onglet masqué
  suspendent aussi les descendants de la primitive. Pas de son/caméra/micro ni
  réseau externe activé. Les photos sources restent intactes.

Contrôle ciblé : `e2e/scene-lighting.spec.ts` vérifie des opacités qui changent
réellement avec le temps, pas seulement la présence d'une règle CSS. Captures
comparatives accueil Classic/Finance Sci-Fi et surfaces Fabrique. Ces contrôles
ne remplacent pas l'appréciation de l'intensité sur l'écran réel de l'utilisateur.
