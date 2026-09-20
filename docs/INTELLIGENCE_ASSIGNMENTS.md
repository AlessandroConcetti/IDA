# Affectations indicatives des modèles

`apps/api/src/intelligence-assignments.ts` projette le registre technique existant sur les usages des environnements. Ce module pur ne crée aucun agent, n'active aucun fournisseur, ne dépense aucun quota et n'envoie aucune donnée. Ces préférences produit ne prétendent pas constituer un classement mesuré des modèles.

`providerAssignmentRole(providerKey)` fournit un rôle indicatif pour le tableau Réseau IA existant. `buildIntelligenceAssignments(network, context)` donne des candidats exacts et leur motif d'admissibilité pour un contexte déjà déterminé côté serveur. Le résultat porte toujours `mode: ADVISORY_ONLY`.

Cette tranche n'installe aucun routage actif par environnement. `selectedModel` et l'ordre des candidats décrivent la préférence consultative ; ils ne changent ni `localFirst`, ni les modèles autorisés du profil, ni les règles du ProviderRouter. Le rôle affiché ne constitue pas une preuve d'activation ou de disponibilité.

| Environnement / fonction | Préférence, puis replis | Limite |
| --- | --- | --- |
| Home | Ollama local | Dialogue privé ; aucune commande matérielle |
| Santé | Ollama local | Reformulation de notes ; aucun diagnostic |
| Finance | Ollama local | Synthèse en lecture seule ; aucune opération bancaire |
| Musique, Social | Mistral, Ollama | Textes français ; aucune génération audio ou publication |
| Recherche | Gemini, OVHcloud, Groq, Ollama | Synthèse de sources publiques déjà fournies ; aucune navigation |
| Créatif, plans Fabrique | Mistral, Ollama | Propositions textuelles à examiner ; aucune exécution |
| Code Fabrique | Mistral, NVIDIA, OpenRouter, Ollama | Capacités `TEXT` **et** `CODE` effectivement déclarées |
| Workspace / tri | Groq, Cloudflare, Ollama | Tri et reformulation textuels ; aucune modification automatique |
| Voyage | Gemini, Mistral, Ollama | Ébauche textuelle ; aucune réservation |
| Administration, juridique, IDACAR | Ollama local | Données privées ; aucune démarche, certification ou commande |
| Cerebras | Réserve expérimentale | Essai à revoir ; aucune affectation active |
| Autres fournisseurs du réseau | Réserve documentaire | Aucune activation déduite du catalogue |

## Admissibilité

- Une affectation est `USABLE` uniquement si le snapshot contient un modèle `REGISTERED`, `AVAILABLE_FREE`, au coût estimé nul, de classe `LOCAL` ou `FREE_LIMITED` cohérente avec sa localité, avec une allocation positive et toutes les capacités requises. Les identifiants de modèles proviennent exclusivement du snapshot : aucun modèle marketing ou slug documentaire ne devient exécutable par cette projection.
- `USABLE` signifie « candidat admissible dans le snapshot », jamais autorisation d'appel. L'état réel peut évoluer immédiatement. Les erreurs, frais, quotas épuisés, statuts inconnus ou non configurés restent `PREPARED`, avec `selectedModel: null` si aucun repli admissible n'existe.
- Tout contenu autre que `PUBLIC` exclut le cloud, même si un consentement est présent. Home, santé, finance, administration, juridique et IDACAR restent locaux dans tous les cas. `SECRET`, classes vides ou invalides interdisent tous les candidats, y compris locaux.
- Un candidat cloud exige son identifiant dans `cloudConsentProviderKeys`. Cette liste est fournie par l'autorité serveur après résolution du consentement pour l'identité, le purpose et les classes actuels ; elle ne doit jamais être acceptée directement depuis un body HTTP. Le module ne remplace pas cette résolution ni sa révocation.
- `CoreIntelligence` / `EnvironmentIntelligence`, le `ProviderRouter` et le Tool Gateway conservent l'autorité : identité, workspace, session, modèle autorisé, confidentialité, consentement, coût, quota et audit sont revérifiés à chaque appel. Cette projection n'écrit pas les profils d'environnement et ne change pas leur statut.
- Le snapshot `IntelligenceNetwork` ne transporte pas toutes les contraintes structurées du manifeste et de la requête, notamment les classes de données admises par chaque fournisseur, les limites de contexte/sortie, le purpose et le profil actif. Il ne suffit donc jamais à autoriser un appel, même local : `USABLE` reste une indication technique partielle. Ne pas transformer `selectedModel` ou `cloudConsentProviderKeys` en autorisation serveur.
- Les affectations courantes utilisent un payload texte. Le nom Gemini ne confère pas `VISION`, NVIDIA ne confère pas `CODE`, et OpenRouter ne confère ni modèle gratuit ni route revue. La recherche web, les images, la voix et les actions nécessitent leurs contrats et contrôles distincts.

## OVHcloud : accès anonyme et état réel

La [documentation officielle des modèles virtuels](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-virtual-models) confirme des exemples anonymes, dont un appel curl sans en-tête `Authorization`. Le mode anonyme doit être explicite et ne doit lire ni envoyer une clé éventuellement déjà stockée. Le mode authentifié est une autre configuration ; la présence d'une clé n'autorise pas sa sélection automatique.

La limite publiée de l'accès anonyme ne constitue pas un quota disponible pour IDA. Le contrôle réel effectué le 20 septembre 2026 a reçu HTTP 429 sans résultat : disponibilité non vérifiée, quota actuel indisponible. OVHcloud reste candidat préparé tant que le registre ne constate pas toutes les conditions requises. Les sélecteurs de modèles virtuels peuvent changer de cible et de tarif ; aucune affectation ne les épingle implicitement ni ne les traite comme une garantie de gratuité.

## Vérification

`apps/api/src/intelligence-assignments.test.ts` couvre les treize environnements, les préférences et replis, les données privées/secrètes, le consentement par fournisseur, les statuts et coûts, les capacités déclarées, la réserve Cerebras et l'absence de réseau/mutation/allocation. Cette tranche ajoute une information consultative ; aucun endpoint d'activation ni routeur parallèle.
