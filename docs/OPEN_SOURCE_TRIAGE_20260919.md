# IDA — triage open source et prochaine tranche MCP

Création : 19 septembre 2026 ; mise à jour d'implémentation le 20 septembre 2026. `USE` désigne une brique retenue, `ADAPT` des éléments à intégrer derrière les contrats IDA, `REFERENCE` une source d'étude et `REJECT` une intégration écartée pour cette tranche. **Installés : MCP client/core/server 2.0.0 et Playwright 1.63.0.** Aucun serveur MCP tiers, compte cloud ou accès réseau public activé. Installation sans scripts tiers ; versions existantes épinglées pour éviter une mise à jour générale involontaire.

## Preuves de la tranche livrée

- 103 tests MCP/API/panneau réussis, dont 4 scénarios avec API authentifiée et protocole MCP réel.
- 84 tests affectations/registres/coffre réussis, soit 187 tests ciblés au total. Les affectations sont consultatives, pas une activation des fournisseurs.
- TypeScript API/Web et build réussis. Audit de production : aucun avis de vulnérabilité retourné pour les 97 dépendances examinées ; ce résultat n'est pas un audit de sécurité exhaustif.
- Panneau accessible dans La Fabrique → Outils MCP ; lecture et recherche sur deux documents de projet explicitement autorisés. Voir [MCP_INTEGRATION.md](MCP_INTEGRATION.md).
- Playwright utilise Edge installé et des données synthétiques, sans téléchargement de navigateur ni profil personnel. **3 tests E2E réussis** : parcours MCP réel, largeur mobile 390 px, révocation de session et nettoyage. Le port 8791 n'est ouvert que pendant la fixture, sur loopback.

## Décision courte

Conserver le monolithe API-first, `IdentityAccessPolicy`, le `ToolGateway`, les approbations et l'audit IDA. Ajouter un adaptateur MCP fin derrière ces contrôles, sans adopter un nouveau runtime d'agents. Première tranche : lecture d'une ressource de test explicitement autorisée, via un transport mémoire, sans exécution de processus ni réseau. Les démons autonomes, mémoires automatiques et moteurs de workflows complets restent en revue.

