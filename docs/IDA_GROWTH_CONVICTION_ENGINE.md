# IDA Growth — moteur d'acquisition et architecture de conviction (v1)

**Statut : spécification produit et contrat de réalisation, non implémenté.**
**Périmètre :** IDA Studio / IDA PRO, connecté au Core, au moteur Campaigns/Content/Approval existant et à un adaptateur CRM. Aucune fonction de publication ou d'envoi n'est activée par ce document.
**Jeu de données de référence :** `docs/IDA_GROWTH_JOURNEYS_V1.json`. Ne pas dupliquer ces définitions dans le frontend.

## 1. Résultat attendu

IDA Growth transforme des actions marketing isolées en **parcours de progression vérifiable** :

`audience/segment -> croyance ou objection déclarée -> épisode -> preuve -> interaction -> progression -> diagnostic/RDV -> devis -> client -> expansion des services -> recommandation`.

- Chaque contenu doit être **autonome à la lecture** mais situé dans une **série cohérente** (épisode précédent/suivant, preuve à donner, CTA, destination).
- Le système ne prétend jamais qu'une vue, un clic ou une ouverture d'email prouve qu'une personne a changé d'avis.
- La progression d'une *opportunité commerciale* exige un événement traçable, une qualification ou une décision humaine ; distinguer `OBSERVED`, `DECLARED`, `INFERRED` et `UNVERIFIED`.
- Chaque parcours conserve la même identité client, l'historique des objections, les services déjà vendus, les preuves présentées, les prochaines actions et les résultats.
- Aucun score de persuasion psychologique opaque, aucune exploitation de vulnérabilités, aucun témoignage ou retour sur investissement inventé.
- Une séquence **n'impose pas** au public de voir les épisodes dans l'ordre : chaque contenu fonctionne isolément, pointe vers le parcours central et peut proposer l'étape utile suivante.

## 2. Quatre parcours métier

| Parcours | Segment d'entrée | Croyance/objection à faire évoluer | Preuve utile | Sortie |
| --- | --- | --- | --- | --- |
| A — Présence numérique | entreprise **vérifiée sans site** | « mon activité se passe de site » | démonstration métier, accessibilité recherche/prise de contact | demande de diagnostic et proposition de site |
| B — Refonte | entreprise avec site vérifié vieillissant ou peu utile | « mon site actuel suffit » | audit concret, avant/après non trompeur, accessibilité/performance/UX | audit + proposition de refonte |
| C — IDA PRO | entreprise avec tâches répétitives pertinentes | « l'automatisation est trop compliquée » | flux métier démontré, autorisations, contrôle humain, valeur mesurée | atelier découverte + pilote |
| D — Pluralisation des produits | **client existant**, service(s) déjà signé(s) | « je n'ai besoin que du produit initial » | audit des besoins réels, gains et services complémentaires justifiés | **offre additionnelle contextualisée**, avec approbation du client |

### D — expansion responsable du compte client

D démarre **après une vente réelle** (`customer_status=ACTIVE` ou preuve de commande signée), et **jamais** à la suite d'un simple prospect intéressé. Le système détecte les **opportunités complémentaires**, non une occasion systématique de facturer.

Services possibles, selon catalogue réellement commercialisable et capacités effectivement livrables :
- Site créé/refondu -> SEO technique et local si lacunes mesurées ; analytics et suivi des conversions si absents.
- Nouveau site + manque de contenu de qualité -> visuels, identité, photos/vidéos commerciales **uniquement avec droits et moyens de production validés**.
- Acquisition organique en place + objectif de volume + budget confirmé -> publicité / campagnes payantes **après** mesure, landing pertinente et validation du coût.
- Demandes répétitives identifiées -> IDA PRO, automatisation métier, devis, qualification, prise de rendez-vous si les fonctions existent et sont conformes.
- Besoin récurrent explicite -> maintenance, optimisation UX/SEO, contenu ou accompagnement.

**Garde-fou d'offre D :** chaque recommandation nécessite `trigger vérifié + besoin confirmé ou diagnostic explicite + produit compatible + bénéfice prudent + prérequis + coût estimatif validé + preuve livrable + responsable humain`. Une proposition sans justification reste `DRAFT/NEEDS_VALIDATION` ; pas de relance ni de devis automatiques.

**Exemple de parcours D :**
1. Livraison acceptée du site, suivi post-livraison proposé au client.
2. Diagnostic de présence et de mesures (SEO / conversions) ; collecte du besoin avec accord.
3. Explication d'une lacune précise : ce qui est mesuré, ce qui ne l'est pas.
4. Démonstration d'un service complémentaire adapté, sans promesse de classement, de ventes ou de ROAS.
5. Proposition *unitaire* chiffrable et optionnelle : SEO / visuels / publicité / IDA PRO, priorisée par valeur, capacité et budget.
6. Suivi des résultats puis, seulement si pertinent, prochaine recommandation. L'absence d'intérêt ferme la proposition, pas de harcèlement commercial.

