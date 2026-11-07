# IDA — Standard visuel de production dès la PREMIÈRE livraison
Statut : obligatoire pour toute **création ou modification visuelle** de site, écran, landing page, scène 3D, asset 3D, animation, motion design ou présentation de produit IDA. Ne pas charger pour une correction purement backend/textuelle.

## Règle impérative : première livraison = vraie qualité cible
Le standard validé par le propriétaire **est le point de départ, pas une amélioration future**. Interdit : première version générique faite pour « avoir quelque chose », puis plusieurs passes réactives parce que la composition, les effets ou le modèle sont visiblement insuffisants.

Une demande « fais ce site / cette scène / ce hero » implique la réalisation aboutie du périmètre demandé **dans cette tranche**, sauf bloqueur technique avéré. Ne pas annoncer « terminé » si seul le squelette existe. Le niveau de qualité doit être jugé par **référence + vérification réelle**, jamais par « 9/10 » auto-attribué.

**Priorité en cas de conflit** : demande explicite de l'utilisateur et périmètre exact > référence validée > design system du monde > règles générales. Ne jamais utiliser l'exigence premium comme prétexte pour refaire les zones non demandées.

## Porte de qualité AVANT de coder
Contrôle court, interne (ne pas en faire un long compte rendu) :
1. **Périmètre** : ce qui change / ce qui est gelé, fichiers et interactions touchés, état existant et moyen de retour arrière. Toute demande ponctuelle = diff ponctuel. Ne modifier ni palette, ni composant, ni comportement voisin sans nécessité prouvée.
2. **Références** : inspecter réellement captures, vidéo, maquette, URL ou assets disponibles. Relever composition, typographie, proportions, couleurs, profondeur, matière, interaction, lumière et mobile ; distinguer les détails observés de ceux supposés. Si une référence est inaccessible, ne pas prétendre l'avoir vue.
3. **Réemploi** : identifier composants, design tokens, moteurs 3D, animations et assets existants. Ne pas réinstaller Three.js/R3F/Blender/GSAP ou équivalent s'ils sont déjà présents. Ne pas remplacer une vraie scène par des dégradés ou rectangles pour aller plus vite.
4. **Contrat de résultat** : définir 3 à 7 critères observables propres à la demande et les dispositifs de vérification. Les garder en mémoire de travail, sans monologue préalable.

## Qualité des sites et interfaces
- **Direction artistique cohérente et particulière**, non le style SaaS/IA par défaut : identité de marque, palette justifiée, hiérarchie éditoriale, proportions maîtrisées, grille, alignements, détails, espacement, états. Respecter le design system de l'environnement concerné ; ne pas appliquer arbitrairement Aurora à tous les clients.
- **Typographie travaillée** : choix raisonné des familles et graisses, contraste de tailles, interlignage, césures, largeur des lignes, rythme entre sections, rendus mobile ; pas de police générique imposée par habitude.
- **Section hero aboutie** : message, composition, médias, cadrage, lisibilité, profondeur et interaction cohérents ensemble dès la première livraison. Un fond dégradé/placeholder à la place d'un visuel ou asset demandé échoue.
- **Mouvements intentionnels et réellement fonctionnels** : état initial, animation, scroll/souris/tactile, entrée/sortie, interruption, performance et fallback. Pas d'effets factices ni de motions qui bloquent la navigation. Réduire le mouvement si préféré.
- **Contenu et parcours** : toutes les informations réellement autorisées exigées pour le périmètre, navigation et actions en état réel ; ne pas sacrifier l'UX, le commerce ou l'accessibilité à une seule animation spectaculaire.
- **Desktop + mobile** : créer les deux compositions, pas simplement réduire le desktop. Vérifier au moins 1440px et 390px de large, plus un viewport intermédiaire si le changement l'exige ; traiter débordements, menu, tactile, poids et contraste.
- **Reproduction / refonte d'une référence** : viser sa composition et ses comportements observables si l'utilisateur est autorisé à la reproduire, avec contenu dont les droits sont établis ; l'amélioration propre à IDA porte sur les lacunes réelles, pas sur une copie à l'aveugle ni une imitation de marque sans autorisation. Ne pas retirer des fonctionnalités métier pour faire une « belle maquette ».

