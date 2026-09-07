# IDA — Provider Registry et modes d'exécution

## Statut

Fondation LLM implémentée le 7 septembre 2026 : contrats, Provider Registry, Router, sélection de modèle, façade Core et adaptateurs OpenAI Responses / Ollama testables par transports injectés. [Contrats, limites et branchement](docs/INTELLIGENCE_CONNECTION.md).

Le runtime de démonstration ne compose pas encore cette façade et ne charge aucun LLM, embedding, STT, TTS, générateur d'image ou vidéo. Les providers restent désactivés/non configurés à leur enregistrement. Aucun appel IA réel, clé, téléchargement de modèle ou nouveau endpoint HTTP n'est activé ; ne pas présenter les adaptateurs comme des comptes connectés.

## Principes

- Un module dépend d'une capacité, jamais d'un fournisseur concret.
- Aucun provider n'obtient de token utilisateur, accès SQL ou outil IDA.
- Les secrets sont résolus côté serveur au moment de l'appel et ne figurent jamais dans un manifeste public.
- Le local est préféré lorsqu'il satisfait capacité, qualité et matériel.
- Aucun fallback cloud silencieux.
- Toute sortie de données est filtrée, expliquée et soumise à l'Egress Policy.
- Un provider est appelé à la demande et libéré ou mis en veille lorsqu'il n'est plus nécessaire.

## Modes

`NORMAL` interdit tout appel de modèle. Recherche structurée, CRUD, permissions, règles, calendrier, approbations et outils déterministes restent utilisables.

`AI` rend les providers configurés éligibles, sans ajouter de données, outils ou permissions. L'utilisateur peut désactiver immédiatement ce mode ; les nouvelles requêtes IA sont alors refusées et les opérations annulables sont arrêtées.

## Manifeste cible

Un `ProviderManifest` revu au build déclare :

- clé, version et catégorie ;
- localisation `LOCAL` ou `CLOUD` ;
- capacités et limites ;
- classifications de données acceptées ;
- besoin réseau ;
- schéma de configuration sans secret ;
- coût et exigences matérielles déclaratives ;
- stratégie de timeout/annulation ;
- health checks ;
- politique de rétention connue ;
- compatibilité avec les modes et plateformes.

Catégories prévues : `LLM`, `EMBEDDING`, `STT`, `TTS`, `IMAGE`, `VIDEO`, `STORAGE`, `NOTIFICATION`, `CALENDAR`, `SOCIAL` et capacités futures explicitement revues. Le contrôle gestuel utilise un contrat d'entrée séparé décrit dans `INPUT_PROVIDERS.md`.

## Sélection

Le Provider Registry filtre d'abord les candidats incompatibles avec le mode, les données, le consentement, le réseau, le workspace ou le matériel. Une politique explicite choisit ensuite le provider. La décision effective — capacité, local/cloud, version, données transmises et résultat — est auditée sans prompt privé ni secret.

Un provider absent ou en panne produit un état actionnable. Le système peut revenir à un parcours déterministe `NORMAL`, mais ne remplace jamais automatiquement un provider local par un cloud.

La première implémentation limite les capacités à `TEXT` / `REASONING` et renvoie uniquement `{ text }`, donnée non fiable sans pouvoir d'exécution. Elle vérifie capacité, niveau de complexité, limites d'entrée/sortie, disponibilité datée, allocation d'appels, coût et latence estimés avant tout classement local-first/préférence/coût/latence. Une estimation inconnue rend le modèle inéligible. Les estimations ne sont ni des mesures live ni une garantie de facturation.

Le fallback est limité à trois fournisseurs distincts au maximum, uniquement après une erreur typée `UNAVAILABLE` ou `RATE_LIMITED`, et revalide l'identité serveur et les consentements à chaque tentative. Un consentement cloud couvre le fournisseur enregistré, la finalité, les classes et le périmètre utilisateur/workspace/session/instance, avec expiration. Même les données `PUBLIC` nécessitent cet opt-in. Refus, authentification, réponse malformée, annulation, timeout ambigu ou erreur inconnue ne déclenchent pas de retry.

Les réservations d'appels sont synchrones dans le registre partagé du processus et consommées avant l'appel, y compris en échec. L'enveloppe de coût estimé et le délai total ne sont pas réinitialisés entre tentatives. Une révision de configuration annule les appels en cours. Un arrêt du mode AI devra être raccordé au signal d'annulation de la requête par la composition serveur ; sa relecture bloque déjà les tentatives suivantes et la remise de résultat. Aucune permission métier n'est élargie.

## Activation

Un provider n'est activable que si :

1. son manifeste et son adaptateur sont présents et compatibles ;
2. sa configuration est valide ;
3. les secrets sont disponibles dans le coffre serveur ;
4. les conditions de données et de consentement sont satisfaites ;
5. ses tests de capacité, sécurité, coût et erreur passent.

Le registre reste statique au démarrage dans les premières phases. Aucun code ou SDK n'est téléchargé depuis une conversation, la base ou un workspace portable.

## Tests minimaux

- aucun provider appelé en `NORMAL` ;
- provider non enregistré, désactivé ou incompatible refusé ;
- donnée d'une classe interdite jamais transmise ;
- cloud non choisi sans opt-in ;
- panne locale sans fallback cloud implicite ;
- secrets absents du client, logs et erreurs ;
- timeout et annulation libèrent les ressources ;
- états System cohérents avec la capacité réellement installée.
