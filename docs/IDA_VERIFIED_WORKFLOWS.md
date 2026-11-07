# IDA — Fondations vérifiées Harness + Loop + Graph (07/11/2026)

**Statut : fondation interne en branche isolée, NON livrée aux utilisateurs.** Ne pas merger ni déployer sans validation. `main`, les sites commercialisables, les manifestes PLANNED et les connexions existantes restent inchangés.

## Réutilisation avant ajout

- Harness : `AgentRegistry`, `ToolGateway`, `IdentityAccessPolicy`, `CoreIntelligence`, `EnvironmentIntelligence`, `ProviderRouter`, audit et contrôles de mémoire existants. Ne pas les dupliquer.
- Fabrique : `creative_dossier_records`, `creative_plan_progress`, tâches, routes `/v1/creative/*` et UI existantes ; ne pas créer un deuxième dossier ou un deuxième moteur de rendu.
- Growth : `docs/IDA_GROWTH_CONVICTION_ENGINE.md` et `docs/IDA_GROWTH_JOURNEYS_V1.json` sont des **spécifications**, pas un CRM opérationnel connecté. Le CRM historique externe ne doit pas être recréé sous forme de données fictives.
- Les fournisseurs IA et leurs allocations/budgets restent contrôlés par `ProviderRouter` ; zéro fallback cloud non consenti.
- Aucun agent n'est activé par cette tranche. Aucune nouvelle dépendance, route HTTP, table, dépense, automatisation, email, publication ou déploiement.

## Ce qui est codé dans cette tranche

`packages/domain/src/verified-workflow.ts` : graphe explicite de nœuds et d'arêtes, transitions NEXT/COMPLETE/PAUSE, arrêt au nombre maximal de passages, délai et annulation, ré-autorisation avant et après chaque passage, transfert borné d'état, checkpoint CAS injecté et version de graphe épinglée.

L'état `IN_FLIGHT` est intentionnellement **non relançable automatiquement** après erreur ou redémarrage : le statut d'une action potentiellement externe est incertain. Toute reprise nécessite une procédure de réconciliation, une clé d'idempotence côté service métier et une approbation conforme à la policy. Ne pas convertir ce statut en succès ni en retry automatique.

Les tests `packages/domain/src/verified-workflow.test.ts` parcourent en mémoire deux mini-graphes synthétiques **sans intégration métier ni interface** :
- IDA Growth : découverte sans site non concluante, site réellement trouvé prioritaire, absence seulement après validation humaine explicite. L'envoi de prospection reste interdit.
- Fabrique : tests techniques, preuves visuelles desktop/mobile, validation du propriétaire ; succès = dossier de reprise contrôlée, **jamais publication ou mise en ligne**.
- Échecs : permission refusée par Tool Gateway, arête interdite, boucle bornée, version incompatible, étape en vol non rejouée.

**Ces tests sont des scénarios d'intégration internes simulés : ils ne constituent ni un E2E navigateur, ni un E2E production.** Aucune suite n'a été exécutée depuis cette interface GitHub ; Codex doit lancer la recette et publier les preuves.

## Branchement à faire par Codex, sans surcouche

