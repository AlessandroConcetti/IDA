# Mistral : authentification vérifiée, Chat cloud non activé

État au 16 septembre 2026 : l'utilisateur a confirmé le plan **Free Experiment**. Le fichier chiffré DPAPI du workspace a été constaté sans lire son contenu dans les outils. Un test réel unique, sous le même compte Windows, a ensuite utilisé le lecteur serveur existant et obtenu **HTTP 200 / AUTHENTICATED**, avec **`mistral-small-2603` présent**. Aucun prompt ni génération n'a été envoyé et aucun provider n'a été activé dans le Chat.

Le writer a été lancé avec `-ExecutionPolicy Bypass` uniquement pour son processus, après autorisation explicite de l'utilisateur et revue du script. Cette exception n'a pas été ajoutée au lecteur serveur, au lanceur IDA ou à une configuration permanente. Le lecteur serveur a fonctionné lors du diagnostic sans cet argument. Ne pas généraliser cette exception à d'autres scripts ; fermer la fenêtre de saisie après enregistrement.

## Diagnostic explicite en lecture seule

Depuis le dossier du projet, sous le même compte Windows que celui ayant enregistré la clé :

```powershell
& 'C:/Users/Aless/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --import ./node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/loader.mjs scripts/check-mistral-connection.ts --workspace-id wsp_demo_aless --check-auth
```

Le workspace est obligatoire ; `wsp_demo_aless` correspond au lanceur local actuel. Tout argument inconnu ou incomplet est refusé avant accès au coffre. La clé provient exclusivement du lecteur DPAPI `windowsIntelligenceSecret` existant et du fichier privé du workspace. Ne jamais copier la clé dans le Chat, un argument ou une variable d'environnement, ni exécuter directement le helper de déchiffrement.

Après résolution de la clé, le diagnostic effectue exactement une requête `GET https://api.mistral.ai/v1/models`. Il n'envoie aucun prompt et ne demande aucune génération. Destination et méthode fixes, validation TLS obligatoire, agent HTTPS direct sans proxy global, aucune redirection ni relance, délai total de 10 secondes incluant le coffre, en-têtes limités à 8 Kio et réponse à 1 Mio. Aucun registre, consentement, quota, politique ou fichier n'est modifié.

La sortie JSON contient uniquement `state`, `httpStatus`, `configuredModelId` et `modelPresent`. Le modèle configuré vient de l'adaptateur (`mistral-small-2603`). Aucune liste de modèles ou de comptes, clé, réponse brute, exception ou en-tête n'est affiché.

| État | Signification |
| --- | --- |
| `INVALID_ARGUMENTS` | Arguments refusés ; aucun accès au coffre ou au réseau. |
| `KEY_MISSING` | Fichier de clé indisponible selon le lecteur DPAPI. |
| `KEY_UNREADABLE` | Lecture ou format de clé refusé. |
| `TIMEOUT` | Délai total dépassé ; opération interrompue. |
| `NETWORK_ERROR` | Échec HTTPS expurgé. |
| `REDIRECT_REJECTED` | Réponse 3xx refusée sans suivre sa destination. |
| `AUTH_REJECTED` | Réponse HTTP 401 ou 403. |
| `HTTP_ERROR` | Autre statut HTTP non accepté. |
| `INVALID_RESPONSE` | Corps, format, taille ou intégrité de réponse refusé. |
| `AUTHENTICATED` | HTTP 200 et liste de modèles valide ; `modelPresent` indique la présence exacte du modèle configuré. |

`httpStatus` et `modelPresent` restent `null` tant qu'ils ne sont pas établis. Le code de sortie est 0 uniquement si l'authentification est acceptée et le modèle présent ; sinon il est 1.

Un succès confirme seulement l'accès à cet endpoint et, séparément, la présence du modèle. Il ne prouve ni l'autorisation d'inférence, ni le quota restant, ni la gratuité effective d'une génération, ni la rétention des données. Il ne suffit donc pas à annoncer une connexion Chat opérationnelle. L'intégration du Chat, le consentement cloud et les contrôles de coût/quota restent des étapes distinctes.

Les tests `apps/api/src/mistral-connection.test.ts` simulent intégralement le coffre et HTTPS : aucun secret réel ni socket réseau n'est utilisé.

Vérification de cette tranche : **176 tests simulés réussis** (diagnostic 34, adaptateur et transport Mistral 99, coffre IA 43), vérification de types API et lint ciblé. Le succès réel du GET ci-dessus reste distinct de ces tests simulés. Les services IDA et Qwen ont été relancés sur loopback ; cette relance ne valide pas l'accès iPhone.

Référence : [API officielle Mistral — GET /v1/models](https://docs.mistral.ai/api/endpoint/models).
