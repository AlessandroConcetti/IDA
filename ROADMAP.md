# IDA — Roadmap de construction

## Cadre de livraison

IDA sera construit par petites étapes testables. Une phase ne démarre réellement que lorsque les critères de sortie de la précédente sont satisfaits ou qu'une décision documentée accepte un écart. Chaque évolution produit un changement ciblé, des tests proportionnés, une mise à jour de documentation et un commit logique lorsque Git est actif.

La roadmap décrit une séquence de capacité, pas une promesse de date. Elle privilégie un socle fiable plutôt qu'un grand nombre de fonctions incomplètes.

## Vue d'ensemble

| Phase | Objectif | Résultat principal |
|---|---|---|
| 0 | Figer les fondations | Architecture, décisions, conventions et périmètre MVP — terminé |
| 1 | Rendre IDA utilisable comme hub musical | En cours : Command Center, API locale, chat déterministe, Artist/Music Brain et DAM à compléter |
| 2 | Rendre IDA utile pour le contenu | Planning, propositions, Approval Center et fraîcheur |
| 3 | Connecter prudemment les plateformes | OAuth, adaptateurs sociaux pilotes et capacités réelles |
| 4 | Ajouter l'exploitation continue | Jobs, notifications, analytics, campagnes et système |
| 5 | Ajouter la voix au même cœur | STT/TTS déclenchés à la demande et commandes vocales |
| 6 | Renforcer l'intelligence et l'extensibilité | Recommandations, multimodal, agents avancés et modules opt-in |

## Phase 0 — Architecture et fondations — terminée

### Objectif

Transformer la vision en cadre de travail précis, sans développer de fonctionnalités produit.

### Livrables

- `ARCHITECTURE.md` : monolithe modulaire, API-first, clients et extensibilité ;
- `DATABASE.md` : entités, relations, contraintes, index et états métier ;
- `API.md` : ressources, endpoints, conventions, erreurs et autorisation ;
- `ROADMAP.md` : séquence de livraison et critères de sortie ;
- `SECURITY.md` : secrets, OAuth, permissions, audit, fichiers et environnements ;
- `SOCIAL_APIS.md` : matrice des capacités et limites officielles ;
- `AGENTS.md` : règles de développement, conventions et définition de terminé ;
- décisions d'architecture (ADR) pour les choix réellement bloquants ;
- définition du périmètre MVP et des fonctions explicitement différées.

### Décisions à confirmer avant le code

- stack web, API, base relationnelle, stockage média et fournisseur d'authentification ;
- stratégie de déploiement développement et production ;
- premier projet artistique de démonstration ;
- plateforme sociale pilote, après vérification de sa documentation officielle ;
- politique de confirmation des publications et des actions externes.

### Critères de sortie

- les documents de référence sont cohérents entre eux et deviennent la source de vérité ;
- les statuts des entités principales et les permissions sont définis ;
- les domaines hors MVP sont explicitement exclus ;
- une première tranche de Phase 1 peut être réalisée sans reconstruire l'architecture.

## Phase 1 — IDA Core et hub musical

### Objectif

Créer le premier produit réellement utilisable : un Command Center responsive où l'utilisateur peut centraliser son univers artistique et interroger IDA par écrit.

### Tranche 1 livrée

