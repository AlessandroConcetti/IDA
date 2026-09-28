# IDA Permanent Build Contract

**Statut : règle permanente de développement**  
**Portée : IDA, La Fabrique et tous les environnements actuels et futurs**  
**Consultation : avant toute implémentation importante**

Ce contrat complète les spécifications propres à chaque environnement et les règles de développement de `AGENTS.md`. Il définit ce que signifie construire correctement une fonction IDA, afin d’éviter les fonctionnalités invisibles et les déclarations prématurées de fin.

## Fonction réelle, accessible et vérifiable

### 01 — Visible ↔ réel

Toute capacité destinée à l’utilisateur relie le backend réel, son contrat ou état, et une interface accessible. Une capacité présente uniquement dans un service, agent, route, base, test, fichier ou rapport n’est pas terminée. Réciproquement, aucun bouton, graphique, agent, statut, donnée ou action visible ne doit laisser croire à un comportement inexistant. Les infrastructures internes sans interaction directe — policy, gateway, audit, chiffrement, routeur — sont l’exception.

### 02 — Definition of Done = E2E

Pour une capacité utilisateur, `DONE` exige un parcours : interface → action → fonction réelle → donnée réelle → résultat → persistance si nécessaire → redémarrage → résultat toujours présent, avec erreurs gérées. Un composant, une route, un test unitaire, un agent déclaré, un adaptateur ou une animation simulée ne suffit pas.

### 03 — États d’interface obligatoires

Toute fonction asynchrone visible gère, selon le cas : `EMPTY`, `LOADING`, `SUCCESS`, `PARTIAL`, `ERROR`, `OFFLINE`, `PERMISSION_REQUIRED` et `CONFIGURATION_REQUIRED`. Pas d’écran blanc, de chargement sans fin, de bouton mort ni de fausse donnée.

### 04 — Aucune donnée fictive présentée comme réelle

Toute donnée visible est explicitement qualifiée parmi `REAL`, `DEMO`, `SIMULATED`, `UNKNOWN` ou `UNAVAILABLE`. Une valeur inventée ne doit jamais sembler provenir du système.

### 05 — Aucune interface morte

Chaque élément qui paraît interactif fonctionne ou est explicitement désactivé/indisponible. Aucun bouton décoratif ne se présente comme opérationnel.

### 06 — Aucune fonction invisible

Toute capacité construite pour Alessandro devient accessible dans l’UX de l’environnement concerné. Ne pas laisser une fonction terminée dans le code en supposant qu’une interface sera créée ultérieurement.

### 07 — Pause du redesign ≠ absence d’interface

Quand la refonte générale du frontend est en pause, ne pas redessiner IDA. Toute nouvelle fonction reçoit néanmoins son point d’entrée, sa vue métier minimale, ses états, ses contrôles et son retour utilisateur, en réutilisant le Design System existant. La finition artistique générale peut être réalisée dans une tranche séparée.

### 08 — Fonction avant décoration

Pour un chantier métier, progresser dans cet ordre : fonctionnement, intégration, UX, finition visuelle, animation. Ne pas investir dans l’embellissement d’une fonction qui ne marche pas encore.

## Références visuelles, 3D et mouvement

### 09 — Une référence visuelle est un contrat

Une capture, maquette, image ou design validé est une référence de réalisation. Ne pas remplacer arbitrairement sa composition, sa hiérarchie, ses proportions, ses matières, sa profondeur, son ambiance ou son mouvement par une interprétation générique.

### 10 — Revue structurelle et visuelle

Avant de déclarer conforme un écran doté d’une référence, comparer structure, position, proportions, espacements, typographie, profondeur, matériaux, animations et responsive. La présence des mêmes composants ne prouve pas la conformité.

### 11 — La 3D demandée doit être une vraie 3D

Quand une spécification demande explicitement un objet, environnement, avatar, robot, maison, orbite ou mouvement spatial 3D, ne pas le remplacer automatiquement par des transformations CSS, gradients, ombres, pseudo-3D, parallaxe 2D ou sprites. Si l’intention nécessite géométrie, profondeur, caméra, éclairage ou rotation libre, utiliser une vraie pipeline 3D.

