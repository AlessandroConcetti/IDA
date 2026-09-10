# Frigo Classic et La Fabrique — 10 septembre 2026

## Navigation, réutilisation, résultat

- Un seul accueil IDA et une seule roue. `EnvironmentLobby` ouvre `ClassicFridge` dans **IDA Home → Mon frigo**, uniquement pour le thème Classic. Les scènes Frigo sombres existantes sont conservées pour les autres thèmes, sans perte de travail.
- Le même brouillon `FridgeItem[]` du parent est utilisé. `FridgePanel` est réutilisé pour la saisie et reçoit un rayon facultatif. Les données existantes sans rayon apparaissent dans Autres. Aucune nouvelle mémoire, base ou permission cliente.
- **La Fabrique** ouvre son accueil dédié depuis sa carte, avec le décor du nouveau fichier nommé par l'utilisateur. Le rail, les pictogrammes et la fenêtre de travail ont été extraits dans `ReferenceChrome` et sont partagés avec Music Studio, Research et Travel. Aucune deuxième implémentation de navigation parallèle.
- Les décors n'ont pas de commandes peintes : les panneaux, rayons, boutons, badges, recettes, formulaires et états sont du HTML/React. Effets Glass de la couche existante, reflets d'entrée et suivi du pointeur ; une animation lente sur les commandes principales, pause locale et respect des préférences de mouvement/transparence. Aucune vidéo supplémentaire dans les environnements.

## Frigo Classic : commandes réelles

1. Ajouter un aliment avec nom, quantité et rayon, supprimer un aliment, marquer « À racheter » via l'éditeur existant.
2. Cliquer un rayon du frigo pour filtrer l'inventaire. Les compteurs viennent uniquement des saisies en stock, jamais de l'image.
3. Chercher par nom, retrouver les produits à racheter, cocher un achat pour le remettre en stock.
4. Ouvrir quatre fiches recettes illustratives ; voir ingrédients, préparation, durée indicative et allergènes à vérifier. La présence est comparée par noms normalisés exacts/alias explicites, jamais par fragments : « yaourt fraise » ne fournit pas automatiquement des fraises.
5. Ajouter les ingrédients manquants à la liste à racheter, sans doublon dans le brouillon ; pas d'écrasement de stock existant et limite de 100 lignes conservée.
6. Marquer des favoris temporaires et filtrer les cartes.
7. Composer une semaine à partir des quatre idées, enregistrer une **copie** dans les tâches IDA via `POST /v1/tasks`.
8. Télécharger la liste de courses en texte ou en enregistrer une copie dans les mêmes tâches. Limite de description de 4 000 caractères respectée sans troncature ; copies identiques empêchées pendant cette visite pour chaque type de liste. Les doubles clics sont bloqués synchroniquement.
9. Accéder au chat, à Music Studio, Travel, Care et aux tâches par les commandes de la scène.

### Limites explicites

Inventaire, favoris et semaine sont encore des **brouillons éphémères**. Ils ne constituent pas une mémoire nutritionnelle persistante. Les tâches créées sont persistées par l'API et ne se mettent pas à jour quand le brouillon change. L'anti-doublon de sauvegarde est limité à la visite : ce n'est pas une contrainte d'unicité globale multiappareil.

La correspondance d'ingrédients ignore quantité, fraîcheur et dates ; elle reste conservatrice et peut demander d'ajouter un produit dont le nom ne correspond pas exactement. Les recettes sont du contenu éditorial fixe, non généré à partir de données Care et non médicalement personnalisé. Aucun régime, diagnostic, température ni apport nutritionnel n'est déduit. Les nombres et les produits de la maquette ne sont pas des données utilisateur.

Le scan/OCR est signalé **à connecter** et propose une saisie manuelle ; il n'active aucun capteur ou téléversement. Aucune commande de courses, aucun service externe, aucun frigo connecté.

## La Fabrique : fonctions disponibles

