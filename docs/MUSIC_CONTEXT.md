# IDA — Sélection du contexte musical

8 septembre 2026. Fondation serveur **exécutable sur base synthétique**, non branchée au chat ni à un modèle. Les deux agents et les douze profils livrés restent `PLANNED`. Aucun nouveau endpoint, écran, service, téléchargement, dépendance ou migration.

## Livré et réutilisé

Le Core, `AgentRegistry`, `IdentityAccessPolicy`, `ToolGateway`, profils d'environnement et Provider Registry/Router sont conservés. `MusicContextBroker` prépare un relevé factuel ; il ne choisit pas un fournisseur et ne génère aucun texte. `authorizeEnvironmentContext` extrait la vérification déjà utilisée par `constrainEnvironmentPolicy` : lecture et inférence partagent les règles de profil/agent/source/classe.

| Composant | Responsabilité |
| --- | --- |
| `packages/contracts/src/music-context.ts` (`@ida/contracts/music-context`) | Requêtes et résultats stricts, bornés, distincts des changements de dates en pause |
| `apps/api/src/music-context.ts` | Autorisation, sélection d'une source, validation, provenance minimale, annulation, audit expurgé |
| `apps/api/src/music-context-store.ts` | Projection SQL minimale sur les tables existantes, sans charger un catalogue complet |
| `apps/api/src/local-intelligence-access.ts` | Relecture persistée d'un travail déjà authentifié par `LOCAL_LOCK`, lié à son scope serveur |

Requêtes admises :

