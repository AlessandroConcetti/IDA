# IDA — Audit persistant de l'intelligence

8 septembre 2026. Puits serveur livré, testé avec PGlite et les façades existantes. Aucun modèle réel appelé, agent activé, nouveau endpoint, écran, dépendance ou redémarrage de la démo. La composition du chat reste à effectuer.

## Choix et réutilisation

`MusicContextBroker`, `CoreIntelligence`, `EnvironmentIntelligence` et `ProviderRouter` avaient déjà des callbacks obligatoires dont l'échec bloque l'opération. `createPersistentIntelligenceAudit(database, authenticatedScope)` les implémente sans remplacer ces composants :

| Callback | Événements existants |
| --- | --- |
| `sink.context` | Recherche structurée musicale : ATTEMPT / SUCCEEDED / DENIED |
| `sink.intelligence` | Tentative d'inférence et résultat, sans contexte d'environnement |
| `sink.environment` | Même tentative, enrichie du profil/agent/environnement |

`@ida/contracts/intelligence-audit` définit les schémas stricts et types réexportés aux anciens emplacements pour conserver les imports existants. Les codes d'erreur sont partagés avec le routeur, sans liste concurrente. Les signatures des callbacks ne changent pas.

La table dédiée `intelligence_audit_events` évite d'élargir `activity_logs` (payload JSON libre et flux d'activité UI) ou `identity_security_events` (événements d'identité). Elle ne duplique pas leur contenu et n'apparaît pas dans le journal quotidien. L'initialisation locale crée table/index/gardes dans une transaction additive ; une réouverture ne réécrit aucun événement.

## Données conservées

Colonnes communes : id séquentiel et timestamp UTC générés par la base, workspace/utilisateur/session/appareil, famille CONTEXT ou INFERENCE, UUID du run, tentative, résultat contrôlé et empreinte de comparaison.

- Contexte : environnement music, agent_music_librarian, intention SEARCH_TRACK/SEARCH_MEDIA et classe fixe PRIVATE_CREATIVE. Pas de snapshot, filtre de recherche, id de ressource, titre ni version de profil dans le callback contexte actuel.
- Inférence : provider, modèle, localité, version de manifeste, finalité, classes de données et coût **estimé** ; environnement/agent/version de profil présents ensemble, ou tous absents.
- Jamais de prompt, sortie générée, URL d'endpoint, clé/token/digest de session, erreur brute/cause, pensée interne, caption, filename, contenu ou payload libre. Un champ supplémentaire invalide tout l'événement avant SQL. SECRET, classes dupliquées, URLs de modèles, valeurs hors limites et métadonnées partielles sont refusées.

Les identifiants provider/modèle/version proviennent des manifestes serveur revus, pas d'un texte utilisateur. Leur syntaxe ne permet pas de détecter un secret volontairement encodé dans un identifiant : aucune route cliente ne doit les alimenter librement.

L'empreinte SHA-256 ne porte que sur la projection contrôlée de l'événement. Elle permet de comparer les retries, **pas** de signer le journal ou de prouver son inviolabilité. Ce n'est jamais un hash d'un prompt ou d'une donnée créative.

## Autorité et refus après révocation

Le puits capture une copie immuable du scope **déjà authentifié côté serveur**. Chaque callback doit correspondre exactement à ses quatre composantes. Le constructeur ne fait pas de login ; ne pas lui passer de scope choisi par le navigateur ni l'exposer à un agent.

Une garde SQL vérifie les relations persistées session/utilisateur/appareil/workspace, membership et grant, et l'existence d'une session LOCAL_LOCK. Elle refuse LOCAL_DEMO. Elle n'exige pas des statuts encore ACTIVE : un résultat historique DENIED/FORBIDDEN doit pouvoir être enregistré après révocation/expiration. Cette capacité d'écriture du journal ne donne aucune permission métier ; le broker et le routeur rechargent toujours l'autorité avant appel et restitution. Les suppressions physiques futures de relations d'identité devront traiter explicitement la rétention du journal.

## Append-only et reprise d'écriture

Les opérations ordinaires SQL UPDATE, DELETE et TRUNCATE sont refusées par des triggers ; rien n'est supprimé ou remplacé par le puits. Ce n'est **pas** une protection contre un propriétaire de base qui désactive les triggers, un disque modifié ou un compte OS compromis. Le runtime local détient encore des privilèges élevés ; séparation de rôles et stockage d'audit durci restent nécessaires avant exposition réseau.

Clé d'idempotence : workspace + famille + run + tentative + résultat. Un retry identique, même concurrent, réussit sans nouvelle ligne et conserve id/timestamp initiaux ; un contenu contradictoire pour cette clé échoue avec AUDIT_UNAVAILABLE. Les classes sont triées pour leur comparaison. Les séquences peuvent avoir des trous après conflit : ce ne sont pas des numéros de demandes.

Les séquences `ATTEMPT → SUCCEEDED → DENIED` et `ATTEMPT → SUCCEEDED → FORBIDDEN` sont valides : SUCCEEDED constate le calcul validé, **pas** forcément la livraison. Une révocation pendant cet audit peut ensuite interdire la restitution. Le journal conserve chaque événement, sans prétendre vérifier exhaustivement une machine à états ou toutes les transitions métier.

L'indisponibilité du puits remonte uniquement AUDIT_UNAVAILABLE, sans erreur SQL brute. Avant tentative, cela bloque la lecture/l'appel ; après calcul, cela bloque la restitution. Si la base est inaccessible, elle ne peut évidemment pas conserver elle-même la preuve de cette panne : une supervision expurgée indépendante reste future.

## Limites et rétention

Ce journal persiste les callbacks actuels, pas toutes les requêtes HTTP. Une entrée invalide ou un refus avant sélection de fournisseur peut n'émettre aucun callback ; un refus après ATTEMPT mais avant réservation peut laisser cette seule ligne. ATTEMPT ne prouve donc pas un appel réseau. Ne pas additionner les estimations sur toutes les lignes pour calculer une facture : il n'y a ni mesure d'usage fournisseur ni comptabilité de crédits.

Contexte et inférence conservent leurs UUID de run distincts : aucune corrélation de workflow de bout en bout n'est encore revendiquée. Pas de route de lecture/export de cette table ; toute future consultation doit passer par Identity/Gateway et un filtre de workspace serveur.

Les identifiants liés au compte sont des métadonnées personnelles. La tranche locale conserve les événements jusqu'à une maintenance explicitement autorisée ; **aucune purge automatique ni promesse de conservation réglementaire**. Avant usage réel partagé : décider durée, quotas disque, rotation/archivage, procédure de suppression contrôlée, sauvegarde/restauration et accès d'administration, en conciliant traçabilité et minimisation. L'append-only ne doit pas devenir un prétexte à une conservation illimitée de production.

## Vérification et suite

Suite complète finale : **731 tests / 39 fichiers**, dont **81 nouveaux** (40 callbacks/composition, 41 persistance/SQL), 177,05 s. Lint global, types et builds contracts/domain/API/web réussis. Le premier passage complet avait révélé une fixture de migration Identity antérieure devenue incomplète : elle supprime désormais aussi la table d'audit dans sa base temporaire avant de tester la migration et vérifie sa recréation. Après cette correction, neuf tests Identity ciblés puis la suite entière ont été relancés avec succès.

Tests sur bases synthétiques : callbacks Core/environnement/contexte, champs privés absents, validation stricte, scope falsifié, erreurs expurgées, retries concurrents/contradictoires, garde SQL des relations/formes, impossibilité de modifier/supprimer/vider, réouverture réelle sur disque et audit des refus après révocation. Les adaptateurs d'inférence sont fictifs : aucun accès à Ollama ou au cloud dans ces tests.

Suite livrée le 8 septembre : [parcours musical composé](MUSIC_PROPOSALS.md), validation structurée des références avant `SUCCEEDED`, contrôles de contexte transactionnels et vraie composition de ce puits sur base de test. Restent évaluation du nouveau prompt et parcours opt-in/arrêt. Ne pas activer un profil du seul fait que l'audit est disponible. Le score historique 4/6 du modèle local n'est pas changé par ces tests logiciels.