**Règle de priorité produits** : la publicité n'est pas l'offre additionnelle par défaut. Corriger d'abord les problèmes qui rendraient la dépense publicitaire inefficace (site, tracking, offre, conversion). Le client conserve une vue synthétique des livrables et services actifs.

## 3. Séquençage éditorial

Chaque campagne est un **graphe dirigé** et ordonné de contenus avec une seule action principale par épisode :
- `stage` : AWARENESS -> REFRAME -> POSSIBILITY -> PROOF -> OBJECTIONS -> DECISION (et ONBOARDING / EXPANSION pour D).
- `belief_before` / `belief_after_goal` : hypothèse éditoriale, **pas un fait sur la personne**.
- `key_message`, `evidence_required`, `format_candidates`, `cta`, `destination`, `next_episode_id`, `fallback_episode_id`.
- Variantes de canal Instagram / TikTok / LinkedIn / email / site **uniquement selon canaux pertinents et autorisés**, sans copier-coller identique.
- Les épisodes sont regroupés dans une landing « parcours » ou un dossier de campagne ; les liens d'entrée à chaque étape renvoient au bon contexte.
- La création de tous les brouillons précède la publication ; ordre éditorial fixé avant production d'assets.

**Campagne de lancement A** : 8 épisodes du fichier JSON. Angles : site inutile ? -> découvrabilité -> limites d'Instagram -> comparaison accessible -> site utile au quotidien -> preuves des usages -> coût réel et objections -> diagnostic. Aucun pourcentage de ventes perdues inventé. Utiliser données attribuées ou supprimer les chiffres.

## 4. Vue produit IDA Growth

Une seule interface dans l'écosystème IDA, au **standard de finition du monde IDA**, réutilisant le système de navigation / composants existants, responsive et clavier :
1. **Vue Stratégie** : segments A/B/C/D, objectif commercial, croyances/objections documentées, preuve exigée, campagnes actives, versions.
2. **Journey Builder** : progression lisible en graphe, épisodes reliés, état de chaque élément, édition localisée, contrôle des liens cassés.
3. **Content Pipeline** : scripts/briefs, assets réellement disponibles, variantes plateformes, approbation, statut de publication réel, blocages.
4. **CRM & Signaux** : liste d'opportunités qualifiées, source vérifiable, consentement/préférences de contact, stade et raison du changement, historique traçable.
5. **Expansion D** : clients existants, produits actifs, besoins non couverts, prérequis, recommandation justifiée, `DRAFT/READY/DECLINED/ACCEPTED` ; **pas d'upsell aveugle**.
6. **Analytics** : vues/clics seulement s'ils sont réellement reçus ; indicateurs actionnables (diagnostics, RDV, devis, ventes, revenu additionnel constaté), taux par segment et source, `NO_DATA` si indisponible.

Éviter les graphiques factices, les compteurs inventés et les boutons sans effet. La DA est celle d'IDA et non un dashboard SaaS générique. Pour l'implémentation UI lire `docs/IDA_FIRST_PASS_VISUAL_STANDARD.md` ; présenter les captures desktop/mobile et corriger avant remise.

## 5. Contrats métier proposés (à adapter aux entités déjà présentes)

Ne pas créer un 2e Core ou un 2e moteur Campaigns. Réutiliser autant que possible `campaigns`, `content_plans`, `posts`, `post_variants`, `approvals`, `tasks`, `activity_logs` et les contrats Gateway/Identity. Ajouter seulement les modèles absents.

- `GrowthJourney`: `id, workspace_id, version, kind(A|B|C|D), segment, goal, state`.
- `JourneyEpisode`: `id, journey_id, order, stage, belief_before, belief_after_goal, message, evidence_required, cta, next_id, content_plan_item_id?, state`. `order` unique par parcours/version ; valider absence de cycles inattendus et de liens inconnus.
- `GrowthOpportunity`: `id, workspace_id, crm_contact_ref?, crm_account_ref?, segment, journey_id, stage, stage_source, stage_event_ref?, updated_at`. Le `CRM` doit être un adaptateur : **ne pas prétendre** que le fichier CRM historique est déjà une base SQL connectée.
- `EvidenceEvent`: `id, workspace_id, opportunity_id, type, source, source_ref, observed_at, trust_level, actor_id?, idempotency_key`. Déduplication serveur et isolation workspace.
- `ClientProduct`: `id, workspace_id, account_ref, catalog_product_id, contract_ref, delivered_at?, state`, **données réelles uniquement**.
- `ExpansionRecommendation`: `id, workspace_id, account_ref, trigger, need, current_products, proposed_product_id, prerequisite_checklist, evidence_refs, risk_or_limit, rationale, status, approved_by?, quoted_price_ref?`.
- `CampaignOutcome` ou projection existante : source, canal, épisode, diagnostic, RDV, devis, vente, montant réel facturé ; valeurs inconnues = null.

