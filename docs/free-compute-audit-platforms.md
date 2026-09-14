# Audit des plateformes de calcul gratuit

Date de vérification documentaire : **2026-09-14**. Périmètre : Groq, Cerebras, OpenRouter, Cloudflare Workers AI et Hugging Face Inference Providers. Sources officielles recherchées puis ouvertes ; aucun compte, clé, appel d'inférence, abonnement, installation ou paiement créé. Les chiffres décrivent les offres publiques, **pas les droits effectifs d'un compte IDA**. `UNKNOWN` signifie non établi par les pages ouvertes, jamais « illimité ».

RPM/RPD : requêtes par minute/jour. TPM/TPH/TPD : tokens par minute/heure/jour. Les limites simultanées ne s'additionnent pas : le premier plafond atteint bloque. Aucun plafond journalier n'est converti en promesse mensuelle.

## Synthèse d'éligibilité documentaire

| Plateforme | Nature de l'offre | Renouvellement | Paiement et arrêt |
| --- | --- | --- | --- |
| Groq | Free plan, quotas selon modèle [G1] | Limites journalières ; budget mensuel `UNKNOWN` | Upgrade Developer distinct avec moyen de paiement [G2] ; dépassement : 429 [G1]. Absence actuelle de CB obligatoire à l'inscription : `UNKNOWN` dans les pages ouvertes. |
| Cerebras | **Essai**, 5 $ [C1] | Aucun renouvellement gratuit ; expiration après 30 jours [C1] | Moyen de paiement vérifié obligatoire ; API inactive sinon. Arrêt à épuisement/expiration, reprise seulement après achat volontaire [C1]. |
| OpenRouter | Variantes gratuites, 0 $/token [O2] | 50 RPD et 20 RPM sans achat [O2] | Sans CB [O3]. Choisir exclusivement une variante gratuite ou le routeur gratuit [O1] ; dépassement : 429 [O4]. |
| Cloudflare Workers AI | Allocation du plan Workers Free [F1] | 10 000 neurones/jour, 00:00 UTC [F1] | Sans CB [F4]. Au-delà, erreur et upgrade nécessaire ; le plan Paid facture les dépassements [F1]. |
| Hugging Face Inference Providers | Crédit récurrent d'expérimentation [H1] | 0,10 $/mois, montant susceptible de changer [H1] | Usage au-delà des crédits conditionné à un achat [H1]. CB obligatoire pour le crédit initial : `UNKNOWN`. |

## Groq

API : base `https://api.groq.com/openai/v1`, clé Groq, compatibilité partielle avec les clients OpenAI [G3]. Le chemin de génération texte est `/chat/completions` [G4].

| Modèles explicitement présents dans la table Free ouverte [G1] | RPM | RPD | TPM | TPD |
| --- | ---: | ---: | ---: | ---: |
| `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b` | 30 | 1 000 | 8 000 | 200 000 |
| `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b` | 30 | 1 000 | 8 000 | 200 000 |

Ces plafonds s'appliquent à l'organisation ; des exceptions existent. Le compte doit être vérifié dans sa page Limits. Heure fixe de remise à zéro : `UNKNOWN` ; les réponses exposent des durées `x-ratelimit-reset-requests` et `x-ratelimit-reset-tokens`. Mensuel : `UNKNOWN` [G1].

La FAQ de facturation décrit une montée volontaire vers Developer exigeant un moyen de paiement ; elle ne prouve pas directement l'absence de CB obligatoire à toute inscription actuelle. Le Developer facture automatiquement son usage : ne pas l'assimiler au Free [G2]. L'ancienne FAQ communautaire « no credit card » est ressortie en recherche mais son ouverture redirige vers l'accueil Groq : elle n'est pas retenue comme preuve actuelle.

Entraînement : inputs/outputs exclus sauf permission ou instruction explicite du client. Usage professionnel et intégration dans une application autorisés sous contrat et licences des modèles ; le contrat précise que les services ne sont pas destinés à l'usage consommateur. Cela demande clarification avant de qualifier un usage purement personnel IDA [G5].

Conservation : pas de contenu d'inférence par défaut, exceptions fiabilité/abus jusqu'à 30 jours et obligations légales ; métadonnées toujours conservées. ZDR activable par les clients ; stockage du contenu conservé aux États-Unis. Batch et fine-tuning ont leurs propres règles, distinctes de l'inférence ordinaire [G6].

## Cerebras

API : `POST https://api.cerebras.ai/v1/chat/completions`, compte et clé API en `Authorization: Bearer` [C2].

| Offre publique actuelle [C1] | Modèles publics listés | RPM | TPM non cachés / total | TPH / TPD | RPD / mensuel |
| --- | --- | ---: | ---: | ---: | --- |
| Free Trial, 5 $, 30 jours | `gpt-oss-120b`, `qwen-3.8-27b` | 5 | 30 000 / 90 000 | 1 000 000 / 1 000 000 | `UNKNOWN` |

