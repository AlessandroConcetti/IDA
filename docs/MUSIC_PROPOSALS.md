# IDA — Premier parcours de proposition musicale

8 septembre 2026. Parcours serveur composé et testé de bout en bout sur une base synthétique. **Non branché au chat, aucun modèle réel activé**. Le Core, les profils et les deux agents livrés restent inchangés et `PLANNED` par défaut.

## Ce qui fonctionne

Une recherche structurée `SEARCH_TRACK` ou `SEARCH_MEDIA` traverse le broker musical, l'identité locale persistée, le Tool Gateway, le profil/agent, le routeur et l'audit append-only. Elle renvoie les faits de la base, éventuellement réordonnés, avec un message français déterministe. Aucune création de post, mémoire, publication ou analyse du contenu binaire.

| Composant | Rôle |
| --- | --- |
| `packages/contracts/src/music-proposal.ts` | Sous-export `@ida/contracts/music-proposal` : réponse de classement strictement bornée |
| `apps/api/src/music-proposal.ts` | Service `propose(scope, query, signal?)`, prompt `music-librarian-ranking.fr.v1`, validation des références et résultat `music-proposal.v1` |
| `apps/api/src/local-music-proposal.ts` | Composition prête à injecter : vraie source d'identité, projection SQL, autorité agrégée et audit persistant |
| `apps/api/src/local-music-context-authority.ts` | Lecture cohérente identité/faits dans une transaction brève `REPEATABLE READ, READ ONLY` |
| `apps/api/src/music-context.ts` | `prepare` ferme la requête, les faits et le scope dans une autorité non falsifiable par un snapshot client |
| `ProviderRouter`, `CoreIntelligence`, `EnvironmentIntelligence` | Réutilisés ; validation métier synchrone facultative `acceptOutput` avant l'audit de succès |

La factory `createLocalMusicProposalService` exige un `authenticatedScope` issu de l'authentification serveur, un registre, des agents, le Gateway et des autorités runtime synchrones `getPolicy`/`getProfile`. Elle n'effectue pas de login, n'active aucun provider/profil et n'accepte pas de configuration libre du navigateur. Aucun nouvel endpoint ou écran n'est exposé.

## Périmètre et économie d'appels

- Recherche vide : `NOT_FOUND`, `EMPTY_CONTEXT`, message limité aux filtres et au catalogue accessible, zéro inférence.
- Une seule piste : `FOUND`, `CATALOG_ORDER`, zéro inférence.
- Médias : ordre déterministe du catalogue, `CATALOG_ORDER`, zéro inférence. Les champs actuellement disponibles ne permettent ni choix sémantique d'une vidéo de studio, ni analyse de sa qualité ou de ses performances.
- Plusieurs pistes : proposition de regroupement des versions d'un même titre/artiste, via le port commun d'intelligence ; `MODEL_PROPOSAL`. Ce classement n'est pas une stratégie éditoriale, une analyse audio ou une garantie de pertinence.

Les limites et filtres restent ceux de [MUSIC_CONTEXT.md](MUSIC_CONTEXT.md) : au plus dix résultats, une seule source, pas de requête libre/prompt fourni par le client. Le résultat n'est pas présenté comme l'intégralité du catalogue. `UNUSED` reste un statut, pas la preuve qu'un média n'a jamais été publié.

## Ce que le modèle reçoit et peut proposer

Le prompt ne contient que l'intention, des références éphémères `R1`…`R10`, les titres et crédits artistes nécessaires au regroupement. Les IDs métier, scope, timestamps, descriptions, captions, URLs, fichiers, mémoire et secrets de configuration sont exclus par projection positive. La classification reste `PRIVATE_CREATIVE` : les alias ne rendent pas les titres anonymes ni publics. Un secret saisi par erreur dans un titre reste possible ; cette projection n'est pas un détecteur de secrets.

Seule sortie acceptée : `{"orderedRefs":["R2","R1"]}` avec **toutes** les références du contexte exactement une fois. ID réel, référence étrangère, doublon, omission, champ supplémentaire, prose, code fence ou réponse trop longue sont refusés. Le modèle ne peut ni ajouter un résultat ni en supprimer un ni changer les faits. L'ordre reste une proposition non certifiée : une injection dans un titre peut encore influencer cet ordre, mais n'obtient pas de canal d'action ou de texte libre affiché.

Le serveur produit le message français et renvoie les fiches stockées dans la base. Les titres restent des données non fiables à afficher comme texte, jamais HTML ou Markdown exécutable lors du futur branchement UI. Le service n'affirme pas que ces informations saisies/importées sont vraies dans le monde réel.