- Application, Agent, Automatisation et Outil : création d'un **brief**, pas activation d'une capacité. Formulaire nom, objectif, livrable, limites et responsable, tailles bornées ; aperçu exportable en Markdown.
- Quatre templates éditoriaux personnalisables : assistant documentaire, tableau de projet, préparation de release et comparateur de versions.
- Enregistrement du brief via les tâches existantes, préfixe `Fabrique · `. « Projets récents » et « Mes projets » lisent ces mêmes tâches avec leurs états réels. Aucun faux projet Marla/Budget Tracker, compteur d'agents ou statut de déploiement.
- Recherche, filtre par état, lecture de fiche, export Markdown, terminaison explicite d'une tâche via l'API existante et accès à la liste partagée.
- Préparation d'une collaboration : tâche ou fichier Markdown. Aucun envoi, invitation ni droit d'accès accordé.
- Les lectures obsolètes sont invalidées lors des mutations. Un enregistrement terminé ne remplace pas un autre panneau ouvert entretemps ; les résultats mettent à jour la liste et le cache de brouillons sans changer le contexte de navigation. La liste est ensuite relue. Une déduplication exacte est effectuée parmi les tâches chargées et les brouillons enregistrés pendant la visite ; l'API de tâche n'offre pas une unicité globale, donc une réponse réseau perdue peut encore nécessiter une vérification manuelle avant nouvelle création.
- Dialogue local disponible dans la fiche, par le composant partagé ; pas de transmission automatique du brief au modèle.

L'exécution de workflows, l'enregistrement de nouveaux agents, leur qualification, la construction d'applications et le déploiement ne sont **pas connectés**. Le Core et les registres de permissions sont conservés. Les préfixes de tâches sont une projection d'interface, jamais une frontière de sécurité. Aucun utilisateur ni workspace n'est choisi par le formulaire.

## Vérifications et suite

- Vérification de types Web/API et lint ciblé ; tests de recettes et de statut IA local, plus tests existants Ollama : 94 succès. Build de production Web réussi (72 modules). Chargement HTTP 200 de toutes les nouvelles scènes, styles et trois assets locaux.
- Pas de recette navigateur ou d'attestation de correspondance pixel parfaite. La scène est responsive, mais l'adaptation mobile n'est pas une ouverture réseau.
- Le verrou n'est pas créé par l'agent. L'utilisateur doit remplir et confirmer la phrase dans l'écran d'accès local. Ne jamais mettre de phrase réelle dans un fichier, test, prompt LLM, export ou journal.
- Authentification locale et génération Qwen de bout en bout, import musical effectif, connexion Astra officielle et accès téléphone sécurisé restent des étapes distinctes, non revendiquées ici.

## Assets intégrés

Images générées avec l'outil **Imagegen intégré**, inspectées puis copiées localement. Une génération par asset, aucun original utilisateur remplacé. Les médias restent ignorés de Git conformément aux conventions du projet.

- `apps/web/public/design/user-20260909/fridge-classic-v1.png` — 1222 × 1287, depuis `ENVIRONNEMENT FRIGO THEME CLASSIC.png`.
- `apps/web/public/design/user-20260909/fridge-recipes-v1.png` — 2172 × 724, quatre quarts égaux utilisés en CSS sans produire quatre fichiers dupliqués. Le résultat est en 3:1 et non le 4:1 demandé ; chaque quart est recadré dans sa carte.
- `apps/web/public/design/user-20260909/fabrique-reference-v2.png` — 1536 × 1024, depuis `ENVIRONNEMENT LA FABRIQUE.png`. L'ancien décor Fabrique est préservé.

### Prompt final — Frigo Classic

```text
Use case: precise-object-edit.
Asset type: clean background bitmap for a functional frontend, without any embedded interface.
Input images: Image 1 is the edit target and exact composition/style reference.
Primary request: Remove ALL interface content from the supplied classic fridge image and reconstruct a seamless continuous kitchen in every removed area. Deliver one complete portrait near-square image with the same 1224:1288 aspect ratio (target 1224x1288).
Scene/backdrop: Preserve the warm, bright cream classic kitchen, softly sunlit window at the right, wood counter, natural plants and the realistic materials and shadows.
Subject and composition: Preserve the large refrigerator OPEN, complete open door and entire interior with all shelves visible, occupying approximately x22%–62% of the image, y16%–62%. Keep its clear food containers, vegetables, tomatoes, chicken, cheese, jars, eggs, bottles and fruit looking like the reference. Preserve the friendly stylized brunette woman with brown eyes, large messy bun, cream knit sweater, warm smile and chin resting in her hand, leaning on the wood counter approximately x60%–84%, y18%–61%. Preserve her character identity, natural hand pose and proportions. Keep the counter as a continuous surface beneath the fridge and woman.
Style/medium: Photorealistic kitchen and foods with the same softly rendered stylized animated woman as the source. High quality warm natural light, cream, honey wood and muted green colors.
Changes: Remove the entire left navigation sidebar, logo, title and subtitle, search bar, organize pill, greeting panel, shopping list, speech bubble, every food category label, every recipe card and its photos, all bottom action controls, all buttons, all icons and badges. Remove ALL writing and logos from mugs, plant pots, food packaging, jars, containers and the woman's sweater; retain plain natural objects where appropriate. Extend the kitchen wall, cabinet surfaces, plants, counter and softly lit foreground through the removed regions. The upper 20% and side margins should read as calm continuous kitchen background with room for actual frontend overlays.
Constraints: This is only a clean full kitchen scene, not an interface mockup. Keep the fridge door, all shelves and woman's composition; no cut-off head or fridge, no replacement pose, no extra person. No text of any kind, letters, numbers, labels, logos, watermark, panels, cards, mock buttons, icons, borders or washed-out rectangles. No traces of former UI. Do not include the four recipe photographs anywhere in this background.
```