Aucune transaction cross-workspace. Contrôler rôle/grants côté serveur ; timestamps UTC + timezone ; audit redacted ; idempotence sur écritures ; minimisation des données.

## 6. Règles déterministes de progression

- Entrée A : absence de site `VERIFIED` avec date/source (ne pas se fier à une supposition ou à une recherche sans résultat).
- Entrée B : URL existante + défauts auditables ; distinguer défaut vérifié d'avis créatif.
- Entrée C : processus et temps perdu *déclarés/mesurés* ; ne pas inventer d'économies.
- Entrée D : statut client actif prouvé + service initial identifié + besoin ou diagnostic justifié.
- Un clic, une impression ou une lecture peut augmenter une métrique de contenu mais **ne change pas automatiquement le statut de conviction**.
- Proposition de prochaine étape fondée sur un événement daté et sourcé, ou une décision CRM humaine ; proposer sans envoyer.
- Un prospect peut être dans plusieurs centres d'intérêt, mais son stade par parcours est conservé distinctement ; jamais de fusion de statuts contradictoires.
- Les transitions ont un motif compréhensible et une option de correction manuelle auditée.

## 7. Intégration / limites

- `IDA Core` : workspace/identity/grants, Gateway, audits.
- `Campaigns + Content Studio` : plans, scripts, variantes, assets ; ne pas doubler les données de publication.
- `Approval Center` : validation humaine de la version exacte avant envoi/publication, conformément à `AGENTS.md` et `SOCIAL_APIS.md`.
- `CRM` : brancher une interface/adaptateur pour le CRM réel. Si absent : écran `CONFIGURATION_REQUIRED`, aucune importation fictive ou fusion du fichier CRM.
- `Catalogue` : offres existantes/prix approuvés seulement ; ne pas afficher une tarification imaginaire.
- RGPD et prospection B2B : minimisation, base légale documentée, transparence, opposition/désinscription, gestion des préférences ; validation du canal et des règles applicables avant chaque campagne. Ni scraping massif ni messages automatisés par défaut.
- Aucune intégration sociale, emailing, publicité payante, envoi client ou déclenchement d'achat n'est activé sans raccordement effectif, autorisation et validation humaine.

## 8. Ordre d'implémentation Codex (une tranche fonctionnelle cohérente)

1. Inspecter registres Campaigns/Content/Approval, composants et schémas existants ; dresser mentalement le diff minimal ; faire checkpoint.
2. Charger le JSON v1 en **données de référence** validées (schéma + tests d'intégrité) ; rendre les parcours A/B/C/D visibles et navigables sans feindre des statistiques.
3. Brancher la création/édition de campagne + épisodes sur les services persistants existants ; isoler par workspace ; aucun contenu en dur dupliqué dans React.
4. Ajouter opportunités/événements manuels traçables, parcours et recommandations D après client actif seulement ; UI et API réelles avec `EMPTY/LOADING/SUCCESS/ERROR/CONFIGURATION_REQUIRED`.
5. Relier la proposition de contenu au pipeline d'approbation **déjà en place** ; zéro publication / email sortant sans confirmation spécifique.
6. Installer tests d'intégrité du graphe, transitions, droits, isolement workspace, déduplication, absence de fausses données, garde D, approbations et non-régression.
7. Inspecter visuellement les parcours desktop/mobile, interactions et états ; réparer tous les défauts évidents de la **nouvelle zone Growth** avant restitution.

## 9. Definition of Done vérifiable

- Les **4 parcours** et leurs épisodes versionnés sont consultables, avec une progression graphique fonctionnelle et textes modifiables selon droits ; ce n'est pas une maquette morte.
- Une campagne créée est retrouvée après rechargement et redémarrage ; un épisode déplacé conserve des liens cohérents et ne modifie aucun autre parcours.
- Une opportunité CRM non synchronisée est indiquée comme telle ; aucune statistique n'est fabriquée.
- D refuse une recommandation si le compte n'est pas client, si le produit est déjà actif sans justification de renouvellement, ou si aucune preuve/besoin n'est fourni.
- Une recommandation D montre **pourquoi** ce produit, les prérequis, le service initial et une limite réaliste ; son refus est respecté.
- Des messages/publications ne partent pas sans action et approbation humaines ; tests prouvant ce verrou.
- Contrôles d'accès et workspace, types, lint, build, tests et recette visuelle desktop/mobile passés pour le périmètre livré ; rapport de limites réel.
- Le résultat ne dégrade ni campagnes musicales, ni autres mondes, ni animations, ni autres sections.

**Règle Codex :** modifier exclusivement Growth et ses dépendances indispensables ; économiser les tokens de narration, jamais la qualité ni les vérifications.