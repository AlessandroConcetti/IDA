# IDA CRYPTO — Référentiel quantitatif & règles d'intégration (2026-11-07)

**Statut:** PARTIAL — primitives déterministes ajoutées; ni environnement Crypto complet, ni flux fournisseur connecté, ni UI/E2E, ni agent actif. Le code ne place aucun ordre. Branch `feature/ida-crypto-quant-risk-20261107`.

## Principes
- **Utilisateur initial:** test €10 en crypto spot sans levier; capital de sécurité séparé. Ne jamais assimiler staking à risque nul. Aucune exécution autonome, promesse de rendement, levier, futures, marge ou trading automatique.
- Réutiliser le Core, le Tool Registry, le coffre, les permissions workspace et les agents existants; aucune nouvelle identité d'agent active sans outils et évaluations. **Lecture seule** et preuves avant activation.
- Source + horodatage + paire + devise + qualité de données obligatoires. `REAL/DELAYED/SIMULATED/UNKNOWN`; ne pas mélanger carnet local, volume global et cours composite. Signaler écarts de sources (ex. marchés CMC vs DefiLlama). Les taux de change et frais peuvent altérer les conclusions.
- Ne jamais noter une crypto comme « non volatile » ou « safe ». Enregistrer une erreur de donnée comme `UNAVAILABLE`, jamais comme zéro.

