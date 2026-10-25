# IDA PRO — Cloud mutualisé, agents métier et GPT-6 Luna Max

**Décision produit — 25 octobre 2026. Statut : spécification APPROUVÉE, NON IMPLÉMENTÉE.**

> Périmètre : IDA PRO / La Fabrique uniquement. Ne pas changer implicitement la politique des modèles, des providers, de l'identité ou du fonctionnement local de l'IDA personnel. Aucun déploiement ni abonnement n'est autorisé par ce document.

## 1. Décision ferme

- Fournir chaque module métier IDA PRO (menuiserie, commerce, coiffure, etc.) comme espace client sécurisé sur une plateforme cloud **mutualisée** gérée par IDA Studio.
- **Un seul modèle génératif autorisé pour IDA PRO : `gpt-6-luna`**, avec **`reasoning.effort: "max"`**, API **Responses**, mode de traitement standard. **Pas de Sol, pas d'Astra, pas de fallback vers un autre modèle**, même en cas d'indisponibilité. Quand Luna est indisponible : erreur claire, nouvelle tentative manuelle sécurisée ou parcours métier non-IA.
- `max` est un niveau d'effort de raisonnement du même modèle, **pas un autre modèle** ni un forfait illimité. Les tokens de raisonnement sont facturés en sortie : toujours borner `max_output_tokens` et mesurer la dépense par tâche.
- L'utilisateur final **n'a pas besoin de compte ChatGPT, Codex ni de clé API**. L'API OpenAI est appelée exclusivement par le backend IDA PRO. Les abonnements ChatGPT/Codex personnels ne remplacent pas la facturation API.
- Les actions déterministes (calculs de devis, TVA, stock, sauvegarde, validation de prix, agenda, permissions, factures) sont réalisées par du code métier : **aucun appel LLM injustifié**.
- Les agents métier sont **des capacités contrôlées du même Core**, pas des bots autonomes exposés à Internet. Toute action externe ou engageante nécessite une approbation humaine explicite.
- Ne pas promettre « IA gratuite à vie ». Offre commerciale possible : **12 mois d'IA inclus avec plafond contractuel**, renouvellement ou paiement de dépassements **uniquement avec consentement explicite**.

## 2. Flux fonctionnel visé

1. Client se connecte à son espace entreprise (identité réseau vérifiable, sessions révocables, MFA administrateur).
2. Backend résout l'acteur, les rôles, `tenant_id` / `workspace_id`, l'abonnement et les permissions ; ne fait jamais confiance à un identifiant de tenant choisi par le navigateur.
3. Module métier demande une action à un agent déclaré et versionné (ex. menuisier : suggérer un devis).
4. Tool Gateway vérifie périmètre, consentement de sortie des données, schéma, politique de dépense et demande d'approbation ; le modèle ne reçoit ni secret ni accès SQL.
5. Service IA serveur appelle seulement `gpt-6-luna` avec `reasoning: { effort: "max", mode: "standard" }` et un maximum de tokens calibré par opération. Les résultats sont considérés non fiables et validés structurellement et métier.
6. Prévisualisation de l'action ; décision humaine pour tout envoi, toute signature, toute dépense, publication, suppression importante ou engagement envers un tiers.
7. Effet métier serveur autorisé, avec idempotence, journal d'audit et comptabilisation de l'usage réel.

## 3. Architecture technique cible (à développer, pas à déployer depuis cette décision)

```text
Navigateur / PWA / module métier IDA PRO
        │ HTTPS + session et permission entreprise
        ▼
IDA PRO Cloud — API Node.js/Fastify (service mutualisé)
   ├─ Identity + Tenancy + RBAC / approbations
   ├─ Modules métier, règles déterministes et Tool Gateway
   ├─ Agent Registry (manifeste + outils + contexte + tests)
   ├─ Metering/Quota (pré-réservation, plafond, réconciliation)
   ├─ AI Gateway allowlist : gpt-6-luna / effort=max uniquement
   └─ Audit, monitoring, contrôle des erreurs
        │                         │
        ▼                         ▼
PostgreSQL managé         OpenAI Responses API
(tenant/workspace          (clé serveur uniquement,
isolés, backups)           consentement cloud, données minimisées)
```

