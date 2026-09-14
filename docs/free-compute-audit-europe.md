# Audit FREE-FIRST — Gemini API, Mistral API et Vibe

Vérification documentaire publique : **2026-09-14**. Pages officielles recherchées puis ouvertes. Aucun compte consulté ou créé, aucune clé générée, aucun appel d'inférence, installation, achat ou activation. Les offres ci-dessous ne prouvent ni l'éligibilité ni le solde d'un compte IDA. `UNKNOWN` signifie non établi par les documents consultés, jamais zéro ni illimité. Sélection de modèles utile à IDA, non exhaustive.

## Gratuité, authentification et quotas

| Service distinct | Offre publique | Authentification / carte bancaire | RPM / TPM / RPD | Jour, mois, renouvellement et expiration |
| --- | --- | --- | --- | --- |
| Gemini Developer API | Entrées/sorties gratuites pour certains modèles [G1]. | Compte Google, projet Cloud et clé API ; nouveau compte en Free, facturation nécessaire pour passer Paid [G2, G3]. CB non nécessaire au parcours Free décrit ; éligibilité réelle `UNKNOWN`. | Chiffres par modèle `UNKNOWN` : limites actives dans AI Studio. Limites par projet, cumul des clés ; TPM = tokens entrants [G4]. | RPD remis à zéro à minuit heure du Pacifique. Plafond mensuel, solde quotidien, date de fin du Free : `UNKNOWN`. Capacité non garantie [G4]. |
| Mistral API / Studio Free | La page Plans annonce **10 USD/mois de crédits API** [M1]. | Compte Mistral et clé Bearer ; Quickstart : Free sans CB [M2]. Réserve contractuelle commerciale explicitée plus bas [M8]. | RPM `UNKNOWN` ; la documentation utilise **RPS**, TPM entrée + sortie et tokens/mois. Toutes les valeurs attribuées : `UNKNOWN`, visibles dans Admin. Limites partagées par organisation/workspaces [M3]. | Budget mensuel commun Studio/API/Vibe Code ; sans PAYG, usage susceptible de s'arrêter à épuisement jusqu'à période suivante [M4]. RPD, tokens/jour, report de crédit, jour exact de renouvellement et fin de l'offre : `UNKNOWN`. |
| Vibe CLI avec modèles Mistral hébergés | Sessions de code gratuites **limitées**, aucun nombre public confirmé [M1]. | Connexion Mistral par navigateur ou clé ; la documentation dit que la même clé fonctionne en Free [V1, V2]. Condition commerciale/CB : même réserve M8. | RPM/TPM/RPD `UNKNOWN`. Ne pas convertir les limites API en nombre de prompts Vibe : budget Vibe et débit API distincts [M3]. | Sessions/jour et plafond spécifique CLI `UNKNOWN`. Le budget commun décrit par M4 ne prouve pas une allocation CLI indépendante. Expiration `UNKNOWN`. |
| Vibe web / mobile, Vibe Code Web | Interface de conversation et fonctions de travail/code ; Free limité [M1]. Code Web utilise un dépôt GitHub dans un environnement distant [V3]. | Compte et connexion fournisseur ; pas une clé API donnant accès aux droits de cette interface. | RPM/TPM/RPD d'une API réutilisable : **non applicables** ; nombres de messages/sessions Free `UNKNOWN`. | Limites et renouvellement précis `UNKNOWN`. Ne pas additionner cette interface comme un deuxième crédit API. |
| Vibe CLI + modèle local | Client compatible avec une API locale compatible OpenAI [V4]. | Compte Mistral facultatif pour ce mode [V1]. Aucun crédit cloud requis ; coût matériel/électricité local. | Quotas cloud non applicables ; débit matériel réel `UNKNOWN`. | Pas d'allocation fournisseur consommée par l'inférence locale ; disponibilité dépend de l'installation et du modèle, non vérifiées ici. |

Les 10 USD sont une annonce publique d'allocation, pas un solde acquis. La documentation Mistral décrit à la fois un budget mensuel partagé et des limites API séparées : ce sont deux contraintes cumulatives, pas deux ressources à additionner. [M1, M3, M4]

## Modèles et capacités documentés