### 12 — Blender est autorisé comme outil de production

Blender local peut servir à modéliser, nettoyer, retopologiser, créer UV, matériaux et rigs, animer, optimiser, baker, exporter GLB/GLTF et produire des LOD. Si son CLI ou Python est disponible, ces opérations peuvent être automatisées. Ne pas fabriquer laborieusement en CSS un asset qui relève d’un vrai modèle 3D.

### 13 — Blender n’est pas une dépendance d’exécution

Blender fabrique les assets. IDA utilise ensuite l’asset optimisé — GLB, GLTF ou autre format adapté — sans avoir besoin d’ouvrir Blender au quotidien.

### 14 — Budget de performance 3D

Pour chaque scène ou asset, définir un budget de polygones et de textures, des LOD si nécessaires, le chargement différé, l’instancing utile, la compression, le déchargement à la fermeture de l’environnement et la suspension de l’animation lorsqu’il est invisible. Le rendu doit rester performant.

### 15 — Le mouvement a un rôle

Les animations représentent si possible l’écoute, la réflexion, l’activité d’un agent, la navigation, un changement d’état ou une notification. Éviter les mouvements permanents coûteux qui n’expriment aucun état.

### 16 — Mouvement réduit

Respecter `prefers-reduced-motion` et les préférences IDA. Les informations et changements d’état essentiels restent compréhensibles sans animation complexe.

## Architecture et réutilisation

### 17 — Réutiliser avant de créer

Avant de coder, rechercher les capacités existantes dans IDA : composants, services, moteurs, agents, outils, connecteurs, schémas, coffre, CRM, calendrier, planification, factures, documents, graphiques, timeline, recherche et approbations. Ordre : réutiliser → étendre → extraire une primitive réellement partagée → créer.

### 18 — Ne pas généraliser trop tôt

Ne pas transformer immédiatement chaque fonction en framework générique. Une abstraction commune se justifie par plusieurs usages réels qui partagent le même comportement. Générique quand le besoin l’est ; spécifique au domaine sinon.

### 19 — Un moteur, plusieurs domaines

Partager les moteurs lorsque leur logique est identique : par exemple `InvoiceEngine` avec un profil menuiserie, plutôt qu’un moteur par métier. Appliquer le même principe au CRM, à la planification, aux documents, au calendrier, aux tâches, aux notifications et aux approbations.

### 20 — Propriété des données

Chaque donnée possède un propriétaire logique : Finance pour les données financières, Workspace pour l’orchestration des tâches, mails et calendriers communs, Music pour les métadonnées musicales, Care pour les dossiers santé. Les autres environnements consomment une référence, une projection ou une vue autorisée, et non une copie incontrôlée.

### 21 — Une seule source de vérité

Une information critique ne doit pas avoir plusieurs sources concurrentes. Définir sa source de vérité.

## Agents et usages des modèles

### 22 — Un agent n’est pas une fonctionnalité

Ne pas créer un agent pour chaque fonction. Créer un agent lorsqu’il faut du raisonnement, de la planification, de la recherche, de l’adaptation ou de l’orchestration. Une somme, un filtre, une waveform, un tri et un CRUD relèvent d’abord de code déterministe ou de DSP.

### 23 — Le minimum d’agents nécessaire

Pour chaque mission, utiliser le plus petit nombre d’agents suffisant. Ne pas déclencher huit agents si un agent et quelques fonctions déterministes remplissent le besoin.

### 24 — Les agents inactifs dorment

Un agent enregistré ne consomme pas de modèle lorsqu’il n’a rien à faire. Pas de boucle permanente de LLM sans justification.

### 25 — Local avant cloud quand c’est logique

Préférer, dans cet ordre lorsque c’est adapté : code déterministe, moteur local spécialisé, modèle local, modèle cloud léger, modèle cloud puissant. Ne pas envoyer tout à GPT/Gemini par défaut.

### 26 — Coût des exécutions