`acceptOutput` est un validateur de confiance, synchrone et sans effet, injecté par le serveur. Seul le booléen primitif `true` est accepté ; exception ou Promise accidentelle sont refusées, sans rejet non géré pour une Promise native. La copie fournie au callback ne peut pas transformer le résultat du Router. Un refus produit `INVALID_RESPONSE`, jamais de fallback ni de `SUCCEEDED`. Les anciens appels sans ce validateur conservent leur contrat texte et leurs contrôles d'accès.

## Fraîcheur et autorisations

`MusicContextBroker.prepare` effectue d'abord la lecture auditée existante. Une copie privée du snapshot est conservée dans une fermeture ; modifier le snapshot rendu ne modifie pas cette référence. La source d'accès ainsi produite :

1. refuse tout autre utilisateur, workspace, session ou appareil avant SQL ;
2. revalide les droits de lecture actuels avant de demander les faits ;
3. charge identité et sélection dans **le même snapshot SQL**, puis compare toute la projection, IDs, ordre et `updatedAt` compris ;
4. vérifie sans nouvel `await` l'identité agrégée, la policy runtime courante, le profil, sa version, l'agent et ses sources/outils.

Ce contrôle est réutilisé par le Router avant la sélection, après l'audit ATTEMPT avant envoi, après le calcul et après l'audit de succès avant restitution. Il s'applique aussi au fallback. Une édition même sans changement de timestamp, une archive, un résultat évincé par la limite ou un changement de droits observé bloque l'opération ; le service ne substitue pas silencieusement un autre contexte.

`LocalMusicContextAuthority` réutilise le résolveur Identity et la projection SQL existants avec le même lecteur transactionnel. La transaction est en lecture seule, n'inclut aucun audit/appel réseau et ne prolonge pas la session. `LOCAL_DEMO` est refusé ; READ reste READ, y compris pour un appareil VIEW_ONLY. La policy runtime est relue après la transaction et le profil après cette attente.

**Limite explicite :** cohérence du snapshot ne signifie pas transaction globale base/réseau. Une modification après le dernier snapshot, entre sa validation et l'envoi, ne peut pas être retirée rétroactivement d'un prompt déjà transmis. Les relectures ultérieures bloquent la livraison si elles constatent le changement. Un futur système multi-processus/persistant doit maintenir une autorité agrégée/versionnée ; ne pas revenir à des lectures séparées faits → identité → faits en prétendant obtenir l'atomicité. Aucun verrou SQL n'est conservé pendant l'inférence.

## Audit, vérification et suite

La composition utilise les callbacks existants du [puits persistant](INTELLIGENCE_AUDIT.md), sans payload créatif ni nouvelle table. Une réponse invalide est journalisée `INVALID_RESPONSE` avant tout succès ; une révocation SQL pendant l'inférence produit `FORBIDDEN`. `SUCCEEDED` n'est toujours pas une preuve de livraison. Les refus avant sélection et les chemins sans inférence conservent les limites de couverture documentées ; les UUID contexte/inférence ne sont pas encore corrélés en workflow global.

Tests principaux : `music-proposal.test.ts` (sorties adversariales, économie d'appels, audit, mutations/fallback/droits), `local-music-proposal.test.ts` (vraie composition PGlite, session locale et audit), `local-music-context-authority.test.ts` (transaction, isolation, sessions, lecture seule), tests `MusicContextBroker.prepare` et `ProviderRouter.acceptOutput`. Tous les adaptateurs de cette tranche sont synthétiques ; aucune mesure de qualité du modèle local n'en découle.

Vérification complète : **825 tests / 42 fichiers**, soit **94 nouveaux**, en 174,61 s. Lint global, types et builds des quatre packages/apps réussis. La revue indépendante a fait remplacer les lectures séparées identité/faits par l'autorité transactionnelle et a détecté une mutation possible du scope de configuration ; corrigée puis retestée. Aucun test désactivé, aucun téléchargement ni nouvelle dépendance.

Recette ciblée depuis le dépôt avec les dépendances déjà installées : lancer Vitest sur `apps/api/src/local-music-proposal.test.ts` pour les scénarios complets, ou la suite complète habituelle. Ne pas remplacer le provider synthétique de ces tests par Ollama : les tests ordinaires ne démarrent jamais de modèle.

Suite réalisée : [évaluation réelle de ce classement](MUSIC_PROPOSAL_EVALUATION.md), **1/3** classements corrects malgré **3/3** jeux de références valides. Ce résultat n'est pas le score historique 4/6 de l'ancien banc. Le pilote reste non qualifié et hors du chat : clarifier la priorité de regroupement, élargir les scénarios puis réévaluer avant parcours d'activation/arrêt et rendu texte des fiches. Conserver le mode NORMAL. Pas d'activation cloud, de réseau distant, de capteur ou de publication implicite.