| Fournisseur / identifiant exact | Capacités établies | Statut gratuit établi |
| --- | --- | --- |
| Gemini `gemini-3.8-flash` | Texte/image/vidéo/audio/PDF en entrée, texte en sortie ; fonctions, sorties structurées, raisonnement. Entrée max 1 048 576 tokens, sortie max 65 536 [G6]. | Standard entrée/sortie gratuit dans la grille ; accès du compte `UNKNOWN` [G1]. |
| Gemini `gemini-3.5-flash-lite` | Mêmes types d'entrée, texte en sortie ; fonctions/sorties structurées, extraction documentaire ; mêmes limites de contexte [G7]. | Standard entrée/sortie gratuit ; accès du compte `UNKNOWN` [G1]. |
| Gemini `gemini-3.1-flash-tts-preview` | Texte vers audio [G1]. | Standard gratuit, quota `UNKNOWN` [G1]. |
| Gemini `gemini-embedding-2` | Vecteurs multimodaux texte/image/vidéo/audio/PDF [G1]. | Standard gratuit, quota `UNKNOWN` [G1]. |
| Mistral `mistral-small-latest` / `mistral-small-2603` | Small 4 : raisonnement/code, fonctions, sorties structurées, contexte 256k ; version datée GA [M5]. | `mistral-small-latest` est l'exemple officiel d'appel après activation Free [M2] ; tarif catalogue consommant l'allocation, pas inférence illimitée. |
| Mistral `mistral-medium-latest`, `mistral-large-latest` | Généralistes multimodaux ; Medium : appels d'outils et code [M6]. | Catalogue officiel ; éligibilité individuelle au Free `UNKNOWN`. |
| Mistral `codestral-latest`, `mistral-embed`, `codestral-embed` | Code/complétion ; vecteurs texte ; vecteurs code [M6]. | Catalogue payant à l'usage ; consommation possible du crédit **non vérifiée par modèle**, `UNKNOWN`. |
| Mistral `mistral-ocr-latest`, `voxtral-mini-transcribe-realtime-2602`, `voxtral-mini-tts-latest` | Extraction documentaire, transcription temps réel, synthèse vocale [M6]. | Éligibilité Free et quotas par capacité `UNKNOWN`. |
| Mistral `mistral-moderation-2603` | Classification/modération de texte [M6]. | Tarif explicitement gratuit ; quotas `UNKNOWN`. |
| Vibe hébergé | Agent de code ; famille Devstral mentionnée dans la présentation du CLI [M1]. | Identifiant servi par défaut et choix accessibles au compte Free `UNKNOWN`. Vibe n'est pas un modèle. |
| Vibe local `mistralai/Devstral-Small-2-24B-Instruct-2512` | Exemple officiel local de modèle pour code/outils [V4]. | Inférence sur matériel propre ; licence du poids à vérifier séparément avant distribution. |

Pour les deux Gemini sélectionnés, capacité du modèle ne signifie pas gratuité de chaque outil : Search/Maps ne sont pas offerts dans leur colonne Free [G1]. Une fenêtre de contexte maximale n'est pas un quota TPM. Les alias `latest` Mistral peuvent évoluer : conserver la version résolue lors d'une future qualification.

## Données, entraînement et usage commercial

**Gemini — restriction pertinente pour IDA en France.** Les conditions, effectives au 2026-03-23, réservent les services aux développeurs pour usages professionnels/commerciaux, avec utilisateurs majeurs. Elles exigent des **Paid Services pour mettre un client API à disposition d'utilisateurs dans l'EEE, au Royaume-Uni ou en Suisse**. L'API est qualifiée Paid via un projet associé à une facturation active. L'existence du Free européen ne suffit donc pas à autoriser un déploiement gratuit IDA. Qualification d'un usage strictement personnel interne : `UNKNOWN` ; cette note ne la présume pas. [G5]

Hors EEE/UK/CH, le Free Gemini autorise utilisation des entrées/sorties pour amélioration/entraînement et examen humain ; données personnelles/confidentielles à exclure. Pour un utilisateur situé en EEE/UK/CH, les règles de données Paid s'appliquent même au gratuit : pas d'amélioration des produits par prompts/réponses, journalisation anti-abus temporaire, durée précise `UNKNOWN`. Google ne revendique pas la propriété des sorties ; respect des droits et restrictions d'usage requis. [G5]

**Mistral API.** En Free, entrées/sorties peuvent servir à l'entraînement [M9]. Opt-out disponible dans Admin, distinct de celui de Vibe ; état du compte `UNKNOWN` [M10]. API standard : conservation de génération puis 30 jours glissants pour anti-abus, sauf ZDR ; Agents API : jusqu'à clôture du compte. Éligibilité ZDR Free `UNKNOWN` [M11].

Les conditions commerciales reconnaissent la propriété des sorties au client dans les limites légales. Elles autorisent l'usage sous conditions, prohibent notamment contournement des protections et transfert de clés/comptes ; les fonctions Beta sont limitées à l'évaluation interne. Les modèles Labs/Preview peuvent utiliser les données pour entraînement malgré l'opt-out/ZDR : exclure ces variantes des données privées. [M7]