## Qualité des objets et environnements 3D
- **Si la demande exige un objet 3D, livrer de la géométrie 3D** : volume, silhouettes, proportions, topologie raisonnable, matériaux PBR, roughness/metalness, éclairage, ombres, caméra, animation et profondeur réelles. Un sprite ou des CSS transforms sont une **non-conformité** sauf consentement explicite.
- **Fabrication adaptée** : exploiter Blender pour modéliser/UV/baker/rig/exporter si disponible, ou pipeline Three.js/R3F existante pour modèles procéduraux pertinents. Réutiliser les assets autorisés et la bibliothèque de matériaux du projet ; ne pas créer un cube/sphère de substitution lorsqu'une forme précise est demandée.
- **Fidélité** : comparer silhouette, échelle, implantation, couleurs/matières, lumière, caméra et mouvement avec l'image/vidéo/plan. Une scène riche d'effets ne compense pas un objet faux.
- **Web-ready** : vérifier le chargement réel GLB/glTF, normals, UV, transparences, textures, LOD/compression quand utile, budget géométrie/textures, antialiasing, éclairage et FPS sur la cible. Prévoir une version mobile réduite et fallback non bloquant.
- **Inspection active** : vue générale + angles utiles + état animé ; revoir les anomalies visibles **avant** de remettre le résultat à l'utilisateur, sans lui faire jouer le rôle de QA de premier niveau.

## Porte de qualité AVANT la première livraison à l'utilisateur
- **Exécuter** build/typecheck/lint/tests pertinents, puis vérifier le parcours concerné dans le navigateur ou renderer lorsque l'environnement le permet. Exécuter une capture desktop et mobile (ou renders de la scène) et les comparer à la référence. Une compilation réussie **ne démontre pas** une qualité visuelle.
- **Autocorrection ciblée** : si une différence majeure est évidente (structure, asset, typographie, proportions, 3D, animation, mobile), la corriger immédiatement **avant la première présentation**. Faire au plus les passes internes nécessaires au périmètre, sans partir dans une refonte étrangère ni une boucle infinie. Réutiliser les résultats des outils, ne pas tout relire.
- **Sont bloquants** : élément demandé absent, imitation 3D, texte illisible, CTA mort, rendu mobile cassé, asset absent remplacé par un faux, animation contraire à la référence, test critique échoué, différence majeure non signalée. Ne pas livrer comme « prêt » dans ces cas.
- **Évidence** : fournir à la fin les chemins/URLs, tests exécutés, captures ou fichiers de rendu si produits, et les écarts résiduels. Si navigateur/Blender/référence indisponible, statut **NON VALIDÉ VISUELLEMENT** ; ne pas inventer captures, scores, FPS ou conformité.

## Rendement tokens sans sacrifier la qualité
- **Plus de travail vérifiable, moins de paroles**. Préflight interne court ; pas de récit des intentions, récapitulation répétée, justifications surdimensionnées ou exposés génériques. Faire plutôt que commenter.
- Lire **seulement** les fichiers, lignes, tests et documents liés au changement ; rechercher avant d'ouvrir des fichiers volumineux ; ne pas coller des sorties d'outils gigantesques dans la conversation.
- Deux modes seulement : **CHANGEMENT CIBLÉ** (diff minimal, vérification locale, aucune retouche opportuniste) et **CRÉATION/REFONTE DEMANDÉE** (qualité premium complète dans le périmètre, inspection réelle avant livraison).
- Suivi si utile : une phrase de progression avec résultat tangible. Livraison en ≤ 6 lignes par défaut : fait, preuves, reste/bloqueur. Ne pas écrire 1 000 tokens pour annoncer 20 lignes modifiées.
- Ne pas multiplier agents/modèles/appels cloud pour une tâche déterministe. Ne pas réutiliser une analyse obsolète ; mais ne pas redemander un élément déjà donné.
- Ne jamais masquer des défauts pour économiser des tokens. Économiser prioritairement **les corrections inutiles et le bavardage**, pas les tests et la qualité.

## Mini preuve finale exigible (concise)
`Périmètre livré | Fichiers | Preuve d'exécution (tests + visuel) | Hors périmètre préservé | Écarts restants`.

Ce fichier complète, sans les remplacer, `AGENTS.md`, `DESIGN_SYSTEM.md` et `docs/IDA_PERMANENT_BUILD_CONTRACT.md`.
