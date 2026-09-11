# IDA — téléphone : tranche du 11 septembre 2026

## État exact

La présentation mobile et une livraison compilée sur la même origine que le Core sont livrées. **Le téléphone n’est pas encore connecté.** Aucun port LAN, tunnel, règle pare-feu, compte distant ou session mobile n’a été activé. `LOCAL_LOCK` reste strictement local.

## Livré

- Research, Travel et Music : cibles tactiles de 44 px minimum sur les commandes corrigées, dock mobile persistant sur deux rangées, panneaux adaptables, filtres Travel repliés dès 600 px, marges d’encoche et dialogues défilants.
- Champs mobiles à au moins 16 px, zoom navigateur conservé. La hauteur visible suit `VisualViewport` et les dialogues s’adaptent au clavier. Les barres fixes sont masquées lorsque le clavier est détecté ; la détection reste indicative, sans collecte de données ni capteur.
- Manifest `standalone`, icône SVG et métadonnées iOS. Aucun service worker, cache de données privées, commande hors ligne ou permission matérielle automatique. L’installation réelle et l’icône iOS restent à recetter sur appareil après HTTPS.
- IDA Home : boutons des pièces conservés pendant les ticks d’horloge. Statut de connexion distinguant chargement, erreur et pause ; au retour visible, seul le GET de configuration reprend. La lecture Home Assistant n’est jamais rejouée automatiquement.
- `registerBuiltWeb` sert une racine de build absolue et de confiance : `/`, `/index.html`, assets, décors et fichiers PWA explicitement autorisés. Aucune route privée/source/dotfile ni fallback HTML sur `/v1`. Streaming et Range simple pour les vidéos ; types exacts, CSP same-origin, `nosniff`, anti-iframe et réponses sans cache.

## Exécution locale compilée

Après compilation de `apps/web`, lancer le point d’entrée existant `apps/api/src/local-preview.ts` avec `IDA_BUILT_WEB=1`. L’interface et l’API sont alors sur **http://127.0.0.1:8787/** ; l’aperçu de développement **http://127.0.0.1:5173/** reste accepté. Ce sont deux accès au même verrou local, **pas deux instances clientes indépendantes**.

`localBuiltWeb.origin` n’accepte qu’une origine HTTP loopback canonique exacte. Les origines réseau, jokers, identifiants URL, chemins et redirections sont refusés. L’écoute serveur n’a pas été élargie. Il ne faut pas mettre un proxy devant ce profil en réécrivant Host/Origin pour contourner les contrôles.

La racine statique doit être le build, jamais le dépôt, la base, les imports ou le stockage musical privé. Les médias de `/design` sont des décors de présentation. L’arbre de build doit rester sous contrôle de l’opérateur ; la vérification portable des chemins Node n’est pas une garantie atomique face à un compte OS hostile qui modifierait les répertoires en concurrence. Les médias privés restent accessibles uniquement par l’API autorisée.

## Pour réellement connecter le téléphone

1. Choisir puis configurer un transport privé HTTPS stable. Tailscale Serve a été proposé ; il n’est pas installé/activé. La connexion au compte sur les deux appareils nécessite l’utilisateur. Pas de Funnel public.
2. Livrer une véritable session de téléphone avec preuve d’instance, appairage court à usage unique, confirmation explicite sur le PC, grant minimal, expiration et révocation indépendante. Cette tranche n’a **pas** modifié le résolveur local pour partager silencieusement le principal Windows.
3. Revalider identité, workspace, grant, ressource et outil à chaque requête et opération différée ; garder les secrets serveur. Couvrir anti-rejeu, brute force, CSRF, révocation et isolation.
4. Terminer le jalon réseau : sauvegarde/restauration vérifiée, supervision, contrôle des dépendances et essais d’intrusion ciblés, puis recette Safari/Chrome réels (connexion, retour d’arrière-plan, média, clavier, déconnexion).

Le choix du transport seul ne termine pas l’étape 2. Aucune date ni garantie de fonctionnement sur téléphone n’est déduite du manifeste ou du CSS.

## Autres branchements

- Cerveau : adaptateur Qwen/Ollama local déjà présent, opt-in et lecture des droits côté Core. Il dépend du service Ollama réellement disponible. Aucun abonnement ChatGPT n’a été converti en clé API.
- Voix : controls explicites et dépendants des capacités du navigateur ; la reconnaissance locale n’est pas garantie sur Safari/iOS. Texte toujours disponible. Pas de cloud vocal ajouté implicitement.
- Home Assistant : token non fourni par l’utilisateur pour cette session ; HTTPS vérifié, cible autorisée et coffre serveur restent requis. Aucun appareil n’a été actionné.

## Vérification de cette tranche

122 tests ciblés passent (livraison statique, intégration Core verrouillé, origine, viewport, Home, accès local, révocation et courses de sessions). Types Web/API et build Vite passent. Lint TypeScript ciblé propre ; 37 avertissements de spécificité CSS/`!important` sur les feuilles contrôlées, sans erreur bloquante. Les tests viewport utilisent des événements simulés ; ce ne sont pas des essais sur iPhone/Android. Pas de recette authentifiée ni de validation réelle réseau/voix/domotique revendiquée.

Exécution locale vérifiée : `/` compilé et aperçu de développement répondent 200, API saine, base prête et verrou `LOCKED`. Le service Ollama arrêté a été relancé avec cloud désactivé et écoute loopback. Modèle épinglé retrouvé ; une requête synthétique directe au moteur a répondu `OK` en 66,28 s au chargement à froid. Ce contrôle ne valide pas le parcours authentifié depuis l’interface.
