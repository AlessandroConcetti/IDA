# IDA — Un cerveau spécialisé par environnement

Décision du 7 septembre 2026. Chaque environnement possède un profil d'intelligence et ses responsabilités d'agents, mais aucun nouveau Core ni serveur d'inférence dédié n'est nécessaire. Plusieurs profils peuvent partager le même modèle, ou sélectionner des modèles différents dans le même fournisseur.

## Livré, sans activation

Les douze clés de la Roue existante ont un profil serveur versionné dans `listEnvironmentBrainProfiles()`. Le test d'architecture vérifie la correspondance exacte avec `apps/web/src/worlds.ts`, sans reconstruire l'interface ni transformer ses cartes en autorisations.

| Environnement | Responsabilités prévues |
| --- | --- |
| Music Studio | Music Librarian, direction artistique, préparation des releases |
| Content Studio | Content Curator, Copywriter, gestion de contenus |
| Social Hub | Social Manager, calendrier, campagnes, analytics |
| Workspace | Coordination des missions, mémoire |
| IDA Home | Tâches domestiques, courses, Home Safety Steward |
| Finance | Budget en lecture seule, gouvernance des données financières |
| Travel | Planification de voyages, suivi des réservations |
| Research | Recherche et vérification des sources |
| Admin | Documents et démarches |
| Legal | Recherche et escalade vers un juriste |
| Health | Organisation du suivi, escalade vers un soignant |
| IDACAR | Suivi d'entretien et organisation des trajets |

Ces rôles sont des **prévisions**, pas des agents exécutables. Seuls les deux manifestes existants, Music Librarian et Memory Manager, sont référencés lorsque pertinents ; ils restent `PLANNED`. Les profils restent eux aussi `PLANNED`, sans modèle autorisé, budget API nul et `LOCAL_ONLY`. Une carte, un profil actif ou un modèle disponible ne peut activer implicitement un agent.

## Architecture et contraintes exécutées

```text
Roue / environnement choisi (navigation, pas permission)
    → IDA Core existant
    → EnvironmentIntelligence : profil serveur + agent + contexte déclaré
    → CoreIntelligence : identité fraîche + Tool Gateway
    → ProviderRouter partagé : fournisseur ET modèle exact
    → adaptateur commun → moteur d'inférence
```

Le « cerveau » est un ensemble cohérent : profil, prompts versionnés, agents, connaissances autorisées, mémoire consentie, outils contrôlés et modèles interchangeables. Ce n'est pas nécessairement un modèle entraîné séparément ni douze modèles simultanément chargés en RAM.

Fichiers concernés :

- `packages/contracts/src/environment-brains.ts` : clés, profils stricts et invocation environnement/agent ; export `@ida/contracts/environment-brains`.
- `packages/domain/src/environment-brains.ts` : plans des profils et intersection des contraintes.
- `apps/api/src/environment-intelligence.ts` : façade implémentant le même `IntelligencePort`, relecture du profil par scope et audit environnement/agent/version.
- `packages/contracts/src/intelligence.ts` et `packages/domain/src/provider-router.ts` : restrictions optionnelles `allowedModels` et `allowedLocalities`, réappliquées à la sélection, avant appel et avant livraison. Absence préserve le contrat précédent ; liste vide refuse tout.

Le périmètre d'identité reste utilisateur/workspace/session/instance. `environmentKey = workspace` désigne le monde Workspace ; il ne remplace jamais `workspaceId`. Le profil est chargé par une autorité serveur liée au scope, jamais depuis une préférence navigateur non vérifiée.

Contexte autorisé = sources déclarées pour cette invocation ∩ sources du profil ∩ sources du manifeste de l'agent, avec identité/workspace valides. Un agent doit être ACTIVE, référencé par ce profil, compatible avec l'intention. Version différente, environnement différent, source interdite ou classe refusée bloquent l'appel. La même vérification rejette une réponse tardive si le profil, l'identité ou ses restrictions sont révoqués.

Les modèles sont filtrés par couple exact `providerKey/modelId` ; un profil musical et un profil maison peuvent utiliser deux modèles dans le même Ollama sans créer deux providers artificiels ni deux réserves de quota. L'instance de `ProviderRegistry` est partagée, jamais recréée par environnement.

`LOCAL_ONLY` impose localisation locale, aucun consentement cloud et budget API nul, même si un cloud consenti annonce un coût estimé de zéro. `LOCAL_FIRST` peut seulement conserver les consentements et plafonds déjà accordés par la policy serveur ; il n'accorde pas de gratuité ni d'accès supplémentaire. Aucun quota n'est contourné par rotation de comptes.

## Nourrir le cerveau, sans prétendre entraîner un LLM

Première cible : enrichissement documentaire contrôlé. Import choisi → validation/provenance/classe → rattachement workspace/environnement → recherche des extraits nécessaires → contexte limité pour l'agent. Les préférences durables gardent le cycle PENDING/CONFIRMED/REJECTED existant. Lire une conversation ne vaut ni consentement à la mémoriser ni consentement à l'envoyer dans un entraînement.

`CONFIRMED_ONLY` et `HUMAN_REVIEWED` restent les seules politiques de mémoire et d'amélioration déclarables. Le [Context Broker musical](MUSIC_CONTEXT.md) livre désormais deux projections SQL bornées/isolées, sans charger la mémoire. Composition avec l'inférence et validation de fraîcheur des ressources restent à faire ; les textes libres demeurent non fiables, sans détection garantie de secrets.