- dépôt TypeScript en workspace, tests, lint et vérification de types ;
- Command Center React responsive desktop/iPhone avec tous les modules initiaux, dont `SOCIAL`, `CAMPAIGNS`, `ANALYTICS`, `TASKS`, `MEMORY` et `SYSTEM` ;
- API Fastify locale, contrats Zod partagés et policy d’outils ;
- données musicales, médias, mémoire, tâches et capacités sociales de démonstration isolées par workspace côté serveur ;
- commandes textuelles déterministes de lecture : journée, contenus inutilisés et état système ;
- Artist Brain éditable : identité, ton, genres, influences, audience, objectifs et vocabulaire, avec validation, permission `WRITE` interne et persistance locale ;
- Music Brain : création locale contrôlée d’un morceau avec métadonnées, validation stricte, scope résolu par le serveur, outil `WRITE` allowlisté et audit append-only ;
- Content Library : import local privé d’un média avec limites, hash SHA-256, détection de doublon, tags normalisés, stockage à clé générée et audit append-only ;
- Memory Consent Center : proposition de préférence en `PENDING`, décision humaine explicite et finale, scope serveur, timestamps persistés et audit sans contenu libre ;
- Task Center : création locale contrôlée, échéance facultative, finalisation explicite idempotente, scope serveur et audit append-only sans contenu libre ;
- PGlite uniquement pour le développement/test local ; aucun compte social, aucun token, aucune publication et aucune donnée personnelle réelle.

La tranche suivante de Phase 1 remplace le contexte de démonstration par une vraie identité/workspace, puis ajoute la recherche et les filtres média, les prévisualisations/traitements sécurisés, l’historique de commandes et la consultation du journal d’activité. Elle ne débloque pas encore la publication sociale.

### Périmètre

1. Initialiser le dépôt, les conventions, les environnements et les tests de base.
2. Mettre en place l'authentification, l'espace personnel et les permissions initiales.
3. Créer le dashboard `IDA COMMAND CENTER` responsive desktop/iPhone.
4. Créer la conversation textuelle et le premier endpoint de commande IDA.
5. Créer `Artist Brain` éditable : identité, ton, influences, objectifs, règles et préférences.
6. Créer `Music Brain` : projets, releases, tracks et métadonnées musicales.
7. Créer `Content Library` : upload contrôlé, hash, tags, recherche, filtres, aperçu et détection de doublons exacts.
8. Ajouter les agents minimums : `Memory Manager` et `Music Librarian` en lecture/proposition.
9. Ajouter historique de commandes, logs d'activité et premiers états système.

### Hors périmètre

- publication sociale ;
- calendrier éditorial complet ;
- génération massive de contenu ;
- scheduler et notifications réelles ;
- voix ;
- finance, banque et courses.

### Critères de sortie

- un utilisateur authentifié peut créer ou modifier son profil artistique ;
- il peut enregistrer et rechercher tracks, releases et médias ;
- un même fichier média est détecté de façon fiable par son hash ;
- une commande textuelle simple retourne un résultat fondé sur les données autorisées ;
- une préférence durable nécessite une décision explicite de l'utilisateur ;
- les parcours critiques disposent de tests et aucune donnée sensible n'est exposée au client.

## Phase 2 — Content Manager et Approval Center

### Objectif

Faire d'IDA un assistant éditorial qui propose, organise et soumet du contenu à validation sans publication automatique.

### Périmètre

1. Implémenter les entités `Post`, `PostVariant`, `ContentPlan`, `Campaign`, `Approval` et leurs états.
2. Créer les agents `Content Manager`, `Content Curator`, `Copywriter` et `Calendar Manager`.
3. Générer des propositions de contenu liées à des médias, tracks, objectifs et règles artistiques.
4. Créer le calendrier éditorial en vues jour, semaine et mois.
5. Détecter conflits, surcharge, répétitions et indisponibilités de médias.
6. Calculer un premier `Content Freshness Score` explicable à partir de l'historique d'usage.
7. Créer `IDA APPROVAL CENTER` avec `APPROVE`, `EDIT`, `REJECT` et `REGENERATE`.
8. Enregistrer le raisonnement concis, la version de caption et toute invalidation d'approbation.

### Hors périmètre

- envoi public automatisé ;
- synchronisation de calendrier externe ;
- décision autonome de modifier la stratégie ;
- analytics de production si aucun adaptateur social n'est encore connecté.

### Critères de sortie

