# Livraison frontend — 10 septembre 2026

Mise à jour : Frigo Classic et La Fabrique ont été livrés ensuite ([compte rendu](FRIGO_CLASSIC_FABRIQUE.md)). Météo est désormais une section d'IDA Home avec lecture explicite de l'API officielle ([compte rendu](METEO_HOME.md)). Les anciennes mentions « à intégrer » ci-dessous ne décrivent plus ces trois parties.

## Réalisé dans cette tranche

| Partie | Commandes implémentées | Limite explicite |
|---|---|---|
| Research / Knowledge | Recherche web et scientifique par liens explicites, bibliothèque documentaire du Core, annotations exportables, carte d'idées manuelle, briefs enregistrables dans les tâches, dialogue IA local | Pas de résultats web prétendument vérifiés, de RAG ou d'analyse PDF automatique |
| Travel / Explorer | Six destinations cliquables, formulaire dates/budget/étapes, validation ordre des dates, projets enregistrés dans les tâches partagées, consultation des voyages, carte OpenStreetMap | Aucune réservation, donnée de vol live ou date fictive issue de la maquette |
| Music Studio | Choix du projet depuis les morceaux réels, sons privés, lecteur, boucle, égaliseur 3 bandes, compression douce d'écoute, briefs/collaboration préparables et export texte, import de dossier avec sélection du dernier export | Pas encore un DAW ni un moteur d'export de mastering ; aucun projet Nova ou compteur musical fictif |
| Frigo | Scène sombre indépendante depuis IDA Home, inventaire manuel, courses, historique temporaire, compteurs, réglages Glass | Nouvelle maquette Classic verte/crème à intégrer ; brouillon non sauvegardé |
| Dialogue IA | Composition Core/Registry/Router/Adapter/Ollama, UI dédiée dans les trois mondes et dans IDA | Expérimental, auth locale à initialiser par l'utilisateur ; aucun appel Astra |

Les décors Research et Travel sont nettoyés des commandes et légendes avant intégration. Rail, panneaux, recherche, dock et destinations sont de vrais éléments HTML. La fidélité de composition est recherchée, pas annoncée comme une reproduction pixel à pixel vérifiée. Les références Music Studio réutilisent le décor nettoyé déjà présent. Aucun deuxième accueil principal créé.

Les vidéos restent sur les cartes de la roue ; exception du robot Immersive demandée précédemment. Animations/reflets décoratifs bornés, arrêt manuel, réduction de mouvement/transparence, aucune activation de capteur. Sur mobile la composition est réorganisée en blocs lisibles plutôt que de miniaturiser la maquette desktop.

La bibliothèque affiche au maximum 50 médias renvoyés par l'API. Les compteurs indiquent le nombre affiché, pas le total exhaustif. Les listes de voyages sont une projection des tâches dont le titre commence par `Voyage · `, pas un nouveau domaine de réservation. Le titre du projet musical actuel vient d'un choix éphémère de l'utilisateur.

## Import musical préparé

Dossier trouvé : `F:/MUSIQUES 2K26` (l'intitulé indiqué « MUSIQUES 2k6 » n'existe pas tel quel).

- Inventaire : 2 608 fichiers audio, mélange de productions, bibliothèques DJ/commerciales et stems.
- Première sélection limitée aux noms explicitement crédités Astromer/MARLA : 275 exports → 109 noms normalisés, 4,32 Gio.
- 90 fichiers retenus dépassent la limite privée actuelle de 25 Mio. Ils ne sont pas remplacés par un MP3 plus ancien pour contourner cette limite.
- Rapport généré privé : `tmp/music-import-plan/selection.json`. Ne pas committer ce rapport ni les médias. Chaque entrée indique `imported: false` et son attente.
- **Aucun fichier importé en base à ce stade ; aucun original copié, modifié ou supprimé.** Le verrou local est non initialisé, aucune session n'a été créée au nom de l'utilisateur.

L'outil de préparation `apps/api/prepare-music-selection.mjs` lit le disque et réutilise `music-import-selection.ts`. La règle retire extension, suffixes Copie/Copy, Original/Orginal Mix, AST/OK/FINAL/MASTER/Vn/MIXn, normalise espaces/casse, puis choisit le mtime exact le plus récent. À égalité uniquement, préférence au lossless. Pas de fuzzy matching : « Do it and Tell » / « Do it and Tale », remixes ou autres titres proches ne sont pas fusionnés. Cette première sélection reste donc à relire pour les ambiguïtés de noms.

Dans Music Studio → Bibliothèque, le sélecteur de dossier permet ensuite un import multipart authentifié par l'API existante. Progression, arrêt après le fichier en cours, reprise de la sélection et erreurs sont affichés. Un nom normalisé déjà trouvé dans les résultats serveur n'est pas écrasé. Le hash serveur reste l'autorité du doublon exact. Ce contrôle client n'est pas une contrainte SQL d'unicité globale, ni un moteur de remplacement transactionnel d'anciennes versions. Les gros masters et le remplacement réconcilié des versions existantes sont la prochaine tranche musique.

## Services / vérification

Vite 5173, API 8787 et Ollama 11434 relancés en loopback, avec les données existantes sans seed. Nouveau dialogue protégé : 401 sans session. Source des cinq nouveaux composants et CSS servie en HTTP 200 par Vite. Aucun test, lint, typecheck, build complet ou recette navigateur relancé dans cette tranche, conformément à la demande. Traitement Web Audio et parcours authentifiés encore à recetter dans le navigateur.

