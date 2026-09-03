# IDA — Modules et Module Registry v2

## Statut du document

Ce document décrit une **architecture cible**. Le runtime Phase 1 possède actuellement un registre statique de sections (`key`, `label`, `description`, `route`) et deux manifestes d'agents `PLANNED`. Il ne possède pas encore le Module Registry v2 décrit ici.

## Rôle d'un module

Un module est une tranche métier du monolithe IDA. Il possède ses données, ses règles, ses cas d'usage, ses outils, ses événements et ses projections API. Il ne possède ni client autonome, ni mémoire parallèle, ni token de fournisseur.

Le Core fournit seulement les invariants partagés : contexte de requête et workspace, contrats de commande, permissions et approbations, Tool Gateway, registres, audit, mémoire consentie et cycle de vie. Un module utilise ces capacités par contrats.

Une section de navigation n'est pas un module. `HOME` peut rester une vue cliente tandis que Music, Content ou Finance sont des domaines métier. Cette distinction évite de coupler l'ownership des données aux routes d'une interface particulière.

## Manifeste v2

Chaque module revu au build fournit un manifeste versionné. La forme exacte sera ajoutée aux contrats partagés dans la tranche qui implémentera le registre ; les champs suivants constituent le contrat architectural minimal :

| Champ | Finalité |
|---|---|
| `key`, `version`, `displayName` | identité stable et version sémantique |
| `contractVersion` | compatibilité avec le Core et les événements partagés |
| `lifecycle` | `PLANNED`, `INSTALLED`, `ACTIVE` ou `DISABLED` |
| `readinessChecks` | causes factuelles `AVAILABLE`, `PARTIAL`, `LOCKED` ou `NOT_INSTALLED` |
| `ownedData` | entités possédées et classifications de données |
| `supportedModes` | support de `NORMAL`, `AI`, ou des deux |
| `tools` | clés d'outils enregistrées, schémas et permissions |
| `eventsPublished`, `eventsConsumed` | contrats d'événements versionnés |
| `dependencies` | autres modules requis, avec versions compatibles |
| `providerCapabilities` | capacités obligatoires ou facultatives, jamais un nom de fournisseur concret |
| `retentionPolicy` | référence vers conservation, export et suppression |
| `migrations` | lot de migrations explicite et versionné |
| `agents` | agents facultatifs appartenant au module |
| `healthChecks` | vérifications d'activation et raisons de blocage actionnables |

Le manifeste ne contient jamais de secret, de code téléchargé, de prompt brut destiné au client ou d'accès SQL.

Le cycle de vie, la disponibilité et la santé ne sont pas mélangés. La santé runtime (`UNKNOWN`, `ONLINE`, `WARNING`, `ERROR`, `OFFLINE`) est calculée par System à partir des checks ; elle n'est pas une promesse écrite dans le manifeste.

## Validation au démarrage

Le Module Registry v2 construit un graphe immuable à partir des modules livrés avec le Core :

1. valider chaque manifeste et refuser les clés ou versions dupliquées ;
2. vérifier la compatibilité avec la version du Core ;
3. résoudre les dépendances et refuser les cycles ;
4. vérifier que chaque outil, agent, événement et capacité provider référencé existe ;
5. vérifier les migrations avant activation ;
6. activer seulement les modules autorisés pour le workspace ;
7. publier un état explicite lorsque le module est désactivé ou bloqué.

Le registre échoue fermé. Un module absent, invalide ou désactivé n'enregistre pas ses routes et ne peut pas recevoir de contexte, exécuter un outil, lancer un agent ou migrer des données.

## Activation et modes

L'installation du code et l'activation métier sont distinctes. Le code d'un module est revu et livré avec l'application ; son activation est une configuration serveur auditée par workspace.

