# Audit public du calcul gratuit — Qwen, Alibaba, Z.ai, ModelScope

Vérification documentaire : **2026-09-14**. Sources officielles recherchées puis ouvertes, sans connexion, clé, requête d'inférence, paiement, installation ou activation. Les chiffres décrivent les offres publiques, jamais le compte de l'utilisateur. `UNKNOWN` signifie non établi dans les sources accessibles. Une date de consultation ne vaut pas date de publication. Aucun fournisseur n'est activé dans IDA par ce document.

`WEBFREE` : interface humaine gratuite ; `APIFREE` : inférence API au tarif nul ; `TRIAL` : dotation temporaire ; `CODINGPLAN` : abonnement réservé à certains usages ; `PAIDAPI` : paiement à l'usage ; `LOCAL_OPENWEIGHTS` : poids disponibles, calcul à fournir. Un accès web ou un abonnement de code ne crée pas un droit d'intégration API pour IDA.

## Synthèse

| Offre | Classe retenue | Gratuité actuellement établie | Limite déterminante |
| --- | --- | --- | --- |
| Qwen Studio / Chat | Interface web ; `WEBFREE` actuel `UNKNOWN` | Page publique ouverte, conditions tarifaires non lisibles | Quota, modèle effectivement servi et droits d'automatisation `UNKNOWN` |
| Qwen Code OAuth | Ancienne offre, terminée | Non : arrêt annoncé au 2026-04-15 | Ne pas compter les anciens 1 000 / 2 000 appels quotidiens |
| Alibaba Model Studio international | `TRIAL`, puis `PAIDAPI` | Dotation par modèle éligible | Expiration et risque de facturation après épuisement |
| QwenCloud | `TRIAL`, puis `PAIDAPI` | Dotation par modèle éligible | Généralement 90 jours ; quantité exacte `UNKNOWN` |
| Z.ai API : trois variantes Flash ci-dessous | `APIFREE` publié | Entrée/sortie/cache affichés gratuits | RPM, TPM, RPD, solde disponible et admissibilité du compte `UNKNOWN` |
| Z.ai Coding Plan | `CODINGPLAN` payant | Pas une API généraliste gratuite | Outils officiellement autorisés ; crédits sur 5 heures et 7 jours |
| ModelScope API Inference | `APIFREE` historique ; actuel `UNKNOWN` | Annonce de 2024 retrouvée ; quotas actuels non vérifiés | Pages actuelles non extractibles ; pas de garantie de service |
| Poids Qwen3 / GLM-4.5 | `LOCAL_OPENWEIGHTS` | Licences ouvertes pour les variantes citées | GPU/RAM/énergie/hébergement à financer |

## Qwen / Alibaba

### Model Studio international : essai API, pas allocation mensuelle

La page mise à jour le **2026-09-11** décrit un quota généralement de **1 000 000 tokens par modèle**, entrée et sortie cumulées, uniquement en région **Singapour** et périmètre **International**. Les exemples incluent `qwen-plus`, `qwen3.6-plus` et leurs snapshots ; l'éligibilité et la quantité exactes d'un modèle donné restent `UNKNOWN` sans sa fiche/quota.

