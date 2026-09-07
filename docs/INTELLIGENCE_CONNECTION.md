# IDA — Fondation multi-intelligences

Statut : 7 septembre 2026. Fondation exécutable et testée avec réponses synthétiques ; **aucun modèle connecté à la démo**. Domotique/Home Assistant et tranche dates de release en pause, changements conservés.

## Analyse et réutilisation

Extension du même jour : profils par environnement et listes de modèles/localisations autorisés livrés dans [ENVIRONMENT_BRAINS.md](ENVIRONMENT_BRAINS.md). La façade `EnvironmentIntelligence` utilise le même registre et le même Core ; aucun provider réseau n'est activé par cette extension.

`AI_PROVIDERS.md` et `PRIVACY.md` définissaient déjà le Provider Registry, les modes NORMAL/AI, le local-first et l'egress contrôlé. Aucun registre ou routeur LLM concret n'existait. Le Core déterministe, l'Agent Registry, les manifestes, les permissions et l'identité étaient déjà implémentés : ils sont conservés.

Le chemin interne est maintenant :

```text
DeterministicIdaCore.generateProposal
  → IntelligencePort / CoreIntelligence
  → IdentityAccessPolicy + ToolGateway + autorité de policy fraîche
  → ProviderRegistry → ProviderRouter → sélection de modèle
  → IntelligenceAdapter → OpenAI Responses | Ollama | futur adaptateur
  → transport serveur à raccorder → API officielle / moteur local
```

Le chat déterministe actuel ne redirige pas implicitement une commande inconnue vers un LLM. Le constructeur du Core accepte un quatrième argument optionnel `IntelligencePort` ; la composition actuelle ne le fournit pas. Un appel de proposition sans ce branchement est refusé. Aucun second Core, nouveau registre d'agents, migration ou dépendance n'est ajouté.

## Fichiers et contrats livrés

| Fichier | Responsabilité |
| --- | --- |
| `packages/contracts/src/intelligence.ts` | Schémas stricts de manifeste LLM, état, requête interne, classification, scope, consentement et policy ; export `@ida/contracts/intelligence` |
| `packages/domain/src/provider-registry.ts` | Enregistrement statique validé, désactivation par défaut, snapshots copiés, configuration serveur, réservation atomique d'appels et invalidation |
| `packages/domain/src/provider-router.ts` | Port commun, filtres, choix déterministe de modèle, fallback borné, annulation, audit expurgé et validation de résultat |
| `apps/api/src/core-intelligence.ts` | Façade réutilisant Identity/Tool Gateway ; port obligatoire de relecture de l'autorité serveur |
| `apps/api/src/ida-core.ts` | Extension minimale du Core existant : `generateProposal`, sans modification des commandes actuelles |
| `apps/api/src/ai-adapters.ts` | Adaptateurs OpenAI Responses et Ollama, sérialisation officielle et validation des réponses ; transport JSON injecté |

Trois fichiers de tests couvrent les contrats à travers les frontières réelles : `provider-router.test.ts`, `core-intelligence.test.ts`, `ai-adapters.test.ts`. Les tests du Core ouvrent une base en mémoire dédiée, pas les données de la démo.

Vérification : baseline 290 tests réussis avant modification ; suite complète après ajout **390 tests / 29 fichiers**, 202,70 s. Les 100 nouveaux tests ciblés passent également séparément. Lint global sans avertissement, types contracts/domain/API/web et builds contracts/domain/API/web réussis. Pas de recette d'un modèle réel ou d'un appareil physique ; les réponses d'inférence sont synthétiques.

L'export de contrats séparé évite de mélanger cette tranche avec les changements de dates déjà en attente dans `contracts/src/index.ts`. Les routes et contrats HTTP existants ne changent pas ; aucun body client ne peut fournir une policy, un secret, une destination ou un manifeste exécutable.

## Fonctionnement réel de la fondation

- Modes : `NORMAL` bloque toute inférence ; `AI` ne suffit pas à autoriser un fournisseur.
- Éligibilité : allowlist serveur, provider activé/configuré/READY et non périmé, rétention déclarée connue, classes acceptées, allocation restante, modèle compatible avec capacités/complexité/tailles/coût/latence. Une donnée `SECRET` est interdite à tous les modèles.
- Classement : local-first si demandé, préférence utilisateur autorisée, adéquation de complexité, coût puis latence ; départage stable par clés. Ces préférences sont des valeurs de policy serveur, pas encore des réglages persistants d'interface.
- Cloud : consentement explicite et non expiré pour ce provider, cette finalité, toutes les classes et ce scope complet. Une permission d'appareil n'est pas un consentement d'egress.
- Fallback : un appel maximum par fournisseur et trois au total, mêmes contraintes à chaque tentative. Pas de contournement d'un refus ni de nouvelle tentative après timeout ambigu. Coût estimé des tentatives échouées conservé dans l'enveloppe.
- Quota : allocation serveur en appels, partagée par les requêtes utilisant le même registre en mémoire. Réservation synchrone avant l'appel ; pas de remboursement automatique ni double consommation du dernier slot.
- Audit : `runId` généré côté serveur, scope, finalité, version/provider/modèle, classes, numéro de tentative, estimation et résultat contrôlé. Aucun prompt, sortie générée, pensée interne, clé, corps d'erreur ou URL dans ces événements. Le puits d'audit est requis et son échec bloque l'appel ou la livraison.
- Permissions : relecture de l'identité avant tentative, après audit et avant livraison ; session expirée/révoquée, membership, grant et instance sont recontrôlés. La façade refuse un autre scope et requiert l'outil READ `generate_intelligence_proposal` explicitement allowlisté. READ autorise seulement une proposition, jamais sa publication.
- Résultat : `{ text }` borné, sans champ supplémentaire. Aucune exécution de tool call, mémoire permanente, SQL, automatisation ou publication. Un texte qui demande une action reste du texte non fiable.

