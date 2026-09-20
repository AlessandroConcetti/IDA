# Cloudflare — attente de saisie locale

État au 20 septembre 2026 : **PREPARED / NOT_CONFIGURED**. À la demande de l'utilisateur, ne demander ni Account ID ni token dans le chat. L'interface de coffre-fort avec saisie du couple Account ID + token n'est pas encore implémentée ; ce fournisseur reste en attente sans empêcher MCP ou Qwen local.

Le secret Cloudflare peut déjà être conservé par le writer DPAPI existant, isolé par workspace. Ne pas écraser une clé déjà saisie et ne pas la recopier en clair dans une configuration JSON, le navigateur ou une variable d'environnement. La présence du fichier ne prouve pas la validité ni les scopes.

Parcours à terminer dans le coffre local :

1. Saisie explicite du compte et d'un token Workers AI limité à ce compte ; validation du format côté serveur, aucune valeur dans les logs.
2. Stockage chiffré et révocable, lié au workspace et au compte propriétaire. Pas de saisie automatique via un agent.
3. Vérification officielle du compte, des scopes, du modèle admissible au plan Free et du quota en neurones ; ne pas convertir arbitrairement neurones en tokens.
4. Destination REST officielle fixe liée à cet Account ID ; aucune URL libre. Limites de taille, délai, arrêt sur 429 et aucun repli payant.
5. Activation explicite par le Provider Router après tests et revue ; aucune donnée privée envoyée implicitement.

Ce document décrit les prérequis, pas un adaptateur actif. Aucun compte externe, achat, élargissement réseau ni nouvelle interface de secrets n'a été activé.

Sources : [REST Workers AI](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [tarification et allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/).
