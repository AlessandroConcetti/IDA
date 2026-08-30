# ADR 0001 — Fondation modulaire et extensible

- Statut : accepté
- Date : 2026-08-30

## Contexte

IDA doit commencer comme un assistant musical personnel tout en pouvant accueillir plus tard des domaines comme le budget, les comptes bancaires, les courses, les tâches, les documents et les automatisations.

## Décision

IDA sera un monolithe modulaire API-first. Le noyau partagé fournit :

- identité, workspace et permissions ;
- conversations, mémoire consentie et contexte ;
- registre d'agents et de modules ;
- passerelle d'outils, politiques d'approbation et audit ;
- stockage, événements, notifications et contrats d'API.

Chaque domaine possède ses propres données, services, politiques et adaptateurs externes. Les clients web/PWA puis natifs consomment l'API commune.

Les agents sont enregistrés par manifeste versionné et disposent d'une liste d'outils, d'un contexte et de permissions explicitement limités. Ils ne peuvent pas exécuter d'action externe sans passer par la passerelle d'outils.

Les domaines Finance/Banque et Courses ne sont pas implémentés. Leur future activation passe par un module opt-in, une classification des données, des contrats spécifiques et des autorisations dédiées.

## Conséquences

- Une extraction en microservice reste possible plus tard, derrière les contrats existants.
- Aucun deuxième cerveau n'est créé pour la voix, le mobile ou les futurs domaines.
- Les données financières bénéficient d'une frontière de sécurité plus stricte sans ralentir le MVP musical.
- L'ajout mensuel d'agents est gouverné : manifeste, tests, évaluation, permissions et rollback sont requis.