- Monolithe modulaire existant conservé ; pas de microservice ou base par client sans besoin prouvé.
- PostgreSQL managé en cloud ; **PGlite et `LOCAL_LOCK` / `LOCAL_DEMO` ne sont pas une authentification ni une base de production réseau**. Ne **jamais** exposer en public le runtime de démonstration local.
- Ajouter vraie identité réseau, provisioning client, autorisations à chaque lecture/écriture et validation côté serveur ; index/contraintes de périmètre et tests anti-accès croisés, y compris objets stockés et fichiers.
- Migrations répétables, stockage privé pour documents, TLS, sauvegardes restaurables, stratégie de restauration testée, secrets chiffrés/rotatifs, limitation de débit, protection contre abus et prompt injection, journal redacted ; aucune donnée d'un autre client dans un contexte IA.
- DPA/contrats de sous-traitance, analyse des finalités, durée de conservation, sous-traitants, droits RGPD et transferts ; **région Render Francfort ne signifie pas, à elle seule, traitement du modèle en UE**. Vérifier et configurer l'option de résidence régionale OpenAI applicable, avec éventuelle majoration, avant des données client réelles.

## 4. Budget client avec plafond bloquant

Paramètres de produit proposés (**non encore codés**) : `ai_included_eur_month=5.00`, `ai_hard_cap_eur_month=5.00` par tenant en pilote ; modifiables par contrat. Si le plafond contractuel est atteint : blocage des nouveaux appels IA, préavis dans l'interface, fonctions classiques continuent de marcher. Pas de facture surprise ni de surcoût automatique, et un **budget global plateforme** doit également limiter l'exposition d'IDA Studio.

- Pré-estimer de façon prudente le pire coût autorisé d'une requête (`max_output_tokens`, contexte, retries et surcoûts éventuels) et le **réserver atomiquement**, y compris en concurrence ; refus en cas de solde insuffisant.
- Après réponse, enregistrer les tokens réels (entrée, cache, sortie y compris raisonnement), tarif versionné, coût et identifiant de tentative ; réconcilier réservation/consommation. En cas d'erreur ou de timeout ambigu, ne pas faire de remboursements naïfs ou de retries illimités.
- Quotas additionnels : requêtes/minute, requêtes simultanées, entrée max, longueur des pièces jointes, temps maximum et coût maximal par tâche ; tests de charge et d'abus.
- Devise facturée en USD au fournisseur ; conversion EUR et taxes explicites côté facturation commerciale. **Les 4,82 € pour 2 000 dossiers/mois sont une hypothèse de simulation, pas une garantie** : mesurer un échantillon représentatif, surtout avec `effort=max`.
- Les budgets/alertes natifs chez le fournisseur ne remplacent **jamais** le plafond bloquant du serveur IDA PRO.

## 5. Procédure de création du cloud — scénario Render proposé

**Préparation — Codex, sans provisionner :**
1. Vérifier la structure actuelle de l'API et des modules IDA PRO, la compatibilité Node/pnpm et les états réels ; documenter les écarts, ne pas présenter le service comme prêt à déployer.
2. Implémenter/tester hors production : identité réseau, séparation clients, DB PostgreSQL, migrations, agents et gateway Luna uniquement, plafonds bloquants, audit, conformité minimale, santé HTTP ; environnements `dev`, `staging`, `production` séparés.
3. Construire une configuration de déploiement reproductible **sans secret** et sans auto-déploiement vers les services déjà en production (si Blueprint Render : `autoDeployTrigger: off`). Ne pas toucher aux autres repos, services Render, DNS ou sites existants sans accord.
4. Prévoir guides exacts de `build`, `start`, `migrate` et `healthcheck` après inspection du package réel : ne pas inventer des commandes.

