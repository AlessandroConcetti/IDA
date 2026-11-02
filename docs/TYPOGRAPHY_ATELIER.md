# La Fabrique — Atelier typographique (proposition v1)

## Périmètre vérifié
- Point d'entrée dans La Fabrique du dépôt IDA : aperçu local des quatre marques IDA Studio, Alessandro, Egeri et Astromer/Makerz.
- Choix contrôlé de polices d'affichage et de texte, corps, interlettrage, graisse, capitales et apparition.
- Comparaison avec le préréglage d'origine, détection des doublons entre marques, export du CSS/JSON.
- La sauvegarde du brouillon ne concerne que le navigateur via localStorage. Aucune synchronisation workspace/API, aucune modification d'un site client, aucune publication, aucune installation de police.
- Restaurer le préréglage est une action locale. Le vrai checkpoint de code est la branche Git immuable à conserver : checkpoint/typography-before-2026-11-02 à la révision 92a8ff47350681fdf8c6e2eccd232dcc0a728417.

## Polices, légalité et RGPD
Les noms de polices sont des propositions de direction artistique ; l'aperçu utilise une police système de repli quand la police cible n'est pas installée sur l'appareil. Aucune importation Google Fonts ni requête automatique ne doit être ajoutée : pour la mise en production sur un site tiers, vérifier la licence exacte de chaque fichier, ajouter des fichiers WOFF2 auto-hébergés et déclarer les @font-face / droits d'utilisation. Helvetica Neue ne peut pas être librement distribuée avec le site sans licence adéquate.

## Vérifications requises avant fusion
- pnpm --filter @ida/web typecheck
- pnpm exec vitest run apps/web/src/typography-system.test.ts
- pnpm lint
- Parcours manuel : choisir une marque, modifier les contrôles, sauvegarder localement, recharger, restaurer, comparer et exporter, vérifier le blocage des doublons.
- Vérifier visuellement iPhone / PC, zoom 200 %, clavier, contraste, et prefers-reduced-motion.
- Aucun déploiement automatique avant validation visuelle.

## Prévisualisation et recette isolée (tranche v2)
- Lancer depuis la racine : `pnpm install --frozen-lockfile`.
- Compiler les éléments propres à l'atelier : `pnpm exec tsc --project apps/web/tsconfig.typography.json`.
- Démarrer sans lancer IDA Core : `pnpm --dir apps/web exec vite --config vite.typography.config.ts --host 127.0.0.1 --port 5174`. Ouvrir `http://127.0.0.1:5174/typography-preview.html`.
- Construire le prototype statique isolé : `pnpm --dir apps/web exec vite build --config vite.typography.config.ts`.
- Lancer l'essai ordinateur / mobile : `pnpm exec playwright install chromium && pnpm exec playwright test --config playwright.typography.config.ts`.
- L'action GitHub **Fabrique Typography CI** produit un artefact `ida-typography-review` avec le build et, en cas de réussite, les captures des deux formats.
- Modifications non sauvegardées conservées entre marques pendant la session d'édition. Le brouillon sauvegardé reste local au navigateur et n'est pas synchronisé au compte IDA.
- Les quatre préréglages sont des **propositions nouvelles**, pas des captures ni un relevé automatisé de la typographie actuellement publiée sur les sites.

## Réserves de compilation existantes dans le dépôt
À l'origine, le dépôt présente déjà des erreurs indépendantes de cette tranche, notamment une dépendance `music-contacts.js` absente dans les contrats et des imports / types manquants dans le Hub, la météo ou la musique. Le workflow vérifie strictement le module typographique en isolation, lance les tests et la vérification de style ; il laisse les contrôles globaux du dépôt en rapports non bloquants jusqu'à correction spécifique de la base. Un test isolé réussi ne prouve pas que l'application complète est déployable.