L'audit `SUCCEEDED` constate la génération validée, pas une publication ni nécessairement la livraison : une révocation survenue pendant l'audit entraîne ensuite un refus. La reconfiguration d'un provider interrompt immédiatement son signal ; les réponses tardives sont abandonnées même si un transport ignore l'annulation. Le transport reste responsable de libérer réellement sockets/processus. L'annulation ne garantit pas l'absence de facturation distante.

## Ce qui n'est pas encore connecté

1. Transport HTTP effectif, coffre/résolution des clés et configuration de déploiement. Les adaptateurs ne lisent aucune variable d'environnement et n'ouvrent aucun socket.
2. Modèle local installé, capacité matérielle, contrôle d'egress local, découverte/health checks et évaluation de qualité. Une étiquette LOCAL ne prouve pas à elle seule l'absence d'envoi externe.
3. Accès API OpenAI du compte, quotas/tarifs réels et politique de rétention du projet. `store:false` ne constitue pas une garantie de zéro rétention côté fournisseur.
4. Persistance des réglages, consentements, allocation de coût, audit append-only et liaison à la source d'identité actuelle. `IntelligenceAccessSource.loadCurrent` doit recharger les données d'autorité ; ne jamais renvoyer uniquement le snapshot HTTP d'origine.
5. Context Broker minimal, filtrage/classification de provenance, prompts versionnés et évaluations d'un premier agent. La classification doit être attribuée par le serveur, pas crue sur parole dans un prompt. Le contrat ne prétend pas détecter automatiquement tous les secrets contenus dans du texte libre.
6. Parcours utilisateur d'activation/arrêt et signal d'annulation global lié au mode AI, puis branchement explicite du chat aux propositions. Les agents existants restent dans leur état PLANNED.

Les budgets présents sont des **enveloppes de routage estimées par requête**, pas un plafond bancaire ou une comptabilité fournisseur. Les allocations en mémoire ne survivent pas au redémarrage et ne couvrent pas plusieurs processus. Avant usage payant partagé : réservation persistante/atomique par workspace, plafond global, usage réel et rapprochement. Latence/coût sont aujourd'hui des métadonnées revues, pas une télémétrie automatiquement mesurée. Les futures contraintes réseau et de capteurs restent inchangées.

## Prochain branchement, sans changer les agents

### OpenAI / Astra

La [documentation officielle GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) indique l'identifiant `gpt-6-astra`. L'adaptateur utilise [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create) : modèle configurable, entrée texte, limite de sortie, `store:false`, aucune conversation distante réutilisée et aucun outil exposé. Disponibilité effective et droit d'accès du compte restent à vérifier.

Prochaine tranche : transporter uniquement vers `https://api.openai.com/v1/responses`, sans redirection ni URL issue du client ; résoudre une clé API dans le coffre serveur et injecter l'authentification au niveau transport, jamais dans `IntelligenceRequest`. Borner taille/temps de réponse et masquer systématiquement erreurs/en-têtes sensibles. Revoir rétention, coûts, budget et consentement ; effectuer ensuite un test explicite avec texte synthétique, plafond choisi et accord utilisateur. Astra est un modèle de l'adaptateur OpenAI, pas un fournisseur/Core parallèle.

### Modèle local

L'adaptateur utilise le [chat officiel Ollama](https://docs.ollama.com/api/chat) sans streaming, avec sortie bornée, aucun outil et libération demandée du modèle via `keep_alive:0`. Il ne lance pas Ollama, ne télécharge rien et n'utilise pas son service cloud.

Prochaine tranche : choisir un modèle réellement installé et évalué sur le PC, confirmer le runtime et une destination loopback fixe, refuser redirections/proxy/accès cloud et noms de modèles distants, vérifier l'egress du runtime, puis injecter ce transport local. Déclarer capacités, limites matérielles et estimations honnêtes dans le manifeste. Aucun modèle n'est supposé disponible maintenant. Un moteur différent peut implémenter `IntelligenceAdapter` sans modifier les agents.

### Ordre d'activation

1. Configuration et transports serveur revus, secrets protégés, tests sans réseau.
2. Relecture Identity/policy, Context Broker minimal, audit persistant et budget commun.
3. Test local synthétique puis test cloud expressément consenti et borné.
4. Un premier agent versionné via `IntelligencePort`, parcours de validation et évaluations.
5. Connexion du chat existant, réglages et statut factuel ; conserver le parcours NORMAL.

Sources officielles consultées le 7 septembre 2026. Aucun scraping d'interface web ni appel à un modèle n'a été effectué pour construire cette fondation.