Le crédit exige un moyen de paiement vérifié. Aucun palier gratuit permanent : accès arrêté à épuisement ou expiration, pas de facturation avant achat volontaire. Les limites se reconstituent continuellement selon des réservoirs de tokens ; quota exact de l'organisation : `UNKNOWN` sans console [C1]. Les anciens résultats indexés « Free, 30 RPM, 14 400 RPD » sont remplacés par la page actuellement ouverte.

Entraînement/fine-tuning : le droit de traiter le contenu pour fournir le service ne les autorise pas. Les conditions des modèles tiers déterminent leurs droits ; interdiction de présenter une sortie comme humaine et de certaines sollicitations commerciales. Autorisation commerciale universelle de tous les modèles : `UNKNOWN` [C3]. La politique annonce ne pas conserver inputs/outputs ; durée chiffrée des autres logs : `UNKNOWN`, suppression lorsqu'ils ne sont plus nécessaires [C4].

## OpenRouter

API : `POST https://openrouter.ai/api/v1/chat/completions`, compte et clé API Bearer. `openrouter/free` sélectionne un modèle gratuit selon les capacités demandées ; c'est un **routeur**, pas un modèle stable [O1]. Exemple de modèle publié : `meta-llama/llama-3.3-70b-instruct:free` [O2]. Sa disponibilité effective lors d'un futur appel reste `UNKNOWN`.

| Gratuit sans achat [O2] | RPM | RPD | TPM / TPD / mensuel | Reset fixe |
| --- | ---: | ---: | --- | --- |
| Ensemble des modèles gratuits | 20 | 50 | `UNKNOWN` | `UNKNOWN` |

Le palier 1 000 RPD exige au moins 10 $ d'achat de crédits : il est exclu du scénario zéro paiement. Les requêtes gratuites échouées consomment aussi le quota [O2]. Aucune CB nécessaire pour l'offre gratuite ; aucune génération d'image gratuite annoncée dans la source ouverte [O3]. Les limites donnent une erreur 429 ; des fallbacks vers d'autres modèles peuvent être configurés [O4]. Pour IDA, proposition : liste blanche de slugs gratuits, aucun fallback payant, arrêt sur quota et catalogue revalidé. Cette proposition n'est pas activée.

OpenRouter ne conserve pas prompts/réponses sans opt-in ; il garde les métadonnées et réalise une catégorisation anonyme de certains prompts [O5]. Les pratiques d'entraînement et de conservation **du fournisseur final** dépendent de la route : `UNKNOWN` sans route fixée et politique vérifiée. Le contrat exige le respect des conditions de chaque modèle et ne garantit pas sa disponibilité ; l'usage commercial est conditionné à ces licences et aux restrictions territoriales, sans autorisation globale implicite [O6].

## Cloudflare Workers AI

API native : `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL_ID}`. Compte, identifiant de compte et token Bearer ; le guide exige les permissions Workers AI Read/Edit pour le token créé manuellement [F3]. Inscription gratuite sans CB [F4].

| Allocation [F1] | RPM de génération texte [F2] | TPM / RPD / TPD / mensuel | Reset |
| --- | ---: | --- | --- |
| 10 000 neurones/jour, partagés entre les appels | 300 par défaut ; exceptions selon modèle | `UNKNOWN` ; les neurones ne sont pas des tokens | Quotidien, 00:00 UTC |

Exemples explicitement maintenus sur Workers Free : `@cf/zai-org/glm-4.7-flash`, `@cf/google/gemma-4-26b-a4b-it`, `@cf/nvidia/nemotron-3-120b-a12b`. Les modèles `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code` et `@cf/zai-org/glm-5.2` sont exclus du Free standard et nécessitent une voie payante [F5].

En Workers Free, le dépassement échoue et nécessite un upgrade. Workers Paid conserve l'allocation puis facture ; l'achat de crédits AI Gateway est une autre voie payante, non retenue [F1]. Le plafond de requêtes Workers général n'est pas un quota d'inférence additionnel.

Cloudflare n'entraîne pas de modèle et n'améliore pas ses services avec le contenu client sans consentement explicite. Un stockage peut résulter de services ajoutés comme R2/KV/Vectorize. Durée universelle de conservation et résidence géographique garanties pour chaque appel : `UNKNOWN`. Les licences propres aux modèles tiers restent applicables, y compris pour l'usage commercial [F6].

## Hugging Face Inference Providers

API de chat : `POST https://router.huggingface.co/v1/chat/completions`, token utilisateur HF en Bearer. Exemple documenté : `openai/gpt-oss-120b`, avec sélection explicite possible `openai/gpt-oss-120b:groq`. La sélection automatique privilégie le fournisseur le plus rapide ; elle ne signifie pas coût nul [H2].

| Compte Free [H1] | Quotidien | RPM / TPM / RPD | Reset |
| --- | --- | --- | --- |
| 0,10 $ par mois, susceptible de changer | `UNKNOWN` | `UNKNOWN` | Mensuel ; jour, heure, report : `UNKNOWN` |