- IDA peut préparer un plan quotidien ou hebdomadaire à partir des données disponibles ;
- chaque proposition indique média, plateforme cible, caption, objectif, date, statut et justification ;
- modifier le média, le texte ou l'horaire annule une approbation antérieure ;
- aucun passage vers un état de publication ne peut contourner une validation humaine ;
- les règles anti-répétition sont testées sur des données connues.

## Phase 3 — Connexions sociales progressives

### Objectif

Ajouter des intégrations une à une, en respectant strictement les capacités, limites et conditions officielles de chaque plateforme.

### Ordre recommandé

1. Choisir une plateforme pilote selon les besoins réels et l'éligibilité du compte.
2. Ajouter son adaptateur, OAuth, stockage chiffré des credentials, renouvellement de token et état système.
3. Ajouter lecture des capacités et analytics disponibles.
4. Ajouter export, brouillon ou planification seulement lorsque l'API officielle le permet et que le parcours est validé.
5. Répéter pour les plateformes suivantes : Instagram, YouTube, TikTok, Facebook, selon faisabilité documentée.

### Règles de sécurité et produit

- aucun scraping si une API officielle existe ;
- jamais de token OAuth dans le navigateur ;
- aucune publication publique automatique dans le MVP ;
- toute action externe est tracée, idempotente et soumise aux permissions ;
- la matrice dans `SOCIAL_APIS.md` est mise à jour avant toute implémentation.

### Critères de sortie

- au moins un adaptateur pilote peut connecter et déconnecter un compte de manière sûre ;
- l'interface montre ce que la plateforme peut réellement faire, sans promesse fictive ;
- les erreurs OAuth et expirations de token sont visibles dans `IDA SYSTEM` ;
- l'utilisateur peut finaliser manuellement une publication ou confirmer explicitement le parcours autorisé ;
- les logs permettent de comprendre chaque livraison externe.

## Phase 4 — Opérations, campagnes, analytics et notifications

### Objectif

Passer d'un outil de proposition à un assistant quotidien fiable : exécutions différées, alertes, analyses et campagnes suivies.

### Périmètre

1. Ajouter worker, file de tâches, outbox, retries contrôlés et idempotence.
2. Ajouter scheduler pour les rappels, synchronisations et actions autorisées.
3. Créer les notifications : approbation en attente, échec, token expiré, campagne terminée, performance importante et tâche terminée.
4. Compléter les campagnes : objectif, piliers, contenus liés, échéances et résultats.
5. Ajouter collecte et affichage d'analytics lorsque les APIs les autorisent.
6. Ajouter `Analytics Agent` : recommandations justifiées, jamais changement autonome de stratégie.
7. Ajouter `System Agent` et la page `IDA SYSTEM` : AI, base, stockage, connexions, scheduler et notifications.

### Critères de sortie

- une exécution différée peut être reprise sans double effet ;
- les erreurs actionnables génèrent une notification et un événement système ;
- l'utilisateur peut comprendre l'état d'une campagne et ses contenus liés ;
- les recommandations analytics citent les données et leurs limites ;
- les sauvegardes, restauration et observabilité essentielles sont testées avant toute utilisation soutenue.

## Phase 5 — Voix

### Objectif

Permettre de parler à IDA en conservant exactement le même cœur, la même mémoire, les mêmes permissions et les mêmes validations que le chat.

### Périmètre

1. Ajouter un bouton d'enregistrement volontaire dans web/PWA.
2. Intégrer speech-to-text derrière un adaptateur fournisseur.
3. Envoyer le texte transcrit vers le même endpoint de commandes.
4. Ajouter text-to-speech optionnel derrière un adaptateur fournisseur.
5. Afficher transcription, réponse et actions proposées avant toute mutation sensible.
6. Gérer explicitement consentement micro, erreurs, confidentialité et conservation éventuelle des enregistrements.

### Hors périmètre

- écoute permanente ;
- mot d'activation ;
- commandes exécutées sans affichage ou validation ;
- cerveau vocal séparé.