### Prompt final — recettes

```text
Use case: photorealistic-natural.
Asset type: one horizontal four-photo recipe strip; intended for the frontend to crop each equal quarter as an individual recipe image.
Input images: Image 1 is a reference for the exact four foods shown in the bottom recipe row, including their appetizing natural styling. The interface around them is not part of the output.
Primary request: Generate a single clean horizontal strip with four adjacent equally wide food photographs in exactly this left-to-right order: (1) spaghetti pasta with red cherry tomatoes, small fresh mozzarella balls and vibrant fresh basil on a light ceramic plate; (2) grilled chicken and sliced avocado salad bowl with leafy greens in a white bowl; (3) golden vegetable omelette with green vegetables and red tomato pieces on a light plate; (4) a clear glass full of pink banana and red berry smoothie with a small garnish, berries and banana nearby. Match the pictured dishes from the reference.
Composition/framing: A wide 4:1 horizontal image, ideally 2048x512. Each quarter occupies precisely 25% of the total width, is a self-contained square photograph, and centers its own full dish or smoothie glass for reliable quarter cropping. Straight vertical joins at exactly 25%, 50%, 75%. The photos run edge to edge with no gutters, no margins, no frames and no overlap across joins. Food close-ups viewed from the same gentle three-quarter/top angle as the reference recipe thumbnails; show the actual food generously.
Style/medium: Photorealistic food photography, fresh realistic ingredient textures, soft natural warm daylight and light neutral wood/cream table setting consistent with the reference.
Constraints: Exactly four photos and exactly the four described dishes in the specified order. No text, icons, heart badges, recipe cards, captions, controls, borders, collage decoration, watermark or logos. Do not reproduce any kitchen scene or character from the reference.
```

### Prompt final — La Fabrique

```text
Use case: precise-object-edit.
Asset type: one clean immersive environment background bitmap for a functional frontend.
Input images: Image 1 is the edit target and exact composition, architecture, lighting and style reference.
Primary request: Remove every interface overlay and every word, logo and piece of lettering from the supplied La Fabrique image. Deliver the same complete landscape scene at 1536x1024, with all removed areas filled by plausible continuous coworking architecture and materials.
Scene/backdrop: Preserve identically the premium industrial coworking studio, soaring glass windows and distant city view on the left, golden late-afternoon daylight, dark exposed metal beams and mezzanine, glass-walled workshop on the right, concrete, dark brushed metal, glossy polished floor and lush plants.
Subject and composition: Keep the open laptop exactly at the central foreground position on the large dark desk, its perspective, scale, keyboard and screen angle; keep its visually subtle dark screen containing nonverbal abstract node and code-like shapes with no readable text. Keep the black mug and notebook/books near it but make every surface unbranded and without letters. Preserve the existing background desks, monitors, people and team working, plants, glass reflections and white robotic arm. Keep the same camera viewpoint and scene geometry, no extra people or furnishings.
Changes: Completely remove the entire left navigation sidebar and its divider lines, logo, labels and icons, the title and slogan at upper left, the quote and author attribution, the right-side new-project panel, recent-project panel and all their icons/cards/buttons/text, the entire lower dock and every bottom or corner tagline. Remove the architectural wall slogans at center and on the upper-right mezzanine and glass, the letters on the mug, every book spine label and all other words/numbers/logos anywhere. Reconstruct the hidden real environment seamlessly: continue windows, walls, desk surfaces, floor and glass with correct perspective, texture, shadows and reflections. Preserve the uninterrupted premium coworking scene rather than replacing overlays with blank flat rectangles.
Style/medium: Photorealistic premium architecture and workspace photography exactly matching the source, dark graphite metal, warm golden sunset shafts, natural greenery, deep but detailed shadows, realistic concrete and glass.
Constraints: Only the clean environmental artwork. No interface overlays, navigation, cards, panels, docks, mock buttons, icons, typography, text, labels, logos, watermarks, frames or rectangles concealing the scenery. No camera reframing, no composition changes, no cropped laptop, no repositioning of furniture, no change in time of day or lighting mood.
```