Les missions agentiques doivent pouvoir exposer, lorsque disponible, les agents et modèles utilisés, appels d’outils, tokens, coût API estimé, durée et exécution locale/cloud.

### 27 — Trace réelle des agents

Un graphe du Command Center reflète le runtime réel : un nœud agent correspond à une exécution, un nœud outil à un appel et un nœud d’approbation à une validation réelle. Pas d’animation fictive.

## Sécurité, confidentialité et erreurs

### 28 — Sécurité par construction

Aucune capacité ne contourne policy, Approval Gateway, Tool Gateway, scopes, audit ou coffre pour gagner du temps.

### 29 — Une action externe demande l’approbation appropriée

Les courriels, publications, suppressions importantes, achats, paiements et modifications externes sensibles respectent la policy et les approbations applicables.

### 30 — Aucun secret dans le code

Aucune clé API, aucun jeton, mot de passe ou credential en clair dans le dépôt, les journaux, captures, fixtures ou frontend.

### 31 — Frontières de confidentialité

Un environnement ne reçoit pas automatiquement les données privées d’un autre. Toute lecture entre domaines a une raison et un scope vérifiés.

### 32 — Une erreur est un état produit

Présenter ce qui a échoué, la cause si elle est connue, l’action possible pour l’utilisateur et la possibilité de réessayer. Pas de message générique sans piste.

### 33 — L’absence de réseau est un état produit

Lorsqu’une fonction dépend d’Internet, indiquer clairement qu’elle est indisponible. Le reste d’IDA continue à fonctionner lorsque possible.

### 34 — Un adaptateur n’est pas un connecteur terminé

Un connecteur est terminé quand l’authentification, l’appel, la réponse, la gestion des erreurs, le renouvellement ou la reconnexion si nécessaire, l’UI et les tests fonctionnent réellement.

## Vérification, performance et disponibilité

### 35 — Tester le vrai parcours utilisateur

Chaque capacité majeure a au moins un test de parcours utilisateur réel, pas seulement des tests de fonctions isolées.

### 36 — Vérifier la persistance après redémarrage

Pour toute donnée persistante : créer → fermer/redémarrer → rouvrir → vérifier.

### 37 — Tester les échecs

Tester notamment réseau en échec, données invalides, permission manquante, fichier manquant, délai dépassé et fournisseur indisponible lorsque pertinents.

### 38 — La performance fait partie de la Definition of Done

Avant de conclure, vérifier au minimum démarrage, inactivité, mémoire, CPU, GPU lorsque pertinent, réseau et tâches de fond. Une fonction qui rend IDA lourd n’est pas terminée.

### 39 — Zéro activité superflue quand un monde est fermé

Un environnement fermé ne continue pas à rendre une scène 3D, animer, interroger un service, scanner des fichiers ou appeler un LLM sans nécessité explicite.

### 40 — Chargement différé des éléments coûteux

Différer, lorsque pertinent, le chargement de la 3D, des graphiques lourds, audio, vidéo, grandes tables, agents, modèles et jeux de données.

### 41 — Le responsive est obligatoire

Tout parcours utilisateur principal est conçu au minimum pour ordinateur et mobile. Le téléviseur est pris en charge lorsqu’il est adapté à l’usage.

### 42 — Adapter l’usage au mobile

Le parcours mobile est conçu pour son contexte, et ne consiste pas à réduire la largeur de l’interface ordinateur.

### 43 — Accessibilité

Prévoir clavier, focus visible, libellés, contraste, mouvement réduit et équivalent textuel aux graphiques importants.

### 44 — Design System d’abord

Avant de créer un bouton, une carte, une modale, une table, un champ, une navigation, une infobulle ou un badge, rechercher l’équivalent existant dans IDA.

## Identité des environnements et QA visuelle

### 45 — Pas d’interface IA générique

Ne pas remplacer une direction artistique IDA validée par un tableau de bord SaaS générique, des gradients violets, des cartes vitrées aléatoires ou des composants sans identité. Respecter le caractère de chaque monde.

### 46 — Chaque monde a une mission propre

Un environnement n’est pas un simple thème du Hub. Il a sa mission, son modèle de données, ses workflows, ses outils, ses agents si nécessaires et une UX adaptée.