**Ambiguïté à conserver.** Le Quickstart dit explicitement « sans carte » [M2], alors que les conditions supplémentaires commerciales du 2026-08-05 demandent une méthode de paiement valide à l'ouverture d'un compte client. Les documents ouverts ne résolvent pas l'application exacte au Free commercial : **usage commercial Free sans CB `UNKNOWN`**, sans conclure que tout essai gratuit exige une carte. [M8]

**Vibe.** Entraînement par défaut sur données d'entrée/sortie, avec opt-out ; envoyer un feedback peut autoriser une utilisation de son contenu associé même après opt-out [M9, M10]. Conversations conservées jusqu'à suppression de la conversation/du compte [M11]. Les conditions commerciales restreignent l'intégration de Vibe dans un produit offert à des tiers sans autorisation préalable : ne pas traiter le CLI ou le web comme une API gratuite à relayer dans IDA [M7]. Le CLI peut lire/écrire des fichiers et lancer des commandes [V3] ; rien n'est activé par cet audit.

Le mode local Vibe peut fonctionner hors ligne, mais cela demande une configuration locale et la désactivation séparée de télémétrie, mises à jour et outils/connecteurs réseau [V4]. Ce constat documente une possibilité ; il ne prouve aucune configuration actuelle.

## Sources officielles ouvertes

Toutes les URL ci-dessous ont été consultées le **2026-09-14**. Les dates de version indiquées sont celles affichées par les pages ; sinon la date éditoriale est `UNKNOWN`. Les constats ci-dessus sont des synthèses courtes, pas des reproductions des pages.

| Réf. | Page officielle | Date de version affichée |
| --- | --- | --- |
| G1 | [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing) | `UNKNOWN` |
| G2 | [Gemini billing](https://ai.google.dev/gemini-api/docs/billing) | `UNKNOWN` |
| G3 | [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key) | `UNKNOWN` |
| G4 | [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) | 2026-09-02 |
| G5 | [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) | Effectives 2026-03-23 |
| G6 | [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) | 2026-09-02 |
| G7 | [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) | 2026-07-30 |
| M1 | [Mistral Plans](https://mistral.ai/pricing/) | `UNKNOWN` |
| M2 | [Activate Studio and generate an API key](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key) | `UNKNOWN` |
| M3 | [Mistral API rate limits](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them) | 2026-08-12 |
| M4 | [Mistral subscriptions](https://docs.mistral.ai/admin/billing-usage/subscriptions) | `UNKNOWN` |
| M5 | [Mistral Small 4](https://docs.mistral.ai/models/mistral-small-4-0-26-03) | Modèle 2026-03-16 |
| M6 | [Mistral API pricing](https://mistral.ai/pricing/api/) | `UNKNOWN` |
| M7 | [Mistral Commercial Terms](https://legal.mistral.ai/terms/commercial-terms-of-service/) | Effectives 2026-08-05 |
| M8 | [Mistral Additional Product Terms](https://legal.mistral.ai/terms/additional-terms/) | Effectives 2026-08-05 |
| M9 | [Mistral training usage](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models) | Relative, date exacte `UNKNOWN` |
| M10 | [Mistral training opt-out](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training) | Relative, date exacte `UNKNOWN` |
| M11 | [Mistral Privacy Policy, §5](https://legal.mistral.ai/terms/privacy-policy/) | `UNKNOWN` |
| V1 | [Vibe CLI quickstart](https://docs.mistral.ai/getting-started/quickstarts/vibe-code/install-cli) | `UNKNOWN` |
| V2 | [Vibe API keys and profiles](https://docs.mistral.ai/vibe/code/cli/api-keys-profiles) | `UNKNOWN` |
| V3 | [Vibe Code overview](https://docs.mistral.ai/vibe/code/overview) | `UNKNOWN` |
| V4 | [Vibe offline models](https://docs.mistral.ai/vibe/code/cli/offline-models) | `UNKNOWN` |

## Conséquence pour une stratégie FREE-FIRST

Conclusion de cet audit documentaire : Mistral API mérite une qualification Free séparée de Vibe ; Gemini Free mérite des essais admissibles mais pas une activation par défaut du service IDA destiné à des utilisateurs européens. Ces conclusions restent des décisions de présélection, pas une validation juridique ou opérationnelle d'un compte. Un futur contrôle devra établir éligibilité, quotas effectivement attribués, variante du modèle, confidentialité et mode de facturation sans activer PAYG. À quota épuisé, arrêter ou utiliser un autre fournisseur déjà admissible ; aucune multiplication de comptes, rotation de clés destinée à contourner les limites ou conversion de session web en API.