Pour s'améliorer, IDA pourra proposer un changement de prompt, une connaissance ou un nouvel agent. Le cycle prévu est proposition → validation humaine → tests d'évaluation → version activée → retour arrière possible. Pas d'auto-réécriture ou d'auto-déploiement du Core, de ses permissions, ni de ses modèles en production.

L'entraînement depuis zéro n'est pas retenu pour cette démo personnelle. Un fine-tuning ou adaptateur de poids spécialisé pourra être évalué après un corpus licite et consenti, une mesure de qualité et un budget explicite. Il est distinct de la mémoire/recherche documentaire ; aucune promesse d'équivalence générale aux plus grands modèles cloud n'est faite.

## Fournisseurs gratuits : constat actuel

Sources officielles consultées le 7 septembre 2026. L'accès réel dépend du compte, du pays, du modèle et des conditions au moment de l'activation. Aucun compte externe inspecté, crédit acheté, API appelée ou modèle téléchargé ici.

| Option | Conséquence pour IDA |
| --- | --- |
| Modèle provenant de Hugging Face, exécuté localement | Option prioritaire pour éviter la facturation API ; coût matériel/électricité et limites de performance subsistent. Respecter la licence propre à chaque modèle, pas seulement celle du runtime. [Licences du Hub](https://huggingface.co/docs/hub/repositories-licenses) |
| Hugging Face Inference Providers | Le cloud inclut de petits crédits mensuels, pas un service illimité : la documentation indique 0,10 USD/mois pour un compte gratuit, montant susceptible de changer. Au-delà, crédits payants requis. [Tarification](https://huggingface.co/docs/inference-providers/pricing) |
| Gemini API | Certains modèles ont un palier gratuit, sous limites. Les conditions exigent un service payant pour rendre des clients API disponibles à des utilisateurs dans l'EEE, en Suisse ou au Royaume-Uni ; ce point doit être vérifié pour IDA en France avant tout déploiement. La règle d'utilisation des données gratuites comporte également une exception EEE/Suisse/Royaume-Uni : ne pas généraliser « toutes les données gratuites entraînent le modèle ». [Prix](https://ai.google.dev/gemini-api/docs/pricing), [conditions](https://ai.google.dev/gemini-api/terms) |
| OpenAI / Astra | API avec tarification d'usage ; aucun crédit API gratuit permanent n'est supposé. Utiliser seulement l'API officielle via l'adaptateur, pas la session web ChatGPT. [Prix API](https://developers.openai.com/api/docs/pricing) |
| Claude / Grok | API d'usage facturée ; ne pas supposer que leurs chats gratuits financent IDA. Crédit promotionnel éventuel à vérifier sur le compte. [Facturation Claude](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage), [prix Grok](https://docs.x.ai/developers/models) |
| Copilot | Le SDK officiel dispose d'authentification et de suivi des quotas/coûts, mais aucun accès gratuit illimité n'est garanti pour IDA. Ne pas confondre avec GitHub Models : ce service séparé a été retiré le 30 juillet 2026, malgré d'anciens résultats de recherche indiquant un palier gratuit. [Authentification SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth), [usage et facturation](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing), [retrait de GitHub Models](https://docs.github.com/en/github-models) |

La spécialisation s'évalue sur les tâches d'IDA : recherche de morceaux, captions françaises, citations fidèles, réponses incertaines explicites, résistance aux instructions importées et propositions conformes aux schémas. Un modèle gratuit insuffisant doit produire une limite claire ou un parcours manuel, pas une bascule payante silencieuse.

## Suite concrète

Point d'étape du 8 septembre : matériel vérifié, Ollama installé et premier modèle Qwen3 4B téléchargé pour une évaluation synthétique. Le transport impose maintenant la fenêtre de contexte côté serveur. [Résultats réels et limites du pilote](LOCAL_MODEL_EVALUATION.md). Aucun profil n'est activé par cette étape ; les jalons ci-dessous décrivent toujours le passage à un usage métier, pas une autorisation déduite de l'installation.

1. Confirmer VRAM disponible, runtime local et espace disque ; choisir un seul modèle de petite taille à évaluer avant tout téléchargement. Vérifier dépôt, révision, licence et format ; ne pas exécuter de code distant non revu.
2. Raccorder le transport local sécurisé décrit dans `INTELLIGENCE_CONNECTION.md`, sans cloud ou capteur implicite.
3. Composer le Context Broker musical livré, la validation des ressources à l'envoi, les prompts versionnés et les évaluations d'un premier agent Music Studio. `getProfile` est une lecture synchrone de l'autorité runtime après Identity, pas un chargeur asynchrone ni un cache périmé. Tester d'abord des données synthétiques, puis des documents explicitement choisis.
4. Activer ce profil uniquement après validation, avec status réel et parcours de proposition dans le chat existant. Persister réglages/consentements/budgets/audit et prévoir un arrêt immédiat.
5. Étendre aux agents Content et Social ; conserver la validation humaine. Ajouter chaque autre domaine à son jalon, avec gouvernance et professionnel d'escalade si pertinent. Une connaissance d'un environnement n'est partagée avec un autre que par une règle serveur explicite.
6. Évaluer ensuite un cloud officiellement éligible, si l'utilisateur le souhaite, avec consentement d'egress par environnement et budget réel. Ne pas utiliser la classification/requête d'un navigateur comme autorité.

Vérification : **442 tests / 32 fichiers**, dont **52 nouveaux** pour profils, modèles et façade environnement ; types, builds contracts/domain/API/web et lint global validés. Aucun changement de données, d'apparence, de route HTTP ni de dépendance. La démo reste déterministe ; ces profils ne sont pas encore présentés comme des agents actifs dans l'interface.
