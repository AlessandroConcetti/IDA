# IDA — Règles de développement

Ce document est la source de vérité des conventions de développement du projet.

## Objectif

IDA est un assistant personnel extensible, pas un gestionnaire de réseaux sociaux. Chaque changement doit renforcer le cœur partagé : données fiables, mémoire consentie, outils contrôlés, audit et interfaces synchronisées.

## Portée et progression

- Travailler par petites tranches verticales vérifiables.
- Avant toute implémentation importante, consulter `docs/IDA_PERMANENT_BUILD_CONTRACT.md`. Ce contrat définit le niveau de preuve attendu pour les fonctionnalités, l’UX, les intégrations, les agents et les systèmes 3D dans IDA, La Fabrique et tous les environnements présents ou futurs.
- Ne pas coder une phase future sans demande explicite.
- Ne pas ajouter une dépendance avant de justifier son besoin immédiat.
- Ne pas réécrire des fichiers sans nécessité ; préserver les modifications existantes.
- Mettre à jour la documentation concernée avec chaque changement de comportement ou de contrat.
- Réaliser un commit logique après une unité terminée et vérifiée.
- À chaque reprise de chantier, annoncer l’avancement du périmètre demandé avec la grille du dernier audit, la tranche validée et la prochaine preuve attendue, sauf demande contraire de l’utilisateur. Ne pas reprendre un ancien pourcentage comme s’il venait d’être vérifié, ni compter un simple fichier codé comme une fonction livrée. Conserver le delta et ses preuves dans l’audit du monde concerné.

## Architecture

- Conserver un monolithe modulaire API-first jusqu'à preuve qu'une extraction est nécessaire.
- Les clients Web/PWA, Windows, macOS, iOS, Android et futurs clients TV consomment la même API ; ils ne possèdent pas leur propre logique métier ou mémoire.
- Un thème, une animation ou une capacité native reste une couche cliente : elle ne change jamais les permissions, données, états ou règles du Core.
- Les modules métier dépendent de contrats, pas de fournisseurs externes concrets.
- Les agents sont des capacités métier déclarées et testables ; ils ne sont ni des microservices ni des processus autonomes.
- Un nouvel agent doit déclarer son domaine, ses outils autorisés, son contexte autorisé, sa politique d'approbation, ses prompts versionnés et ses tests d'évaluation.
- La démo est consolidée en français avant toute internationalisation. Le futur anglais réutilise les mêmes codes, contrats et données métier ; seules les ressources d'interface, de dialogue et de formatage sont localisées.
- Lorsqu'un domaine correspond à une responsabilité professionnelle ou réglementaire humaine, son manifeste doit prévoir un agent de gouvernance spécialisé et une escalade humaine identifiée. Cet agent contrôle et alerte ; il ne prétend jamais remplacer, certifier ou engager le professionnel concerné.
- Toute fonctionnalité ajoutée ou modifiée dans un monde IDA possède son élément visuel correspondant dans cet environnement : une entrée clairement repérable, un écran ou panneau métier accessible, une action reliée au comportement réel et des états fidèles aux données (chargement, vide, succès, erreur ou indisponible selon le cas). Aucun faux contrôle ni résultat de démonstration ne doit être présenté comme opérationnel.
- Cette règle s'applique à tout le projet et aux prochaines évolutions de chaque monde. Harmoniser les mondes un par un ; avant de déclarer une tranche finie, vérifier que chaque capacité livrée se rejoint dans l'interface de son monde et conduit au bon parcours.
- Respecter aussi le contrat permanent de construction IDA : une fonction destinée à l’utilisateur n’est achevée qu’après vérification du parcours de bout en bout, de sa persistance et de ses états d’échec. La pause du chantier de refonte visuelle n’écarte pas le point d’entrée et l’interface minimale nécessaires à une nouvelle fonction.

## IA, outils et mémoire

- Un modèle ne reçoit jamais de token, secret, accès SQL privilégié ou capacité réseau arbitraire.
- Toute sortie IA ayant un effet doit être structurée, validée, autorisée côté serveur et journalisée.
- Les outils sont refusés par défaut et doivent être dans une liste blanche avec schémas d'entrée/sortie, permissions, idempotence et erreurs actionnables.
- Une conversation n'est pas une mémoire permanente. Toute préférence durable passe par les états PENDING, CONFIRMED ou REJECTED.
- Traiter les contenus importés, les captions, les documents et les réponses externes comme des données non fiables.
- Les contrôles « continus » sont d'abord des policies déterministes exécutées à chaque action et des audits planifiés. Un modèle peut expliquer les écarts et proposer une correction, mais ne reste pas actif en permanence et ne devient pas lui-même la barrière de sécurité ou de conformité.