## 1. Microstructure et indicateurs
- CLOB: bid/ask (prix et quantités, niveaux limités), profondeur effective, déséquilibre de carnet, évolution dans le temps; distinguer carnet visible du volume réellement exécutable; couche `previewMarketSweep` fournit une **estimation statique** de l'impact, sans garantie d'exécution. Inclure spread absolu/relatif (bps), profondeur EUR à 0.5% et 1%, estimation de slippage, commission, impact, spread et frais FX.
- VWAP: somme(prix d'échange × quantité) / somme(quantité), distingué de l'approximation OHLCV au prix typique; benchmark par session et marché, pas une vérité inter-exchanges.
- RSI Wilder(14): oscillateur 0..100, 70/30 = repères, pas signal autonome.
- MACD(12,26,9): EMA fast – EMA slow; signal EMA du MACD; histogramme = diff.
- Bollinger(20,2): SMA ±2 écart-types; contraction ne prédit pas le sens d'un breakout.
- Retracements Fibonacci (23.6/38.2/50/61.8%): **niveaux heuristiques**, absence de fiabilité prédictive intrinsèque.
- ATR(14): vrai range Wilder, volatilité absolue, non directionnelle.
- Volume spot, volume dérivé, open interest et funding: étiquetage séparé, dérivés **observation seulement**.

## 2. Ordres et gestion de risque
- Market: priorité à la vitesse, prix incertain; limit: prix borné MAIS exécution non garantie et un limit crossing est taker, pas automatiquement maker.
- Stop market déclenché -> prix non garanti, gaps, slippage et panne possibles; stop-limit -> non-exécution possible. TP -> ordre conditionnel, pas gain garanti.
- Le risque de trade modélisé `E*r` ne constitue **pas** une perte maximale certaine: taille = min(E×r/(|entrée-stop| + coûts/unités), cash/entrée, E/entrée), seulement long spot. Risque effectif supérieur en cas de gap.
- Ratio gain/risque: gain espéré / perte au stop **estimée**, tenir compte des coûts; probabilité, drawdown, coûts de liquidation et incertitude.
- Kelly fractionnel: f = réduction × max(0, p-(1-p)/b), incertain si p/b estimés sur petit échantillon; facultatif, plafonné à 2% dans la fonction **pédagogique**, jamais commande automatique.
- Levier effectif = exposition brute / fonds propres. Sur le module personnel: plafond **1x spot**, poids non négatifs, somme ≤1. Liquidation/marge/funding uniquement en éducation/monitoring, hors exécution.

## 3. Tokenomics et analyse fondamentale
- MCap = prix × circulating supply. FDV = prix × max supply (si max défini; sinon `UNKNOWN`). Ratio FDV/MCap et parts verrouillées, cliff/vesting dans les 7/30/90 jours, émissions/bridges/burns.
- Token != equity: isoler revenus protocole, revenu/actionnaire, gouvernance, droits de rachat, commission et réelle capture de valeur. Analyse chaîne: TVL (net d'actifs circulaires), utilisateurs actifs vérifiables, frais versés, revenus organiques, rétention, transactions économiques, stablecoins, développeurs; repérer farming/wash-trading.
- DeFi: AMM classique xy=k (pas universel), CLOB DEX et AMM hybrides; IL vs HODL *avant frais et récompenses*, risque smart-contract/oracle/bridge/depeg, MEV, gas/gwei, validation on-chain.
- Liquidité globale vs profondeur *sur venue*: un coin peut afficher un volume global élevé tout en ayant un spread énorme sur Revolut X.

## 4. VaR, ES, FRTB: méthodologie correctement bornée
- Historique: aligner **les mêmes jours et heures**; cryptos 365/365, actions 252 séances; pas de matrice de rendements sans calendrier cohérent. Retours simples = P_t/P_{t-1}-1; ne pas mélanger log/simple sans transformation.
- VaR historique à confiance c: seuil du pire `ceil((1-c)×N)`-ième scénario P&L; ES moyenne des `ceil((1-c)×N)` pires pertes. Minimum de 5 réalisations de queue pour cette version d'étude; 99% et N=500 => 5 réalisations (corriger l’arrondi flottant), **les autres conventions interpolées peuvent différer**.
- Paramétrique: sigma_portefeuille = sqrt(wᵀ Σ w) pour rendements journaliers; VaR ~= max(0,E[z_c σ_p sqrt(h)-μ_p h]); normalité fragile en crypto, gap/tails/corrélation de stress. Étendre avec Student / scénarios bootstrap / Monte Carlo quand validés. Pas de fausse précision.
- Stress: -30%, -60%, chute de liquidité 90%, gapping et depeg; calcul coût de sortie au carnet et ES sur scénarios; ES n'est pas perte maximale.
- FRTB bancaire IMA: ES 97.5% une queue, horizons 10/20/40/60/120 j, période de stress ≥12 mois et set réduit de facteurs; NMRF soumis à SES, DRC spécifique au défaut; ne **pas** présenter cela comme requis pour portefeuille crypto retail. Basel SCO60 (en vigueur 2026) distingue Group 1/2 et précise les traitements crypto bancaires (IMA non applicable aux Group 2a).
- Backtest walk-forward horodaté sans lookahead, survivorship ni utilisation de données postérieures, frais réels, calibration, breaches VaR (Kupiec / Christoffersen si assez de données), stabilité sous perturbations; séparer apprentissage, validation et test.

## 5. Sécurité et expérience
- Read-only d'abord via permissions Revolut X actuelles; lecture soldes, tickers, book, candles, paires, transactions, staking. Aucune clé dans Git ni navigateur. Les API de ce connecteur ne permettent pas de créer des ordres ici.
- Signaux `OBSERVE`, `CAUTION`, `DATA_MISSING`, jamais `BUY NOW`; explication complète de source, date, intervalle, confidence et limites. Coupure de calcul si source périmée, anomalie de spread, volume insuffisant, métadonnées absentes.
- Module IDA Crypto envisagé: `Market Analyst` (lecture), `Liquidity Analyst` (lecture), `Tokenomics Analyst` (lecture), `Risk Steward` (contrôles déterministes + résumé). Ne pas créer d'agent actif par bouton. Tests unitaires, intégration, puis E2E UI→API→source→calcul→audit→état d'erreur avant lancement.
- MiCA/France: vérifier autorisation PSCA, risques de custodie et staking, fraude, fiscalité locale (source AMF au moment de l'action). Ne pas importer la responsabilité bancaire d'un desk FRTB.

## 6. Liste d'observation, photographie du 07/11/2026 (pas recommandations d'achat)
| Actif | Statut | Argument et objection majeure |
|---|---|---|
| SEI | watch | Catalyseur SIP-6/Autobahn/Giga (proposition, non performance mainnet constatée); token unlock à vérifier; FDV ~1.30× MCap |
| SUI | watch | Écosystème/liquidité comparativement solides; ~41% circulation seulement, dilution future |
| ENA | watch | Exposition thématique USDe; risques hedging/contreparties/depeg/valeur capture; ne pas confondre ENA et USDe |
| ONDO | caution | RWA fort mais 1.71B de tokens débloqués autour des 17–18/01/2027 selon agrégateurs; ne pas assimiler gouvernance à actions |
| PLUME | research-only | Faible mcap, forte spéculation, revenus protocoles faibles selon DeFiLlama; pas de paire EUR sur Revolut X constatée ce jour |
Ce classement est **qualitatif sous incertitude**; scoring institutionnel chiffré interdit tant que des séries synchronisées, profondeur locale et provenance ne sont pas chargées. Ne pas affirmer avoir backtesté les rendements.

## Références vérifiées 07/11/2026
- https://www.bis.org/committees/bcbs/basel-framework/standard/mar/33/inforce/2023-01-01/published/2020-06-05
- https://www.bis.org/committees/bcbs/basel-framework/standard/sco/60/inforce/2026-01-01/published/2024-11-27
- https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/backtesting-and-simulation
- https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/measuring-managing-market-risk
- https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15
- https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/crypto-actifs-bitcoin-etc/investir-en-crypto-monnaies-quel-professionnel-choisir
- https://www.chainalysis.com/blog/crypto-market-manipulation-wash-trading-pump-and-dump-2025/
- https://blog.sei.io/introducing-sip-6-upgrade-sei-to-autobahn-consensus/
- https://app.tokenomics.com/tokenomics/ondo/unlocks
- https://coinmarketcap.com/currencies/sei/
- https://coinmarketcap.com/currencies/ondo-finance/
- https://coinmarketcap.com/currencies/sui/
- https://coinmarketcap.com/currencies/ethena/
- https://coinmarketcap.com/currencies/plume/