1. **Adapter CAS PostgreSQL/PGlite** dans l'API existante : workspace + runId uniques, revision atomique, statut, étape, version, état borné et chiffré si privé. Contrôler les ressources du workspace au chargement ; interdiction d'accepter le scope fourni par le navigateur comme autorité. Tester deux workers concurrents, redémarrage, perte de base, collision d'idempotence et version migrée. Ne pas stocker de secrets, prompts privés ou sortie brute dans l'audit.
2. **Autorité serveur** : injecter depuis le Core la relecture Identity, session, rôle, Agent Registry si agent actif, Tool Gateway, approbation et politique d'egress, à chaque étape. Ne pas permettre à un graph ou à un LLM de déclarer son propre rôle/permission.
3. **Premier adaptateur Growth réel** : source de CRM explicitement disponible + preuves datées/attribuées + déduplication + `VERIFIED_PRESENT / NO_SITE_CANDIDATE / VERIFIED_ABSENT / UNKNOWN`. `VERIFIED_ABSENT` exige la validation explicite d'un responsable et une preuve vérifiable ; le simple fait de ne pas trouver de site ne suffit pas. Aucun contact, mail, campagne ou vente automatique.
4. **Premier adaptateur Fabrique réel** : réutiliser le dossier, les tâches, les progressions et les suites de tests actuelles. Exiger des résultats build/tests, captures Playwright desktop ET mobile, comparaison visuelle, validation manuelle et checkpoint Git avant `READY_FOR_REVIEWED_HANDOFF`. Déployer uniquement via une autre action explicitement autorisée et contrôlée.
5. **Reprise opérateur** : le statut `IN_FLIGHT` ouvre une investigation de l'effet externe éventuel ; ne pas ré-exécuter silencieusement. Une reprise `PAUSED` ne doit pas devenir une approbation implicite. Enregistrer qui, quand, pour quelle révision et quelle preuve.
6. **UX minimale réelle** dans Growth et Fabrique selon le Design System existant : mission, étape, état, raison d'arrêt, preuve et action humaine possible. Pas de dashboard fictif, pas de nouvelle refonte.
7. **Mesures réelles** : par mission, passages, appels de modèles, tokens mesurés si disponibles, durée, erreurs, étapes reprises et réussite métier. Ne pas présenter des estimations comme des consommations facturées.

## Matrice E2E requise avant merge

| Parcours | Chemin complet à vérifier | Cas de refus / reprise |
| --- | --- | --- |
| Growth A sans site | UI → API → Core/Identity/Gateway → CRM réel → preuves → approbation → snapshot → lecture après redémarrage | Une seule source, site découvert, doublon, session révoquée, preuve expirée, concurrent, CRM indisponible |
| Growth B refonte | URL existante → audit réel → preuve datée → proposition | Aucune mesure, site disparu, contenu tiers hostile, URL malformée |
| Growth C IDA PRO | Besoin métier → connecteur autorisé → proposition sans action externe | Quota, absence de clé, demande hors périmètre, approbation absente |
| Growth D expansion | Contrat/client existant → besoin observé → offre contextualisée à valider | Simple prospect non-client, consentement absent, service indisponible |
| Fabrique | UI → tâche et dossier réels → génération/plan → tests → captures desktop/mobile → revue → checkpoint → lecture après redémarrage | Build rouge, captures manquantes, écart visuel, permission refusée, fournisseur indisponible, rollback |
| Transversal | Workflow relu après redémarrage, entre deux appareils autorisés lorsque l'identité distante sera prête | Réponse tardive, double clic, deux workers, annulation, version de graphe changée, budget dépassé |

`pnpm exec vitest run packages/domain/src/verified-workflow.test.ts`, `pnpm typecheck`, `pnpm lint` et `pnpm test` sont les commandes de recette prévues. Le `pnpm test:e2e` actuel ne cible que `mcp.spec.ts` : **ne pas annoncer les parcours Growth/Fabrique comme E2E navigateur** tant que la configuration Playwright, les fixtures isolées et les scripts E2E dédiés n'ont pas été ajoutés et exécutés. Le seuil est : parcours utilisateur réel + persistance + redémarrage + refus + résultat métier prouvé.

### Invariants

- Une seule autorité Core et Gateway ; pas de provider ni de stockage parallèle.
- Le serveur valide chaque arête, le modèle ne décide pas des permissions.
- Pas de `SUCCEEDED` sans critère métier mesuré ; pas de `VERIFIED_ABSENT` sur une recherche négative seule ; pas de `DEPLOYED` sans confirmation.
- Les erreurs et inconnues arrêtent la boucle ; jamais de retries infinis ni de nouvelle inférence payante implicite.
- Production désactivée jusqu'à CI + E2E + revue de sécurité + approbation du propriétaire.