Le SDK officiel MCP **2.0.0** est installé avec ses packages séparés client/core/server. Métadonnées, versions, intégrités et graphe de dépendances examinés avant installation ; transport mémoire uniquement. [SDK TypeScript officiel](https://github.com/modelcontextprotocol/typescript-sdk)

## État local réellement inspecté

- `packages/domain/src/tool-policy.ts` : allowlist explicite `{toolKey,moduleKey,permission}`, refus des outils inconnus, politique d'approbation et refus `SYSTEM` sans politique dédiée. Ce composant seul n'authentifie pas une session.
- `apps/api/src/app.ts` : composition existante `assertRequestPermission` → `assertToolAuthorized`, révalidation de session/workspace pour les lectures, outils métier déjà déclarés. Réutiliser ce chemin, ne pas exposer directement `ToolGateway.authorize` comme frontière HTTP.
- `apps/api/src/core-intelligence.ts` : `CoreIntelligence` et `ProviderRouter` séparent proposition IA et exécution ; contrôle d'identité et de scope existant.
- `apps/api/src/home-device.ts` : pilote Home Assistant en lecture seule, lié à un workspace et une entité, secret côté serveur, états de prérequis explicites. Ne pas remplacer ce contrat par un serveur domotique généraliste.
- `apps/api/package.json` : trois dépendances MCP épinglées. Adaptateur `mcp-adapter.ts`, lecture bornée `mcp-scoped-files.ts` et routes `mcp-tools.ts` désormais présents.

## Projets demandés : décision et limites

| Projet / source primaire | Choix IDA | Licence / nature constatée | Justification et état |
|---|---|---|---|
| [Claude Code](https://github.com/anthropics/claude-code/blob/main/LICENSE.md) | REFERENCE | Logiciel soumis aux conditions commerciales Anthropic ; dépôt public ≠ moteur OSS réutilisable | Étudier UX des autorisations et outils de développement. Pas de copie du moteur ni de remplacement du Core. Pas d'installation utile à la tranche actuelle. |
| [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript#license-and-terms) | REFERENCE | Conditions commerciales Anthropic pour l'utilisation du SDK, exceptions par composant | Peut lancer des agents de code et commandes ; doublonne orchestration et permissions IDA. `NEEDS REVIEW` pour éventuel worker isolé de La Fabrique, sans credentials de session utilisateur hérités. |
| [LM Studio](https://lmstudio.ai/docs/app), [conditions](https://lmstudio.ai/app-terms), [CLI](https://lmstudio.ai/docs/cli) | REFERENCE | Application propriétaire ; interfaces documentées ; CLI `lms` MIT | Alternative locale via API publiée, pas un nouveau cerveau obligatoire. Conserver Ollama/Qwen déjà intégré. Installer un second moteur ne résout pas le wiring et consomme disque/RAM. |
| [sosoj92/jarvis-assistant-vocal](https://github.com/sosoj92/jarvis-assistant-vocal) | ADAPT | [MIT](https://github.com/sosoj92/jarvis-assistant-vocal/blob/main/LICENSE) ; Python | Dépôt identifié pour « sosoj92/JARVIS ». Sa sélection indépendante du LLM et de la voix constitue une référence d'adaptation ; aucun code encore porté par ce triage. Ne pas lancer son assistant, wake word, outils PC ou installateur. Conserver attribution et licence de tout extrait repris. |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | REFERENCE | MIT ; runtime autonome Python | Intéressant pour outils/évaluations et délégation ; mémoire auto-évolutive, exécution et orchestration parallèles ne correspondent pas aux frontières actuelles. `NEEDS REVIEW`, pas d'installation du runtime. |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | REFERENCE | MIT ; assistant et écosystème d'intégrations | Étudier adaptateurs et garde-fous. Aucun démon, canal de messagerie, plugin ou installateur automatique : ce serait une seconde plateforme avec ses propres autorisations. |
| [yoloshii/ClawMem](https://github.com/yoloshii/ClawMem) | REFERENCE | MIT pour ce dépôt candidat ; licences distinctes des modèles | `BLOCKED_IDENTITY` : ce dépôt existe, mais son identité comme projet demandé n'est pas confirmée ; aucune substitution sur le seul nom. Hooks, mémoire dérivée, recherche hybride et inférence locale supplémentaire. L'auto-capture ne respecte pas les états de consentement IDA ; pas d'import global des conversations ni de téléchargement de modèles. |
| [MCP / SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk) | USE | v2 : contributions nouvelles Apache-2.0, code existant MIT selon README | `INSTALLED / TESTED` : client/core/server 2.0.0, deux outils bornés, aucun transport réseau ou processus tiers. |
| [Mastra](https://github.com/mastra-ai/mastra) | REFERENCE | [Apache-2.0 hors exceptions ; répertoires `ee/` sous licence entreprise](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md) | Workflows, agents et évaluations utiles comme comparaison. Intégrer le framework complet introduirait une orchestration parallèle. Besoin d'ADR avant toute adoption structurante. |
| [LangGraph.js](https://github.com/langchain-ai/langgraphjs) | ADAPT | MIT | Retenu devant Mastra pour un futur workflow borné de La Fabrique : paquets examinés langgraph 1.4.16/core 1.2.12, surface directe plus petite. `PLANNED`, non installé : priorité utilisateur actuelle aux branchements et usages, aucune deuxième mémoire ni autorité d'exécution. |
| [Playwright](https://github.com/microsoft/playwright) | USE | Apache-2.0 | `INSTALLED` : @playwright/test 1.63.0 et ses deux dépendances, sans script d'installation ni navigateur téléchargé. E2E MCP avec Edge isolé, pas un navigateur autonome de production. |
| [Browser Use](https://github.com/browser-use/browser-use) | REFERENCE | Bibliothèque MIT ; inférence et navigateurs cloud peuvent être facturés | Agents navigateur plus autonomes que nécessaire ; séparer bibliothèque locale des services payants. Pas de synchronisation de profil, de cookies, de proxy ou de résolution CAPTCHA automatique dans IDA. |
| [OpenOSINT/OpenOSINT](https://github.com/OpenOSINT/OpenOSINT) | REJECT | MIT ; certains services externes payants | Rejet pour l'intégration actuelle, pas jugement universel : cible investigations, énumération de comptes et outils système externes, alors que le besoin immédiat est recherche web/documentaire. Tout futur usage exige cible autorisée, périmètre et revue privée distincts. |
| [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai) | REFERENCE | Bibliothèque MIT ; service API séparé payant | Extraction assistée possible, mais pile navigateur/Python/LLM supplémentaire. API officielle d'abord selon AGENTS.md ; extraction ciblée seulement sans API, avec autorisation, SSRF contrôlé, limites et provenance. Pas de crawl général. |
| [n8n](https://github.com/n8n-io/n8n), [MCP officiel](https://docs.n8n.io/connect/connect-to-n8n-mcp-server) | REFERENCE | [Fair-code/source-available : Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) et licence entreprise | Serveur, credentials et moteur de workflows supplémentaires. Le MCP permet aussi création/édition et exécution : une connexion ne doit jamais être traitée comme lecture seule. `NEEDS REVIEW` avant déploiement ; adaptateur possible pour workflows explicitement autorisés. |
| [Make](https://www.make.com/en/pricing) | REJECT | SaaS commercial avec offre gratuite limitée | Rejet comme brique locale/open source : délègue données et exécution à un tiers, ajoute limites et dépendance externe. À reconsidérer pour un connecteur précis demandé, pas pour le Core. |
| [Zapier](https://zapier.com/pricing) | REJECT | SaaS commercial avec offre gratuite limitée | Même décision : pas une bibliothèque embarquable. Ne pas confondre accès MCP et gratuité/confidentialité du service sous-jacent. |
| [Post for Me](https://github.com/DayMoonDevelopment/post-for-me), [MCP officiel](https://www.postforme.dev/resources/ai-integration-using-the-mcp-server) | REFERENCE | Plateforme publique [AGPL-3.0](https://github.com/DayMoonDevelopment/post-for-me/blob/main/LICENSE) ; [service hébergé payant](https://www.postforme.dev/pricing) ; licence du package MCP distinct à vérifier | Correction : ce n'est pas uniquement une API propriétaire. Le site officiel relie ce dépôt auto-hébergeable ; les obligations AGPL doivent être évaluées avant reprise de code. Le MCP documenté expose recherche documentaire et exécution de code SDK. Aucun composant installé ; pas de `npx ...@latest`, pas de token social partagé ; approbation finale humaine obligatoire pour publier. |

Les licences ci-dessus sont des observations des sources primaires consultées le 20 septembre 2026, pas une garantie pour toute dépendance transitive/version future. La licence du dépôt, celle d'un package SDK/MCP, celle des poids et les conditions d'un service hébergé sont quatre vérifications distinctes. Les identités ambiguës restent bloquées.

## Autres briques pertinentes et couverture fonctionnelle

Les 21 domaines demandés sont regroupés ci-dessous ; une décision documentaire n'active aucun outil.

| Domaine | Brique / décision | Intégration proposée |
|---|---|---|
| MCP | SDK officiel — USE | Adaptateur fin et protocole réel selon le jalon ci-dessous ; transport et autorisation restent deux responsabilités distinctes. |
| Browser automation | Playwright — USE ; Browser Use — REFERENCE | Tests E2E d'abord ; aucun outil navigateur de production déclaré actif par ce triage. |
| OSINT | OpenOSINT — REJECT pour cette tranche | L'investigation sur des cibles et l'exécution de binaires ne répondent pas au besoin immédiat de recherche documentaire. |
| Local LLM | [Ollama](https://github.com/ollama/ollama) — USE, MIT | Conserver l'adaptateur existant et le modèle épinglé ; ne pas télécharger un autre modèle ici. Licence des poids indépendante du moteur. |
| Home automation | [Home Assistant](https://github.com/home-assistant/core) — USE, Apache-2.0 ; [API REST](https://developers.home-assistant.io/docs/api/rest/) | Réutiliser le pilote IDA à entités autorisées. Lecture n'accorde jamais commandes, caméras ou serrures. Pas de second Home Assistant installé. |
| Observability | [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js) — ADAPT, Apache-2.0 | Spans locaux minimaux durée/résultat/identifiant de corrélation ; pas de prompts, audio, secrets ni export cloud automatique. `PLANNED`, pas installé par cet audit. |
| Evaluation | [Promptfoo](https://github.com/promptfoo/promptfoo) — REFERENCE, MIT | Comparaisons hors production sur fixtures synthétiques ; garder Vitest pour permissions et isolation. Ne pas supposer que modèles/juges externes sont gratuits ou locaux. |
| Email / Calendar | [Gmail API](https://developers.google.com/workspace/gmail/api/guides), [Microsoft Graph](https://learn.microsoft.com/en-us/graph/overview) — ADAPT | API officielles derrière ports métier, OAuth à scopes minimaux. Ce sont des services, pas de nouveaux OSS locaux. Lecture et brouillon séparés ; envoyer/inviter/supprimer exclus de la première tranche. |
| Agent runtime / Multi-Agent | Registry et orchestration IDA — USE | Manifeste de chaque agent, outils/contextes bornés, aucune boucle autonome permanente importée. Mastra/LangGraph/Hermes servent de références. |
| Memory / Human-in-the-loop | Mémoire et approbations IDA — USE | Conserver PENDING/CONFIRMED/REJECTED et approbation liée à l'action réelle ; pas de mémoire auto-confirmée par MCP. |
| Filesystem | Adaptateur scoped IDA + SDK MCP — ADAPT | Ressources enregistrées par workspace, pas de chemin arbitraire fourni par le modèle. Contrôles de liens/reparse points et limites de taille avant octets. |
| Web research / Scraping | WEB_SEARCH et WEB_READ distincts — ADAPT | Choisir plus tard un fournisseur officiel et budget vérifié. WEB_READ : schémas/hosts autorisés, protections SSRF/redirections, contenu externe non fiable. Aucune recherche factice si aucun provider. |
| Code execution | Aucun moteur ajouté — REJECT pour activation immédiate | Une bibliothèque de VM JavaScript ne constitue pas une isolation système. Sandbox, permissions, ressources, réseau et secret-free worker exigent revue séparée. |
| Workflows / Automation | Jobs et contrats IDA existants — USE | Plans déclaratifs, limites d'étapes, idempotence ; n8n reste une option externe et non une refonte. |
| Social media | Connecteurs officiels + approbation IDA — ADAPT | Lire/préparer avant publier ; MCP ne supprime pas OAuth, règles des plateformes ou validation humaine. |
| Voice | Provider de synthèse IDA — USE | Priorité à la tranche ElevenLabs demandée, consentement au texte envoyé et arrêt au quota gratuit. Aucun agent tiers nécessaire pour lire une réponse. |

## Plan d'implémentation MCP appliqué

**État : IMPLEMENTED / TESTED pour les deux outils de lecture.** Les étapes ci-dessous décrivent le périmètre appliqué ; aucune généralisation à d'autres outils.

1. Vérifier dans le registre le package client officiel MCP v2 publié et ses métadonnées (version exacte, intégrité, exports, scripts, dépendances, avis de sécurité). Épingler la version retenue dans `@ida/api`, conserver le lockfile ; aucun installateur global, aucun script de cycle de vie tiers exécuté sans revue. Si la revue échoue : `BLOCKED_DEPENDENCY_REVIEW`.
2. Ajouter un port/adaptateur fin API, et un transport mémoire local de test. Ne pas enregistrer d'URL MCP arbitraire, de commande shell, d'outil découvert automatiquement ni de serveur MCP public. Le serveur de fixture est du code IDA contrôlé ; si un package serveur est nécessaire aux tests, le traiter comme dépendance de développement distincte à revoir.
3. Premier nom public `READ_FILE_SCOPED`, mappé explicitement à un outil IDA autorisé ; entrée par identifiant de ressource et workspace courant, pas par chemin libre. Lire uniquement une fixture non sensible créée pour le test, dans une racine bornée. Un nom de tool/annotation `readOnlyHint` reçu d'un serveur ne donne aucun droit.
4. Exécution : identité actuelle → appartenance et scope → ToolGateway → politique et éventuelle approbation → appel MCP borné → validation de sortie → nouvelle vérification avant livraison → audit append-only sans contenu privé.
5. Tests : inconnu refusé sans appel transport, workspace voisin refusé, session révoquée avant/après appel refusée, traversée/chemin absolu/UNC/ADS/liens sortants refusés, timeout/annulation, taille maximale, résultat malformé, injection dans descriptions ignorée, audit des refus et succès. Aucun test ne lit de fichiers personnels.
6. Condition de fin honnête : échange MCP réel avec fixture et tests de refus réussis ; **pas** « tous les outils MCP connectés ». Rollback : désactiver la composition/adaptateur et restaurer uniquement ses fichiers/versions, sans toucher les données ni le Core.

Les roots MCP décrivent le périmètre communiqué à un serveur ; IDA doit toujours appliquer sa propre autorisation sur les accès réels. [Spécification Roots](https://modelcontextprotocol.io/specification/2026-07-28/client/roots)

## Ordre des outils demandés après ce jalon

| Outil | Priorité / état | Prérequis restant |
|---|---|---|
| READ_FILE_SCOPED | 1 — IMPLEMENTED / TESTED | Deux documents du projet autorisés, pas de fichiers utilisateur implicites |
| SEARCH_FILES_SCOPED | 2 — IMPLEMENTED / TESTED | Recherche littérale, 20 extraits maximum, pas de scan du PC |
| HOME_READ | 3 — PREPARED côté métier | Brancher le contrat de lecture déjà présent, prouver API réelle, aucune commande d'appareil |
| CALENDAR_READ | 4 — PLANNED | Source réelle et OAuth/scopes ou calendrier local attesté ; pas d'événements inventés |
| TASK_CREATE | 5 — PREPARED côté métier | Réutiliser `create_task` WRITE, validation et idempotence. Ce n'est pas une lecture même si peu critique |
| WEB_READ | 6 — NEEDS REVIEW | Egress/SSRF, redirections, taille, provenance, contenu non fiable |
| WEB_SEARCH | 7 — NEEDS REVIEW | Provider officiel, budget/quota, confidentialité de la requête |
| EMAIL_READ | 8 — NEEDS REVIEW | Compte/scopes/consentement ; contenu sensible et pièces jointes non fiables |
| EMAIL_DRAFT | 9 — NEEDS REVIEW | Brouillon WRITE seulement, destinataires validés, idempotence, jamais `send` implicite |

La liste n'est ni une allowlist active ni une autorisation d'installer ses serveurs. Aucun outil ne contourne `IDENTITY → PERMISSIONS → POLICY → APPROVAL → EXECUTION → AUDIT`.