- `SEARCH_TRACK` : `title` facultatif (1–120 caractères), recherche partielle littérale insensible à la casse ; `%`, `_` et `\` n'élargissent pas la recherche.
- `SEARCH_MEDIA` : filtres facultatifs `mediaType` et `status` non archivé ; pas de recherche par nom de fichier, description, tag ou association.
- `limit` : entier 1–10, défaut 5, appliqué dans SQL avant transfert des résultats.

Tout autre champ/intention est refusé avant lecture. Pas encore de traduction de conversation naturelle vers ces requêtes : « publie » dans un titre reste une donnée de recherche. `SAVE_MEMORY` et `PUBLISH_POST` n'existent pas dans ce contrat ; leurs parcours sont des capacités séparées du Core.

`UNUSED` est le statut stocké, **pas la preuve d'absence de publication passée**. L'outil existant `list_content_rotation_candidates` conserve son critère éditorial plus conservateur et n'est pas remplacé.

## Données et provenance

Une requête lit une seule source liée au workspace de l'identité serveur. Archives exclues avant tri/limite. Ordre stable : titre/id pour les pistes, création/id descendants pour les médias.

- Morceau : id, titre, crédit artiste, genre, BPM, tonalité, statut, `updatedAt` UTC. Faits inconnus : `null`.
- Média : id, type, statut, `updatedAt` UTC uniquement.
- Exclus : descriptions, captions, noms de fichiers, tags, liens, chemins, hash, stockage, aperçus, contenu de fichier, usage, mémoire, profil artiste et associations vers une autre source.

Classe imposée **`PRIVATE_CREATIVE`**, même pour une fiche publiée. Les champs autorisés restent non fiables : un titre peut contenir une instruction ou un secret saisi par erreur. Cette projection n'est pas un détecteur de secrets ni une autorisation cloud. Aucun relevé de cette tranche n'est envoyé au modèle.

Le relevé `music-context.v1` conserve scope, invocation profil/agent/source, classe, identifiants et timestamps des faits. `capturedAt` est pris **avant** la lecture, pas après les audits. C'est un snapshot historique, ni cache d'autorisation, ni jeton signé, ni prompt prêt à envoyer. Une ressource peut être modifiée/archivée pendant une attente ultérieure : une future inférence doit relire/valider les ressources à l'envoi et avant restitution. `updatedAt` n'est pas une garantie atomique de fraîcheur. Ne pas persister ce relevé dans les logs ou l'historique de commande.

## Autorité

Avant lecture puis après les attentes sensibles (audit/récupération), le broker vérifie identité courante, mode `AI`, profil musical actif/version attendue, agent actif, source, classe et outil READ déclaré/allowlisté : `list_tracks` ou `search_media`. Cette lecture n'autorise pas `generate_intelligence_proposal` et ne vérifie ni ne consomme de quota fournisseur.

`LocalIntelligenceAccess` prend un scope **déjà authentifié** à la frontière HTTP serveur. Ce n'est pas un login et ce constructeur ne doit jamais accepter un scope libre du navigateur. Il recharge session, utilisateur, appareil, membership et grant via `DemoDatabase.resolveRequestIdentityContext(..., localSessionAt)` ; l'argument supplémentaire exige une ligne `local_auth_sessions` active/non expirée. Échéance effective : minimum de l'expiration absolue et de l'inactivité. La lecture ne prolonge ni `last_seen_at` ni `idle_expires_at` et ne sélectionne aucun token/digest. Rotation, révocation ou expiration bloquent la suite ; `VIEW_ONLY` reste limité à READ.

La session longue `LOCAL_DEMO` est refusée par cette source. Le résolveur historique fonctionne toujours sans le nouvel argument : aucun changement implicite du verrou ou de la démo.

Pour ce profil mono-processus, `getPolicy` et `getProfile` sont des lectures **synchrones, sans effet, de l'autorité runtime serveur**, après le chargement d'identité. `EnvironmentIntelligence` utilise aussi `getProfile` au lieu d'un chargeur asynchrone : une désactivation pendant l'attente d'identité est observée sans nouvelle attente après celle-ci. Les schémas refusent une Promise accidentelle. Ne pas transformer ces fonctions en caches périmés d'une autre autorité. Avant réglages persistés ou plusieurs processus, fournir une autorité agrégée/versionnée cohérente identité/policy/profil, pas des relectures asynchrones alternées.

Ces contrôles ne promettent ni révocation rétroactive de données déjà lues ni transaction globale SQL/réseau. Le store interne n'est pas une API ou une permission : ne pas le raccorder directement à une route/agent.

## Audit et erreurs

Puits d'audit obligatoire/injecté : son échec bloque lecture ou restitution. Champs : run, scope, environnement, agent, intention, résultat `ATTEMPT`/`SUCCEEDED`/`DENIED`. Aucun titre, filtre libre, référence de média, réponse, erreur SQL ou token. Une erreur typée est reconstruite à partir de son seul code pour supprimer message/cause privés.

`SUCCEEDED` constate la lecture validée, pas sa livraison : une révocation durant cet audit entraîne ensuite un refus. Les requêtes invalides sont rejetées avant l'audit métier ; leur futur journal HTTP devra être expurgé. Le [puits append-only persistant](INTELLIGENCE_AUDIT.md) est désormais livré et testé avec ce broker, sans branchement au chat ni modification des anciens tests en mémoire.

L'annulation empêche la lecture ou abandonne un résultat tardif. Elle n'interrompt pas nécessairement une requête PGlite en cours et n'efface pas rétroactivement la mémoire du processus.

## Vérification et suite

**650 tests / 37 fichiers**, soit 98 tests supplémentaires par rapport à la tranche modèle (552). Lint global, types et builds contracts/domain/API/web réussis. Tests ciblés : borne SQL, archives, isolation, filtres littéraux, champs privés exclus, erreurs, droits profil/agent/source/outils, identité falsifiée, inactivité, rotation, révocation pendant lecture/audit, annulation et autorité asynchrone interdite. Un scénario assemble vraie PGlite + session locale synthétique + broker + Gateway + SQL, puis vérifie le refus après verrouillage. Les statuts ACTIVE n'existent que dans les fixtures.

Suite : composer le puits persistant livré et le parcours opt-in ; valider les ressources à la frontière d'inférence ; ajouter prompt de formulation borné et évaluateur. Puis un seul agent musical synthétique via `EnvironmentIntelligence` et le transport Ollama existant, avant branchement au chat. Le broker ne corrige pas automatiquement le score **4/6** du modèle candidat. Aucune nouvelle inférence effectuée dans cette tranche.
