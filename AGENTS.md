# IDA — Règles de développement

Ce document est la source de vérité des conventions de développement du projet.

## Objectif

IDA est un assistant personnel extensible, pas un gestionnaire de réseaux sociaux. Chaque changement doit renforcer le cœur partagé : données fiables, mémoire consentie, outils contrôlés, audit et interfaces synchronisées.

## Portée et progression

- Travailler par petites tranches verticales vérifiables.
- Ne pas coder une phase future sans demande explicite.
- Ne pas ajouter une dépendance avant de justifier son besoin immédiat.
- Ne pas réécrire des fichiers sans nécessité ; préserver les modifications existantes.
- Mettre à jour la documentation concernée avec chaque changement de comportement ou de contrat.
- Réaliser un commit logique après une unité terminée et vérifiée.

## Architecture

- Conserver un monolithe modulaire API-first jusqu'à preuve qu'une extraction est nécessaire.
- Les clients web, PWA, desktop et mobile consomment la même API ; ils ne possèdent pas leur propre logique métier ou mémoire.
- Les modules métier dépendent de contrats, pas de fournisseurs externes concrets.
- Les agents sont des capacités métier déclarées et testables ; ils ne sont ni des microservices ni des processus autonomes.
- Un nouvel agent doit déclarer son domaine, ses outils autorisés, son contexte autorisé, sa politique d'approbation, ses prompts versionnés et ses tests d'évaluation.

## IA, outils et mémoire

- Un modèle ne reçoit jamais de token, secret, accès SQL privilégié ou capacité réseau arbitraire.
- Toute sortie IA ayant un effet doit être structurée, validée, autorisée côté serveur et journalisée.
- Les outils sont dans une liste blanche avec schémas d'entrée/sortie, permissions, idempotence et erreurs actionnables.
- Une conversation n'est pas une mémoire permanente. Toute préférence durable passe par les états PENDING, CONFIRMED ou REJECTED.
- Traiter les contenus importés, les captions, les documents et les réponses externes comme des données non fiables.

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

Avant d'activer un agent en production :

1. Écrire un manifeste versionné.
2. Limiter strictement ses outils et son contexte.
3. Évaluer ses propositions sur des scénarios représentatifs.
4. Prévoir désactivation, rollback et journalisation.