### 47 — Une capture corrigée déclenche une revue visuelle

Quand une capture réelle est fournie avec des corrections : identifier l’écran et ses composants, comparer, corriger le périmètre demandé, protéger thèmes et responsive, tester et produire une capture après modification.

### 48 — Ne pas modifier le design hors périmètre

Pour une correction visuelle ciblée, ne pas redessiner arbitrairement les autres zones. Respecter le périmètre demandé.

### 49 — Garder le avant et le après

Pour une correction visuelle importante, conserver la référence avant, puis fournir une capture après afin de permettre une vraie recette.

### 50 — Ne pas réduire la demande à un raccourci technique

Si Alessandro demande une planète 3D, ne pas traduire automatiquement cela par un cercle CSS dégradé. Comprendre l’intention physique et visuelle et choisir une mise en œuvre qui la satisfait réellement.

## Décisions et état de livraison

### 51 — Demander uniquement quand nécessaire

Avancer lorsqu’une décision se déduit du contexte. Demander une précision si le choix change substantiellement la sécurité, le coût, l’architecture, un design validé ou les données.

### 52 — Bloquer localement

Si une sous-tâche dépend d’un credential, d’une permission, d’un matériel ou d’un fichier utilisateur, bloquer uniquement cette sous-tâche et poursuivre les travaux indépendants.

### 53 — Statut honnête

Utiliser des statuts précis : `NOT_STARTED`, `SCAFFOLDED`, `PARTIAL`, `IMPLEMENTED`, `TESTED`, `E2E_VERIFIED` et `BLOCKED`. Ne pas résumer tout par « terminé ».

### 54 — Décrire ce qui existe vraiment

À la fin d’un chantier, distinguer explicitement `REAL`, `PARTIAL`, `MOCKED`, `BLOCKED` et `NOT_IMPLEMENTED`.

### 55 — Chaque demande améliore le système

Lorsqu’une fonction fournit une primitive réellement générique, la rendre réutilisable proprement. Le monde suivant doit coûter moins cher à construire lorsque les capacités se recoupent.

### 56 — Pas de réécriture sans raison

Ne pas réécrire une fonction stable, testée et correctement architecturée pour la seule élégance d’une nouvelle approche. Préférer une extension ou migration ciblée.

### 57 — Préserver les données utilisateur

Toute migration préserve les données, paramètres, assets et permissions, ou demande une confirmation explicite avant une opération destructive.

### 58 — Checkpoint avant un changement important

Créer un checkpoint/snapshot avant un chantier majeur, puis un checkpoint après validation. Pour les chantiers continus, créer un point de restauration à chaque tranche significative vérifiée.

### 59 — Concevoir la récupération

Une fonction importante prévoit sauvegarde, restauration, migration et récupération en cas de corruption ou d’échec, selon sa criticité.

### 60 — Principe final IDA

Pour toute capacité, vérifier : est-elle réelle, accessible, testée, persistante, sûre, légère, réutilisable lorsque pertinent et visuellement conforme ? Si une réponse requise est non, la capacité n’est pas `E2E_VERIFIED`.

## Mantra permanent

**NO FAKE UI. NO INVISIBLE FEATURES. NO DEAD BUTTONS. NO FAKE 3D. NO UNNECESSARY AGENTS. NO DUPLICATED ENGINES. NO CLOUD BY DEFAULT. NO “DONE” WITHOUT E2E. FUNCTION AND VISUAL MUST MATCH. BUILD ONCE, REUSE WHEN LOGICAL.**

## Application dans le dépôt

- `AGENTS.md` impose la consultation de ce contrat avant une implémentation importante.
- Chaque ajout métier doit préciser son écran et son point d’entrée dans le monde concerné, les états visibles, les tests et le statut de livraison.
- Quand plusieurs environnements sont à harmoniser, avancer monde par monde et conserver une checklist des capacités accessibles et vérifiées dans chaque monde.
- Les contrats propres à une tâche peuvent renforcer ces règles ; ils ne les annulent pas silencieusement.