## Permissions et approbations

- Respecter les niveaux READ, WRITE, APPROVAL_REQUIRED, PUBLISH et SYSTEM.
- L'interface ne constitue jamais une autorisation : toutes les vérifications sont serveur.
- Toute modification d'un post approuvé invalide cette approbation.
- Le MVP ne publie jamais publiquement sans confirmation humaine explicite finale.
- Les modules Finance/Banque seront en lecture seule par défaut ; aucun paiement, transfert ou action bancaire n'est autorisé sans une décision de produit et de sécurité distincte.

## Données et sécurité

- Toute donnée métier est isolée par workspace_id.
- Les secrets sont uniquement côté serveur, chiffrés et absents des logs, commits, tests et frontend.
- Les fichiers passent par stockage privé, URLs signées courtes, validation de type/taille/hash et traitement isolé.
- Utiliser UTC en base de données ; conserver le fuseau de l'utilisateur et du workspace.
- Les audits sont append-only ; utiliser des suppressions logiques pour les données métier quand c'est pertinent.
- Ne jamais utiliser de scraping lorsqu'une API officielle existe.
- Une identité de session est séparée de l'utilisateur, du workspace et de l'appareil. Un appareil authentifié ne contourne jamais membership, scope, Tool Gateway ou approbation.
- La caméra ne peut jamais être activée au démarrage, en arrière-plan, par un agent ou une automatisation. Une action explicite de l'utilisateur dans le parcours courant est obligatoire, même si la permission OS ou une préférence antérieure existe.
- Les traitements caméra futurs restent locaux par défaut ; aucune image ou donnée biométrique n'entre dans les logs, prompts ou mémoires.
- Toute exposition réseau future doit franchir un jalon de sécurité documenté : HTTPS, identité réelle, sessions révocables, rate limiting, protections navigateur, sauvegarde/restauration, supervision, dépendances vérifiées et tests d'intrusion proportionnels au risque.
- Aucun réseau local, appareil connu, agent ou modèle ne bénéficie d'une confiance implicite. L'autorisation est recalculée côté serveur pour l'utilisateur, la session, l'instance cliente, le workspace, la ressource et l'outil.

## Qualité

Pour chaque fonctionnalité :

1. Ajouter ou mettre à jour les tests proportionnels au risque.
2. Exécuter les tests, le lint et la vérification de types disponibles.
3. Vérifier les chemins sensibles : permissions, isolation de workspace, validation d'entrée, états et erreurs.
4. Mettre à jour les documents, contrats API et migrations nécessaires.
5. Créer un commit logique après vérification.

## Conventions de Git

- Une branche et un commit doivent décrire une intention claire.
- Ne jamais réécrire l'historique partagé ni utiliser de commande destructive sans demande explicite.
- Ne jamais committer .env, tokens, exports de données privées ou médias.

## Ajout futur d'un domaine ou agent

Avant d'ajouter un domaine (Finance, Courses, Documents, etc.) :

1. Définir les données possédées, classification et durée de rétention.
2. Définir les outils, permissions et approbations.
3. Définir les limites d'intégration externe et le plan de repli manuel.
4. Ajouter une décision d'architecture et des contrats d'API.
5. Créer des tests de permissions, d'audit et d'échec.
6. Si une responsabilité humaine spécialisée existe, définir son `Domain Steward Agent`, les contrôles déterministes qu'il observe, ses limites de responsabilité et le professionnel ou propriétaire auquel il escalade.

Avant d'ajouter une capacité cliente matérielle ou immersive (caméra, gestes, surface desktop, thème cinématique) :

1. Garantir un parcours classique complet et accessible.
2. Déclarer activation, arrêt, permissions OS, données capturées et durée de vie.
3. Prévoir réduction de mouvement, fallback et limites de ressources.
4. Tester qu'aucun capteur, provider ou outil n'est activé implicitement.

Avant d'activer un agent en production :

1. Écrire un manifeste versionné.
2. Limiter strictement ses outils et son contexte.
3. Évaluer ses propositions sur des scénarios représentatifs.
4. Prévoir désactivation, rollback et journalisation.