**Provisionnement humain dans Render, après validation et chiffrage :**
1. Dans [Render Dashboard](https://dashboard.render.com), créer **un projet/environnement IDA PRO distinct** des sites en service, choisir **Frankfurt** pour le backend et pour la base.
2. Créer une base [Render Postgres](https://render.com/docs/postgresql-creating-connecting) payante, privée quand possible, dotée d'un plan de sauvegarde/restauration ; la connexion de l'API utilise la **chaîne interne** si les deux ressources sont dans la même région.
3. Créer un [Web Service](https://render.com/docs/web-services) Node ou Docker depuis le dépôt/branche explicitement dédié au backend IDA PRO ; configurer build/start/healthcheck selon les scripts réellement présents, désactiver le déploiement automatique au départ.
4. Ajouter les **secrets dans le dashboard** ou son gestionnaire de secrets (pas dans GitHub ni dans le frontend) : clé API d'un **projet OpenAI dédié à IDA PRO**, `DATABASE_URL`, secret de session et autres paramètres confirmés par Codex ; créer/limiter l'usage API côté fournisseur.
5. Paramètres d'intention à implémenter (noms d'environnement **indicatifs, non garantis déjà supportés**) : `IDA_PRO_CLOUD_ENABLED=false` par défaut, `OPENAI_MODEL=gpt-6-luna`, `OPENAI_REASONING_EFFORT=max`, `OPENAI_REASONING_MODE=standard`, `IDA_PRO_AI_EUR_MONTHLY_CAP=5.00` pour le pilote. Aucun modèle alternatif configurable.
6. Déployer **en staging d'abord**, exécuter migrations réversibles et tests, valider sauvegardes, métriques, ressources/coûts Render (backend, base, stockage, bande passante) puis demander validation humaine séparée pour production, noms de domaine et client réel.
7. L'interface du module client pointe uniquement vers l'API HTTPS sécurisée et ne contient jamais la clé OpenAI ni la connexion PostgreSQL.

**Liens de référence (vérifiés le 25/10/2026) :**
- GPT-6 Luna : https://developers.openai.com/api/docs/models/gpt-6-luna
- Tarifs API : https://developers.openai.com/api/docs/pricing
- Reasoning / facturation des tokens : https://developers.openai.com/api/docs/guides/reasoning
- Render régions : https://render.com/docs/regions
- Render Web Services : https://render.com/docs/web-services
- Render Postgres : https://render.com/docs/postgresql-creating-connecting
- Render Blueprints : https://render.com/docs/blueprint-spec

## 6. Plan d'exécution Codex — tranches courtes

- **T0 / Audit** : identifier les vrais repos, services Render existants et chemins concernés (lecture seule) ; état vérifiable des modules métier, identité, Postgres, router, security gate ; ne toucher à rien hors périmètre.
- **T1 / Identité & données** : tenant / workspace isolés, provisionnement, rôles et tests d'accès croisé sur deux clients fictifs ; préserver les chemins locaux existants.
- **T2 / Luna seulement** : fournisseur `gpt-6-luna`, Responses, `effort=max`, limites par appel, validateur de sorties, consentement cloud explicite, aucun autre modèle ni fallback ; tests avec transport simulé et pilote réel borné après accord.
- **T3 / Metering** : réservation atomique, réconciliation tokens, quotas par tenant et plafond global, gestion des requêtes concurrentes et des échecs ; tableau de consommation.
- **T4 / Parcours menuiserie** : demande de devis → données autorisées → suggestion IA → contrôle des prix calculés par code → approbation → action explicite → audit ; états d'indisponibilité, essais E2E navigateur.
- **T5 / Staging cloud** : plan Render isolé, variables/secrets, migration, backups, coût complet documenté, test de restauration, supervision, checklist RGPD.
- **T6 / Recette** : tests anti-tenant crossover et injections, panne Luna, plafond atteint, rollback, accessibilité, UX mobile, coûts mesurés sur un jeu de dossiers représentatif ; **production uniquement après autorisation distincte**.

## 7. Conditions de réception

- Deux clients fictifs ne peuvent jamais consulter ni faire traiter par l'IA les données l'un de l'autre.
- Aucun appel `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6-astra` ou autre modèle depuis IDA PRO, même sur panne, et aucun appel IA en mode `NORMAL` / IA désactivée.
- L'effort `max` est présent sur **tous** les appels métier Luna ; un appel non conforme est refusé côté serveur. Quotas par requête et par mois respectés en concurrence.
- Aucune API key, secret, prompt privé ou donnée sensible dans les bundles frontend, erreurs, logs, commits.
- Aucun envoi de devis, paiement, publication ou suppression sensible sans accord humain ; audit non altérable.
- Démontrer coût réel sur scénarios pilotes ; distinguer prix API / coût serveur / base / stockage / taxes, ne pas présenter une simulation comme facture.
- Jamais modifier un site Render existant ou le DNS sans demande explicite de l'utilisateur.
- Les tranches et tests sont documentés avec **preuves**, aucune capacité « opérante » tant qu'elle n'est pas réellement reliée/testée.