Pour les premières activations depuis le **2026-09-08 à 03:00 UTC**, validité de **90 jours**, comptés depuis activation, publication du modèle ou approbation, selon la date la plus tardive. Les activations antérieures ne sont pas affectées. Aucun renouvellement quotidien/mensuel n'est annoncé. Compte Alibaba et clé API générale nécessaires ; exigence de carte bancaire pour ce compte : `UNKNOWN`. Les clés Coding/Token Plan n'utilisent pas ce quota. Après complément des informations du compte, dépassement facturable ; `Free Quota Only` bloque les appels à épuisement. [Règles officielles de l'essai](https://www.alibabacloud.com/help/en/model-studio/new-free-quota).

RPM / TPM / RPD applicables : `UNKNOWN`. Les capacités et contextes exacts doivent être vérifiés par modèle avant sélection. La FAQ annonce que les données ne servent pas à entraîner les modèles ; la notice sur les données précise l'absence d'utilisation des données métier sans consentement explicite. Rétention API et conditions commerciales détaillées applicables à IDA : `UNKNOWN` dans cet audit. [FAQ Model Studio](https://www.alibabacloud.com/help/en/model-studio/faq-about-alibaba-cloud-model-studio), [notice sur l'entraînement](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-and-wan-training-data-disclosure), consultées le 2026-09-14.

### QwenCloud : essai distinct à contrôler dans sa propre console

La documentation décrit une dotation **par modèle**, normalement valable **90 jours** après activation ou publication d'un nouveau modèle. Quantité exacte, allocation quotidienne/mensuelle, RPM, TPM et RPD : `UNKNOWN`. Les outils intégrés, le batch, le fine-tuning et le déploiement ne sont pas couverts. L'inscription est annoncée sans moyen de paiement, mais la même page prévoit certains cas où compléter les informations de paiement débloque le quota : absence universelle de carte requise **non garantie**.

Sans paiement configuré, les appels s'arrêtent à épuisement ; pour les utilisateurs vérifiés, `Free quota only` est désactivé par défaut et le dépassement peut être facturé. Les exemples `qwen-plus`, `qwen3.6-plus` ne prouvent pas une dotation disponible sur le compte. [Free quota QwenCloud](https://docs.qwencloud.com/resources/free-quota), consultée le 2026-09-14, date éditoriale `UNKNOWN`.

Les limites sont par compte et par modèle, partagées entre clés/workspaces, avec plafonds par minute et seconde. Leurs valeurs se consultent dans les fiches et la console. [Rate limits](https://docs.qwencloud.com/developer-guides/administration/rate-limits), consultée le 2026-09-14.

La FAQ annonce aucune utilisation des données pour l'entraînement. Pour Responses, `store=true` est documenté comme valeur par défaut avec conservation de conversation **30 jours**, désactivable par `store=false` ; les métadonnées d'usage restent journalisées. Régions d'inférence effectivement proposées à ce compte, restrictions géographiques et conditions commerciales détaillées : `UNKNOWN`. [Compte et confidentialité](https://docs.qwencloud.com/resources/faq-account), [traitement des données](https://docs.qwencloud.com/developer-guides/run-and-scale/safety), consultés le 2026-09-14.

La tarification ordinaire couvre texte, image, vidéo et parole ; une dotation temporaire ne prouve pas que toutes ces capacités sont gratuites. [Tarification QwenCloud](https://docs.qwencloud.com/developer-guides/getting-started/pricing), consultée le 2026-09-14.

### Qwen Code, Token Plan et web

La documentation Qwen Code annonce explicitement l'arrêt de son offre OAuth gratuite le **2026-04-15**. Elle présente un Coding Plan à abonnement, des clés API de fournisseurs et le raccordement à un serveur local. [Authentification Qwen Code](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/), ouverte le 2026-09-14.

La FAQ Alibaba mentionne encore un quota OAuth de 2 000 appels/jour sans établir qu'il constitue un accès Qwen Code actuel : **divergence documentaire, quota exclu du calcul disponible**. [FAQ contenant cette mention](https://www.alibabacloud.com/help/en/model-studio/new-free-quota).

Le Token Plan Personal n'offre pas lui-même d'essai gratuit. Quotas/prix exacts et droits d'usage IDA des abonnements Alibaba/QwenCloud : `UNKNOWN`, aucune souscription examinée. [FAQ Token Plan](https://www.alibabacloud.com/help/en/model-studio/token-plan-personal-faq), consultée le 2026-09-14.

[Qwen Studio](https://chat.qwen.ai/) et [Qwen](https://qwen.ai/) ont été ouverts : rendu limité/incompatible ; [conditions](https://qwen.ai/termsservice) et [confidentialité](https://qwen.ai/privacypolicy) ne livraient pas leur texte à l'ouverture. Gratuité actuelle, modèle, quotas quotidiens/mensuels, authentification, carte, entraînement, régions et droits commerciaux web : `UNKNOWN`. Aucune hypothèse sur l'API n'en est déduite.

## Z.ai / GLM

### API générale

| Identifiant candidat | Modalité/capacité publiée | Contexte publié | Tarif d'inférence |
| --- | --- | --- | --- |
| `glm-4.7-flash` | Texte, raisonnement/code | 200K | Gratuit |
| `glm-4.5-flash` | Texte, raisonnement | 200K dans la vue d'ensemble | Gratuit |
| `glm-4.6v-flash` | Vision, appels de fonctions natifs | 128K | Gratuit |

Le tarif nul porte sur entrée, sortie et cache. **`glm-5.3-flash` est payant** : 0,15 USD/M tokens d'entrée et 0,50 USD/M en sortie ; le suffixe Flash seul ne signifie donc pas gratuit. La recherche web intégrée coûte 0,01 USD/utilisation. [Tarification](https://docs.z.ai/guides/overview/pricing), [capacités/contextes](https://docs.z.ai/guides/overview/overview), [GLM-4.7](https://docs.z.ai/guides/llm/glm-4.7), [GLM-4.6V](https://docs.z.ai/guides/vlm/glm-4.6v), ouverts le 2026-09-14 ; dates éditoriales `UNKNOWN`.

Compte et clé API nécessaires ; point de terminaison général documenté : `https://api.z.ai/api/paas/v4`. Carte bancaire, vérification additionnelle, quota de tokens/jour/mois, RPM, TPM, RPD, concurrence, date d'expiration de la gratuité et admissibilité France : **`UNKNOWN`**. L'absence de quota public retrouvé ne signifie pas illimité. Aucun appel réel n'a vérifié la disponibilité de ces identifiants. [Introduction API](https://docs.z.ai/api-reference/introduction), [démarrage](https://docs.z.ai/guides/overview/quick-start), consultés le 2026-09-14.

Le DPA API annonce traitement généralement à **Singapour**, traitement pour fournir le service et selon les instructions du client, et absence de stockage des contenus d'entrée/sortie. Les autres données peuvent être conservées temporairement. Engagement explicite couvrant tout entraînement, y compris toutes données non personnelles : `UNKNOWN` ; ne pas assimiler ce DPA à la politique du chat grand public. [DPA, sections 1, 3 et 4](https://docs.z.ai/legal-agreement/privacy-policy), page datée **2025-09-29**, consultée le 2026-09-14.

Les conditions couvrent les usages internes et au bénéfice d'utilisateurs finaux, mais imposent des restrictions, notamment sur l'utilisation pour entraîner/améliorer des modèles externes ou concurrents. Cela ne constitue pas une licence commerciale sans conditions. Validation de l'usage IDA précis : `UNKNOWN`. [Conditions et dispositions API](https://docs.z.ai/legal-agreement/terms-of-use), datées **2026-04-14**, consultées le 2026-09-14.

### Coding Plan et chat

Coding Plan : abonnement **dès 18 USD/mois** ; `GLM-5.3` et `GLM-5.3-Flash` annoncés. Crédits **5 heures / semaine** : Lite **2 000 / 10 000**, Pro **12 000 / 60 000**, Max **28 000 / 140 000**. Ce ne sont ni des requêtes ni un quota mensuel de tokens. Concurrence ajustée dynamiquement ; RPM/TPM fixes `UNKNOWN`. Usage individuel dans les outils officiellement pris en charge ; les intégrations SDK non autorisées peuvent être restreintes. [Présentation](https://docs.z.ai/devpack/overview), [politique d'usage](https://docs.z.ai/devpack/usage-policy), ouvertes le 2026-09-14.

L'endpoint Coding Plan distinct est réservé aux outils supportés ; **ne pas en faire un backend IDA** sans droit explicite. [Référence des endpoints](https://docs.z.ai/api-reference/introduction).

[Chat Z.ai](https://chat.z.ai/) a été ouvert ; son titre annonce `GLM-5.3-Flash`, mais le contenu exploitable ne fournit pas une grille gratuite actuelle. `WEBFREE`, quotas, expiration, carte et conditions du compte : `UNKNOWN`. Les règles API ne sont pas transposées au chat.

## ModelScope

L'annonce officielle du **2024-12-06** proposait **2 000 requêtes/jour par utilisateur inscrit**, via SDK Token et `https://api-inference.modelscope.cn/v1`. Exemples historiques : `Qwen/Qwen2.5-Coder-32B-Instruct` pour le code et `Qwen/Qwen2.5-7B-Instruct` pour le dialogue. Elle précisait des limites ajustables et déconseillait les charges nécessitant forte concurrence/SLA, en orientant les besoins commerciaux vers des API commerciales. [Annonce historique](https://community.modelscope.cn/675262372db35d1195183bdb.html), index officiel retrouvé le 2026-09-14 ; l'ouverture redirige aujourd'hui vers une page communautaire générique.

Les pages officielles [introduction](https://www.modelscope.cn/docs/model-service/API-Inference/intro) et [limites](https://www.modelscope.cn/docs/model-service/API-Inference/limits) ont été ouvertes le 2026-09-14 mais renvoient zéro ligne exploitable. **Quota actuel quotidien/mensuel, RPM/TPM/RPD, plafond par modèle, IDs disponibles, expiration, carte, vérification d'identité, disponibilité hors Chine, régions de traitement, rétention, entraînement et autorisation commerciale : `UNKNOWN`.** Ne pas convertir les 2 000 appels historiques en budget disponible ni qualifier l'offre de permanente.

## Poids ouverts et conclusion pour IDA

Le dépôt officiel **Qwen3** annonce Apache-2.0 pour ses poids ouverts. Le dépôt **GLM-4.5 / GLM-4.5-Air** annonce MIT et usage commercial/développement dérivé. Ces licences concernent les variantes distribuées par ces dépôts, pas tous les services Qwen/GLM ni toutes les générations. [Qwen3](https://github.com/QwenLM/Qwen3), [GLM-4.5](https://github.com/zai-org/GLM-4.5), consultés le 2026-09-14.

Pour `LOCAL_OPENWEIGHTS`, aucun quota hébergé gratuit n'est obtenu. Coût matériel/énergie et capacité réellement disponible sur la machine : `UNKNOWN` dans cet audit. Aucun téléchargement ni déploiement n'a été effectué.

Décision documentaire : les trois API Flash Z.ai constituent des **candidats** à une future vérification consentie ; les essais Alibaba/QwenCloud sont temporaires ; ModelScope reste à confirmer ; Qwen OAuth est exclu. Toute intégration ultérieure conserve les contrôles serveur, l'isolation de workspace, le filtrage des données et l'audit d'IDA. Cette conclusion ne vaut ni activation ni validation juridique ou de sécurité du fournisseur.