### Critères de sortie

- une commande vocale et son équivalent textuel produisent le même type de `CommandRun` ;
- l'utilisateur peut corriger la transcription avant une action importante ;
- la voix respecte les politiques de données et de permissions ;
- les parcours microphone fonctionnent sur les appareils ciblés avec repli texte clair.

## Phase 6 — IDA avancée et extension contrôlée

### Objectif

Faire évoluer IDA en assistant personnel plus proactif, multimodal et modulaire, sans perdre le contrôle humain ni la lisibilité des actions.

### Périmètre possible

- recommandations proactives opt-in ;
- analyse multimodale de médias avec résultats révisables ;
- mémoire enrichie avec sources, confiance et contrôle utilisateur ;
- planification inter-domaines à partir de règles explicites ;
- registre d'agents versionné et processus d'onboarding d'un nouvel agent ;
- modules personnels opt-in : tâches avancées, calendrier personnel, documents, notes et automatisations ;
- amélioration progressive des clients natifs si la PWA ne couvre plus les besoins.

### Critères de sortie

- chaque nouvelle capacité est isolée par module, outils et permissions ;
- les suggestions proactives peuvent être désactivées, expliquées et auditées ;
- le registre d'agents empêche un agent d'accéder à des outils ou données non déclarés ;
- aucune automatisation sensible ne contourne le contrôle humain ;
- les limites de coût, latence et fiabilité sont mesurées pour chaque agent ajouté.

## Après la phase 6 — Domaines personnels différés

### Finance et banque

Le futur module Finance sera étudié après le socle IDA, et seulement après choix du pays, des besoins et d'un fournisseur conforme. Il pourra commencer par budget et catégorisation en lecture. La connexion bancaire, l'import de transactions, les conseils financiers et tout paiement nécessitent une conception de sécurité, de consentement et de conformité distincte.

**Ce module n'est pas planifié pour implémentation dans les phases 0 à 6 actuelles.** L'infrastructure préparée est limitée à l'isolation par module, l'espace propriétaire, les permissions, les outils auditables et les adaptateurs externes.

### Courses

Le futur module Courses pourra gérer listes, préférences et propositions de réassort. Il commencera sans achat ni accès commerçant. Les commandes e-commerce, si elles sont ajoutées, exigeront adaptateurs spécifiques, confirmations claires et contrôle par l'utilisateur.

**Ce module n'est pas planifié pour implémentation dans les phases 0 à 6 actuelles.**

## Ajout mensuel d'un agent

À mesure qu'IDA grandit, un agent peut être ajouté chaque mois si sa valeur est claire. Le rythme ne doit jamais imposer un agent artificiel. Pour chaque agent proposé :

1. Définir le problème concret, le module propriétaire et les résultats attendus.
2. Déclarer ses intentions, schémas, sources de contexte, outils et permissions dans le registre.
3. Démarrer en lecture ou proposition, avec exemples de test représentatifs.
4. Mesurer précision, coût, latence, erreurs et taux de validation humaine.
5. Accorder seulement les permissions supplémentaires justifiées par les résultats.
6. Documenter la décision et conserver un mécanisme de désactivation immédiat.

Les premiers candidats naturels après le socle sont `Campaign Manager`, `Analytics Agent` et `System Agent`. Un agent Finance ou Courses ne sera évalué qu'au moment de l'ouverture de son module, avec des politiques propres.

## Definition of Done pour chaque fonctionnalité

Une fonctionnalité est terminée lorsque :

- le besoin et le périmètre sont explicites ;
- les permissions et les états métier sont définis ;
- le code ciblé, ses tests et ses migrations éventuelles sont validés ;
- les erreurs pertinentes ont un résultat compréhensible ;
- la documentation de référence est mise à jour ;
- les secrets ne sont pas exposés et les effets externes sont audités ;
- le changement a fait l'objet d'un commit logique lorsque Git est utilisé.