- En mode `NORMAL`, le module expose ses cas d'usage déterministes sans appel de modèle.
- En mode `AI`, il peut ajouter des propositions ou analyses via des agents et providers déclarés.
- Un module ne peut pas exiger `AI` pour relire, exporter, corriger ou supprimer les données qu'il possède.
- Le mode `AI` ne change ni le rôle de l'utilisateur, ni la permission d'un outil, ni l'exigence d'approbation.
- La désactivation d'`AI` conserve les données factuelles et les parcours `NORMAL`.

## Outils et agents

Un outil est enregistré une seule fois dans le Tool Registry avec son propriétaire, ses schémas d'entrée/sortie, sa permission, son handler, son comportement d'idempotence, son audit et ses erreurs. Une route, un agent ou le Core invoque cette définition ; il ne duplique pas son allowlist.

Un agent est une capacité facultative d'un module, pas un processus autonome. Son manifeste doit référencer uniquement des outils et sources de contexte disponibles. Le passage à `ACTIVE` est refusé si le prompt versionné, la suite d'évaluation, les contrats ou les outils ne sont pas résolus.

## Dépendances entre modules

- Un module ne lit pas directement les tables d'un autre module.
- Une dépendance synchrone utilise un service public ou un port versionné.
- Une réaction asynchrone utilise un événement et un consommateur idempotent.
- Les projections transverses, comme un dashboard, assemblent des DTO minimaux ; elles ne deviennent pas propriétaires des données sources.
- Une dépendance ne donne jamais accès à tout le contexte du module fournisseur.

Les modules restent dans le monolithe tant qu'une extraction n'est pas justifiée. L'indépendance recherchée est d'abord une frontière de contrats, tests et ownership, pas un déploiement séparé.

## Familles de modules

| Domaine | État documentaire | Frontière initiale |
|---|---|---|
| Music, Content, Campaigns, Calendar, Tasks, Memory, System | capacités Phase 1 partielles | consolider leurs services et outils dans le monolithe |
| Social, Analytics, Notifications | déclaratif ou futur selon la capacité | aucun effet externe sans provider et approbation adaptés |
| Finance | futur, non planifié actuellement | lecture seule, isolation et conformité dédiées |
| Courses (`GROCERIES`) | futur, non planifié actuellement | listes avant achat ; aucune commande implicite |
| Santé (`HEALTH`) | futur, non planifié actuellement | données sensibles ; aucune décision clinique autonome |
| Maison (`HOUSEHOLD`) | futur, non planifié actuellement | distinguer inventaire, capteurs et actions physiques critiques |
| Legal (`LEGAL`) | futur, non planifié actuellement | documents et échéances ; aucune représentation ou signature autonome |

Les clés entre parenthèses sont indicatives et ne modifient pas les contrats actuels.

## Migration depuis le registre actuel

La migration doit rester verticale et progressive :

1. renommer conceptuellement le registre actuel en catalogue de navigation sans casser son API ;
2. définir le contrat `ModuleManifestV2` et ses tests de validation ;
3. extraire un module simple dans une frontière interne, sans nouveau service réseau ;
4. enregistrer ses outils dans le Tool Registry ;
5. faire composer ses routes par le point d'entrée de l'API ;
6. ajouter l'activation par workspace seulement lorsqu'un besoin réel existe ;
7. répéter module par module, sans réécriture globale.

## Critères d'acceptation du registre v2

- ajouter un module revu ne modifie pas l'orchestrateur du Core ;
- désactiver un module retire réellement ses routes, outils, agents et contexte ;
- toute dépendance et tout provider requis sont vérifiés au démarrage ;
- aucune donnée ou capacité n'est accordée par simple présence dans l'interface ;
- les tests couvrent doublons, cycle de dépendance, version incompatible, outil absent, provider absent et migration en échec.

Voir aussi [l'ADR Tentacular](docs/adr/0003-tentacular-core-and-cross-platform-clients.md), [les providers](AI_PROVIDERS.md) et [la sécurité](SECURITY.md).