L'utilisateur doit créer sa phrase de passe dans le verrou local existant pour entrer. Ce besoin n'est pas contourné par une session technique. Le téléphone reste bloqué volontairement avant le jalon réseau sécurisé ; voir [LOCAL_DIALOGUE.md](LOCAL_DIALOGUE.md).

Priorités restantes : import privé des gros masters, finalisation/recette authentifiée du dialogue, accès téléphone sécurisé, nouvelles maquettes Frigo Classic/Fabrique/Météo, puis analyse documentaire et vrais outils de production audio. Ne pas représenter ces points comme achevés.

## Assets et prompts — image_gen intégré

Fichiers finaux dans le projet, hors Git :

- `apps/web/public/design/user-20260909/research-scene-v1.png`
- `apps/web/public/design/user-20260909/travel-scene-v1.png`
- `apps/web/public/design/user-20260909/fridge-scene-v1.png` (scène de la demande précédente)

Les images sont inspectées avant copie. Une génération par asset, aucune nouvelle dépendance. La compétence Imagegen a servi à séparer artwork et interactions, plutôt qu'à laisser les chiffres et faux boutons des maquettes dans l'interface.

### Research — prompt exact

```text
Use case: precise-object-edit.
Asset type: clean immersive web-app environment background, landscape 1536x1024.
Input image: exact edit target, ENVIRONNEMENT RESEARCH.png. This image's physical room and holographic artwork must remain as faithful as possible, not be redesigned.
Primary request: remove EVERY interface overlay, every text, letter, icon, button, logo, menu, sidebar navigation, floating right-hand app panel, bottom dock, and quote. Reconstruct the room naturally underneath these removed overlays.
Keep invariant: exact camera, architecture, perspective, dark reflective floor, round black table and chairs, bookshelves, plants, mountainous cloud city view, large luminous Earth hologram in the upper middle, golden orbital lines and floating scientific image artworks. Keep original lighting, cinematic realism, colors, object locations and room geometry. Keep the dark far-left architectural column but without IDA brand or navigation; keep the original atmospheric darker right edge as part of the room, without UI panels. Remove titles and quote at left of Earth, vertical writing at right, and all visible book-spine letters at lower left. Preserve the images orbiting Earth as artwork, not UI controls. Fill the former bottom dock with continuous reflective floor.
Constraints: this is ONLY scenic artwork; real text, controls and interactive panels will be rendered separately in HTML. Absolutely no text, interface widgets, mockup chrome, menus, logo or watermark anywhere. Do not insert new people or objects. Do not crop or change the composition.
```

### Travel — prompt exact

```text
Use case: precise-object-edit.
Asset type: clean immersive web-app environment background, landscape 1536x1024.
Input image: exact edit target, ENVIRONNEMENT TRAVEL.png. Preserve this reference's airport composition as faithfully as possible, not a redesign.
Primary request: remove ALL user-interface text, icons, buttons, menus, sidebar navigation, right-hand suggestion/trips panels, bottom dock, titles and quotes. Reconstruct the airport scenery naturally underneath removed overlays.
Important invariant: PRESERVE ALL SIX tall destination photographic display panels across the upper middle/right in their exact reference positions and perspective: Japan with pagoda/Fuji/cherry trees (first panel approx x=470-620), Thailand with karst/turquoise sea (620-767), Italy/Positano (767-917), Iceland waterfalls/valley (917-1084), New York skyscrapers (1084-1233), Bali temples/trees (1233-1387). Keep their original upper edges, lower edges and separators. Remove all their printed country labels, descriptions and circular arrow buttons; leave photographic imagery above and clean subtly shaded lower photo areas, not flat opaque blocks. These six display images are part of the architectural scene; real destination labels and buttons will be HTML overlays.
Keep invariant: airport architecture, camera perspective, sunset outside, reflective stone floor, central adult traveler standing with suitcase, waiting travelers on benches, airplane and control tower, windows and plants. Keep leftmost dark architectural column without branding/menu. Keep the departures board as an unlettered dark display, and overhead departure sign as an unlettered dark sign; remove all flight numbers, destinations, statuses, logos and decorative writing. Remove all UI panels at right and reconstruct airport windows/seating unobtrusively behind them. Remove bottom dock, leaving floor reflection continuous.
Constraints: only scenic background; no text, letter, logo, watermark, user interface controls, floating app cards or icons anywhere. No redesigned room, changed crop or extra characters. Retain the composition and photorealistic warm/cool lighting from the reference.
```

### Frigo — spécification utilisée

Référence : `81e726bd-18dc-4da6-b0ce-f40546d01132.png`. Transposer sa composition sombre à une cuisine : androïde adulte brune en tenue blanc/argent au centre-gauche, frigo graphite éclairé au centre, ambiance Marseille au coucher du soleil, espaces sombres libres à gauche et à droite pour les vrais panneaux. Aucun texte, menu, logo, compteur, courrier ou colis dans le décor. Les produits illustrés ne constituent pas l'inventaire utilisateur. Fichier source généré : `exec-4ae074d8-0968-42fd-8de0-56582576b51e.png`.
