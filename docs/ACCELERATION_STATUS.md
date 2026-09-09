# Accélération — état vérifié au 9 septembre 2026

## Livraison de cette tranche

- Classic / Sci-Fi devient global : accueil, modules, navigation et frontière d’accès. Le choix survit au rechargement sur ce navigateur seulement.
- Roue photographique utilisant les visuels fournis. Autoplay décoratif Music Studio, Workspace et IDA Home : muet, boucle, inline, un seul lecteur, arrêt manuel et repli statique.
- Aucun remplacement du Core, des providers, de la mémoire, des agents, des permissions ou des routes métier. Aucun paquet installé. Les changements de dates précédents restent à part ; l’édition de propositions n’a pas été poursuivie.

## Connexions : preuves et limites

| Service | État réel dans cette tranche | Étape restante |
|---|---|---|
| API / base IDA | `/health` répond, base prête, mode `LOCAL_DEMO`, données existantes conservées | Ce mode n’autorise pas une intégration sensible réelle |
| OpenAI | Adaptateur Responses existant réutilisable, pas de clé trouvée dans les variables processus/utilisateur et fichiers locaux vérifiés ; aucun appel cloud effectué | Transport/runtime, clé serveur et évaluation via identité réelle ; ne pas confondre abonnement ChatGPT et accès API |
| Ollama | Adaptateur et parcours d’évaluation existants ; aucune nouvelle qualification ou inférence effectuée ici | Ne pas promouvoir le modèle local sans validation de qualité et branchement du parcours autorisé |
| Home Assistant | Adresse fournie, interface HTTP 200 confirmée, aucun credential envoyé | Trajet chiffré, secret serveur, cible et permissions ; le provider READ existant n’est toujours pas branché au runtime |
| Réseaux / météo / cartes / voix | Aucun nouveau fournisseur connecté | Credentials, droits et tranche fonctionnelle distincte ; aucun résultat simulé présenté comme réel |

La documentation officielle expose `gpt-6-astra` dans l’API Responses, mais l’accès du compte n’a pas été testé. Source : [modèle OpenAI](https://developers.openai.com/api/docs/models/gpt-6-astra). Les appels Home Assistant exigent une authentification : [API officielle](https://developers.home-assistant.io/docs/api/rest/).

## Recette

Tests ciblés : `worlds.test.ts`, `theme.test.ts` et tests existants de l’accueil. Suite frontend : **174 tests / 14 fichiers passent**. Typecheck web, lint du dépôt et build frontend réussis. La suite backend complète n’a pas été relancée pour cette tranche cliente ; aucun code métier serveur n’a été modifié.

Navigateur réel : les trois MOV se décodent ; la carte Music Studio et Workspace lisent sans contrôle natif et sans son ; l’arrêt retire le lecteur et reste effectif à l’ouverture de l’environnement. La navigation vers les modules retire les vidéos. Contrastes contrôlés dans les onze sections et corrigés dans le calendrier et les briefs. Classic revient à des surfaces claires. Le thème est conservé au rechargement.

Limite de recette : la capture et l’émulation de dimensions de ce navigateur présentent un décalage de mise à l’échelle ; contrôles et DOM compact inspectés, mais pas de validation iPhone physique ni de capture intégrale fidèle de tous les écrans. Les clips fournis sont basse résolution. Le clip avatar contient texte/filigrane et reste en réserve, sans retrait du filigrane.

## Priorité suivante

Brancher un premier cerveau qualifié au chat autorisé et une première lecture domotique réelle, sans désactiver le verrou ni inventer un état connecté. Ne pas multiplier les nouveaux contrats : lever les dépendances réelles (credential, trajet sécurisé, cible pilote), puis livrer un parcours complet. Publication publique, contrôle domotique, météo, voix, anglais et domaines futurs restent hors de cette tranche.