Les crédits ne s'appliquent qu'aux requêtes routées et facturées par HF. Une clé de fournisseur personnelle est facturée par ce fournisseur, sans crédit HF. Usage supplémentaire : achat de crédits nécessaire ; absence de CB obligatoire à l'inscription pour obtenir le crédit initial : `UNKNOWN` dans les pages ouvertes [H1]. La gratuité permanente du modèle lui-même n'est pas établie : c'est une petite allocation monétaire.

HF indique ne pas conserver corps de requête/réponse en routage, ni données utilisateur pour entraîner des modèles. Les logs de diagnostic restent jusqu'à 30 jours sans contenu utilisateur ni tokens d'authentification. Le traitement final dépend des politiques du fournisseur ; entraînement/rétention de toutes les routes : `UNKNOWN` [H3]. Le service accueille individus et entreprises sous conditions générales et conditions supplémentaires ; droit commercial pour un modèle précis : `UNKNOWN` sans sa licence [H4]. Les Inference Endpoints dédiés, Spaces et Jobs ne sont pas assimilés à cette offre.

## Limites de qualification pour IDA

Cette recherche ne qualifie aucun fournisseur en production. Restent à vérifier après décision explicite : compte exact, pays d'accès, disponibilité du modèle, licence de l'usage envisagé, règles de données de la route et preuve d'arrêt sans dépense. Aucun quota ne justifie de multiplier comptes ou clés pour contourner une limite. Un éventuel connecteur doit appliquer côté serveur une liste blanche, un budget gratuit fermé, un plafond de tokens et l'arrêt sur 402/429 ; aucune bascule payante implicite.

## Registre des sources officielles

Toutes les URL ci-dessous ont été ouvertes le **2026-09-14**. `UNKNOWN` dans la colonne date concerne la date de publication/mise à jour affichée, pas la date de consultation. Les extraits indexés obsolètes n'ont pas été utilisés pour remplacer les pages ouvertes. Chaque source fait l'objet d'une synthèse brève, sans reproduction extensive.

| Réf. | Source et URL | Date affichée |
| --- | --- | --- |
| G1 | [Groq — Rate Limits](https://console.groq.com/docs/rate-limits) | `UNKNOWN` |
| G2 | [Groq — Billing FAQs](https://console.groq.com/docs/billing-faqs) | `UNKNOWN` |
| G3 | [Groq — OpenAI Compatibility](https://console.groq.com/docs/openai) | `UNKNOWN` |
| G4 | [Groq — API Reference](https://console.groq.com/docs/api-reference) | `UNKNOWN` |
| G5 | [Groq — Services Agreement](https://console.groq.com/docs/legal/services-agreement) | 2026-06-22 |
| G6 | [Groq — Your Data](https://console.groq.com/docs/your-data) | `UNKNOWN` |
| C1 | [Cerebras — Rate Limits et FAQ Free Trial](https://inference-docs.cerebras.ai/support/rate-limits) | `UNKNOWN` |
| C2 | [Cerebras — Authentication](https://inference-docs.cerebras.ai/api-reference/authentication) | `UNKNOWN` |
| C3 | [Cerebras — Terms of Use](https://www.cerebras.ai/terms-of-service) | 2024-08-27 |
| C4 | [Cerebras — Privacy Policy](https://www.cerebras.ai/privacy-policy) | 2024-08-27 |
| O1 | [OpenRouter — Free Models Router](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground) | `UNKNOWN` |
| O2 | [OpenRouter — Lowest-Cost LLM Inference, section gratuite](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/) | `UNKNOWN` |
| O3 | [OpenRouter — Image Generation, limites du Free](https://openrouter.ai/blog/tutorials/image-generation-models/) | `UNKNOWN` |
| O4 | [OpenRouter — API Credit & Rate Limits](https://openrouter.ai/docs/api_reference/limits) | `UNKNOWN` |
| O5 | [OpenRouter — Data Collection](https://openrouter.ai/docs/guides/privacy/data-collection) | `UNKNOWN` |
| O6 | [OpenRouter — Terms of Service](https://openrouter.ai/terms/) | 2026-08-31 |
| F1 | [Cloudflare — Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) | 2026-08-28 |
| F2 | [Cloudflare — Workers AI Limits](https://developers.cloudflare.com/workers-ai/platform/limits/) | 2026-08-07 |
| F3 | [Cloudflare — REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) | 2026-04-21 |
| F4 | [Cloudflare — Workers AI, inscription sans CB](https://www.cloudflare.com/products/workers-ai/) | `UNKNOWN` |
| F5 | [Cloudflare — Select models now require Workers Paid](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/) | 2026-07-28 |
| F6 | [Cloudflare — Data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/) | 2026-04-21 |
| H1 | [Hugging Face — Pricing and Billing](https://huggingface.co/docs/inference-providers/pricing) | `UNKNOWN` |
| H2 | [Hugging Face — Inference Providers](https://huggingface.co/docs/inference-providers/en/index) | `UNKNOWN` |
| H3 | [Hugging Face — Security & Compliance](https://huggingface.co/docs/inference-providers/security) | `UNKNOWN` |
| H4 | [Hugging Face — Terms of Service](https://huggingface.co/terms-of-service) | `UNKNOWN` |
