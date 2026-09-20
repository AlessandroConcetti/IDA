# MCP dans IDA — lecture documentaire bornée

## Périmètre livré

Le SDK TypeScript officiel MCP 2.0.0 est installé dans l'API : packages client, server et core épinglés. Les scripts d'installation tiers sont désactivés. L'adaptateur échange réellement des messages MCP avec un serveur écrit dans IDA, via `InMemoryTransport` : ni processus enfant, ni serveur distant, ni nouveau port. L'initialisation compatible du SDK est explicite (`versionNegotiation: legacy`). Il ne s'agit pas d'un serveur MCP public ni d'une connexion à Claude.

La première tranche possède deux outils en lecture seule :

- `READ_FILE_SCOPED` lit un document déclaré par identifiant.
- `SEARCH_FILES_SCOPED` recherche une expression littérale dans les documents déclarés et retourne des lignes sourcées.

Le runtime local configure deux documents non sensibles du projet : ce guide et le comparatif open source. Aucun dossier personnel, coffre, fichier `.env`, code source ou répertoire entier n'est autorisé. L'extension à des fichiers utilisateur nécessite un parcours de sélection et une revue distincts.

## Utilisation

Dans IDA déverrouillé, ouvrir **La Fabrique → Outils MCP → Charger les outils**. Choisir un document puis **Lire le document**, ou saisir une expression puis **Rechercher**. Le statut « configuré » ne prouve pas la lecture ; le panneau confirme une exécution seulement après réception d'un résultat valide.

Les résultats sont affichés comme texte non fiable, jamais comme HTML ou instructions à exécuter. Aucune requête au LLM ni mémoire automatique n'est déclenchée.

## Contrat API

`GET /v1/mcp/status` : session READ valide, état `DISABLED`, `PREPARED` ou `CONFIGURED`, outils et catalogue `{id,name}`. Vérification `NOT_PERFORMED` : ce diagnostic ne lit aucun fichier.

`POST /v1/mcp/call` : JSON strict de 1024 octets maximum :

```json
{"tool":"READ_FILE_SCOPED","resourceId":"mcp-guide"}
```

```json
{"tool":"SEARCH_FILES_SCOPED","query":"autorisé"}
```

Réponse `{data:{tool,untrusted:true,resourceId,text}}` ou `{data:{tool,untrusted:true,matches:[{resourceId,line,excerpt}]}}`. Aucun chemin physique dans les réponses. Session obligatoire ; 400 entrée inconnue, 401/403 droits insuffisants, 429 limite, 502/503 lecture indisponible. Pas de réponse factice de remplacement.

Le mode LOCAL_DEMO n'exécute rien. Le mode LOCAL_LOCK exige un binding serveur associé au workspace. Le relais privé conserve sa politique existante : ce POST n'est pas ajouté à son périmètre lecture seule. Le panneau MCP est donc prévu pour la session locale sur PC ; aucune ouverture de droit iPhone n'est implicite.

## Contrôles

Identité de session → membership/scope READ → allowlist Tool Gateway → binding workspace → audit REQUESTED → nouvelle vérification → appel MCP → validation de résultat → nouvelle vérification → audit SUCCEEDED → dernière vérification avant livraison.

Un seul appel à la fois, 60 appels/minute maximum, délai de cinq secondes, annulation à la déconnexion. Chaque appel possède une paire client/serveur indépendante, aucune mémoire/cache partagé entre utilisateurs, aucun sampling, elicitation, roots ou outil découvert automatiquement.

Maximum 16 fichiers autorisés, 64 Kio par fichier, UTF-8 strict, 20 extraits de 240 caractères. Pas de scan récursif, expression régulière, chemin libre, URL, UNC, ADS, traversée, lien symbolique/jonction ou lien physique multiple. Vérifications des ancêtres, chemins réels et identités de fichiers avant/après ouverture et lecture. **Limite :** Node portable ne garantit pas une ouverture atomique de tous les ancêtres ; le propriétaire doit protéger ces dossiers des écritures concurrentes hostiles. Cette tranche n'est pas une sandbox filesystem pour un agent tiers.

L'audit append-only ne conserve que outil, résultat, identifiants d'exécution/session/client/workspace, jamais requête recherchée, contenu de document ou chemin. Les échecs d'audit bloquent la livraison. Les tentatives rejetées avant autorisation ne produisent pas de lecture ; elles ne sont pas déclarées comme succès d'outil.

## Pas activé

WEB_READ / WEB_SEARCH : contrôle réseau et choix de fournisseur à revoir. CALENDAR_READ / EMAIL_READ / EMAIL_DRAFT : connexion/scopes requis. TASK_CREATE : outil d'écriture IDA existant à adapter avec idempotence. HOME_READ : conserver le pilote métier existant et ses prérequis ; pas de commandes domotiques par MCP. Aucun de ces sept outils n'est annoncé actif via MCP.

## Vérification et retour arrière

Tests dans `mcp-scoped-files.test.ts`, `mcp-adapter.test.ts`, `mcp-tools.test.ts`, `mcp-integration.test.ts` ; résultats de la session dans le comparatif. Tests sur documents synthétiques, API authentifiée en mémoire et protocole MCP réel, pas de fichiers privés.

Validation du 20 septembre 2026 : **103 tests MCP/API/panneau passés**, TypeScript API/Web et build réussis, lint ciblé propre. **3 tests Playwright passés dans Edge réel** : lecture/recherche depuis La Fabrique, absence d'exécution du HTML contenu dans le document, largeur 390 px, nettoyage après révocation de session. Fixture locale sur 127.0.0.1:8791, base mémoire, phrase synthétique, aucun profil personnel. La largeur mobile ne prouve pas l'accès MCP de l'iPhone.

Commande : `pnpm test:e2e` après build. Pas de téléchargement de navigateur ; Edge installé est requis. Aucune capture micro/caméra, aucun envoi cloud ; les connexions de la page hors de l'origine de fixture sont bloquées. Les screenshots d'échec éventuels concernent uniquement des données synthétiques dans un répertoire temporaire.

Pour désactiver : retirer uniquement `mcpFiles` de la composition locale puis redémarrer ; état PREPARED, exécution refusée. Aucun changement de base, de Core, de Tailscale ou de politique Windows à annuler. Les packages peuvent ensuite être retirés dans un changement dédié avec lockfile révisé.

Source : [SDK officiel](https://github.com/modelcontextprotocol/typescript-sdk). La licence des paquets publiés et les notices embarquées font foi ; le dépôt indique MIT pour le code existant et Apache-2.0 pour les nouvelles contributions v2.
