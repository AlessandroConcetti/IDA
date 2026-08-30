# ADR 0002 — runtime local de Phase 1 et PGlite

**Date :** 30 août 2026
**Statut :** accepté pour le développement local uniquement

## Contexte

IDA doit démontrer rapidement un premier flux complet — Command Center, API, contrats, données musicales et commande contrôlée — sans ajouter un déploiement cloud, un conteneur de base de données, un fournisseur d’identité ou des secrets avant qu’ils soient nécessaires.

## Décision

- Le web local utilise React/Vite et consomme la même API que les futurs clients.
- Le backend est un monolithe Fastify/TypeScript avec `packages/contracts` et `packages/domain` partagés.
- PGlite fournit une persistance PostgreSQL-compatible locale dans `apps/api/.data/`, exclusivement pour le développement et les tests.
- Le runtime injecte un contexte de démonstration fixé côté serveur. Le client ne peut pas choisir librement de workspace.
- IDA Core reste déterministe et limité à des outils de lecture. Il ne reçoit aucun secret ni capacité réseau arbitraire.

## Conséquences

Cette décision réduit la surface opérationnelle et permet de vérifier les contrats, l’isolation de workspace et l’ergonomie du Command Center avant de connecter des services réels. Le dossier PGlite est ignoré par Git ; il ne peut contenir que des données de démonstration.

Elle ne constitue pas une décision de base de données de production. Avant toute bêta avec données personnelles, IDA doit introduire une identité réelle, une base PostgreSQL centralisée, des migrations versionnées, sauvegardes/restaurations testées, stockage privé, secrets gérés, observabilité et contrôles de permissions complets.

Les adaptateurs sociaux, financiers et de courses restent absents. Leur ajout passera par leurs modules, contrats, politiques d’outils, audits et exigences de sécurité propres.
