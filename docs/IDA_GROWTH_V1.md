# IDA GROWTH — socle local en revue (v1)
Date : 25 octobre 2026. **Statut : branche de développement, non déployée en production.**

## Périmètre livré dans la branche
- Entrée accessible par le monde **Statistiques** d’IDA existant (chargement différé du nouveau tableau de bord).
- Import ponctuel de CSV Search Console (« Requêtes »), avec normalisation FR/EN, CTR calculé sur clics/impressions, détection de pistes d’amélioration classées et transparence sur les lignes ignorées.
- Import ponctuel d’exports de campagnes Meta Ads / Google Ads, lecture du coût, des clics et **uniquement des colonnes « Leads » explicitement identifiées**. La colonne « Results » de Meta ne vaut **jamais** preuve de prospects.
- Règles de surveillance configurables de CPC et CPL, alertes déterministes sans accès au compte publicitaire.
- Espace visibilité IA **explicitement non connecté**, sans scores fictifs.
- CSV analysés **uniquement en mémoire du navigateur**. Pas d’appel réseau, de localStorage, de persistance sur l’API, de collecte de mot de passe ni de transmission à un modèle.
- Garde-fous : maximum 2 Mo, 20 000 lignes, invalidation des analyses quand les seuils sont modifiés, rendu React échappé, statuts d’erreur/absence de données. Aucune proposition ne change une campagne et aucune publication ni dépense n’est effectuée.

## Connexions effectivement constatées
- Metricool : marque `ida.studio.pro`, réseaux Instagram/TikTok identifiés. **Ces données ne sont pas synchronisées dans cette v1.**
- GSC Wizard : **aucune propriété Google Search Console accessible** au moment de la vérification.
- Windsor.ai : capture utilisateur de l’interface « Connected to ChatGPT » **mais l’app ChatGPT n’est pas encore confirmée installée/connectée** ; aucun compte Meta/Google Ads interrogé.

Ne pas afficher ces sources comme « intégrées » à l’interface avant une preuve de lecture, de permission et de provenance.

## Formats CSV acceptés
Search Console : entêtes `Query` ou `Requêtes les plus fréquentes`, `Clicks` / `Clics`, `Impressions`, `Position`. CTR exporté ignoré au profit du calcul explicable clics/impressions. Les métriques sont **des sommes des lignes visibles**, pas nécessairement les totaux de propriété Google (requêtes anonymisées, limite d’export).

Publicités : `Campaign name` / `Nom de la campagne`, `Amount spent` / `Montant dépensé` / `Spend`, `Link clicks` ou `Clicks` facultatif, `Impressions` facultatif, **`Leads` explicitement nommé** facultatif. Une devise par fichier, identifiable via en-tête « EUR/USD » ou déclarée manuellement. Les conversions non libellées Leads restent inconnues. L’export n’est pas un suivi live ni une preuve de rentabilité.

Encodage : CSV texte avec BOM UTF-8 facultatif ; séparateurs `,`, `;` et tabulation, guillemets et retours à la ligne au sein des valeurs. Si ton fournisseur exporte un format différent, adapter l’import **sur échantillon anonymisé**, sans deviner les colonnes.

## Tests préparés
`pnpm test -- apps/web/src/growth-analytics.test.ts`
`pnpm --filter @ida/web typecheck`
`pnpm --filter @ida/web build`

Ces commandes **doivent encore être exécutées dans un environnement disposant des dépendances du projet**. La création des fichiers et des tests ne prouve pas le passage du build ni de l’E2E navigateur.

## Étapes suivantes — validation préalable obligatoire
1. Exécuter tests et build puis effectuer les recettes iPhone + PC (import valide, fichier malformé, changement d’onglet, long fichier, seuil modifié, mode sombre/clair).
2. Brancher GSC après accès à la propriété `idastudio.fr` et recueillir les données **en lecture seule**, avec origine/période/droits auditables.
3. Brancher les comptes publicitaires uniquement après confirmation des scopes et de la provenance ; par défaut aucune permission d’écriture.
4. Ajouter le flux de **proposition → validation humaine → publication** seulement après politique d’accès Core/Approval Center ; pas de plugin tiers autorisé à contourner le Core.
5. Mesurer les mentions IA sur des requêtes versionnées, datées, échantillonnées ; jamais des « classements ChatGPT garantis ».
6. Définir un mode de génération de contenu de qualité, revue humaine, anti-spam SEO, sources et transparence. Aucun achat automatique de backlinks.
7. Déploiement seulement après tests et approbation du propriétaire.

## Architecture
Cette v1 est **une tranche front-end de lecture seule** dans `apps/web`. Elle **n’est pas** un module installé dans le `Module Registry v2`, ni un agent autonome, et n’implémente pas de connecteur OAuth ou de routes API. Elle suit le principe existant : des fonctionnalités réellement accessibles, sans fausse métrique, et aucune action externe sans validation.
