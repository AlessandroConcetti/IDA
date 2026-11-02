# La Fabrique — Atelier typographique (proposition v2)

## Périmètre vérifié
- Point d'entrée dans La Fabrique du dépôt IDA : aperçu local des quatre marques IDA Studio, Alessandro, Egeri et Astromer/Makerz.
- Choix contrôlé de polices d'affichage et de texte, corps, interlettrage, graisse, capitales et apparition.
- Comparaison avec le préréglage d'origine, détection des doublons entre marques, export du CSS/JSON.
- La sauvegarde du brouillon ne concerne que le navigateur via localStorage. Aucune synchronisation workspace/API, aucune modification d'un site client ni publication. Six familles libres auto-hébergées sont installées dans le module de prévisualisation.
- Restaurer le préréglage est une action locale. Le vrai checkpoint de code est la branche Git immuable à conserver : checkpoint/typography-before-2026-11-02 à la révision 92a8ff47350681fdf8c6e2eccd232dcc0a728417.

## Polices, légalité et RGPD
Le module inclut six dépendances `@fontsource-variable/*` enregistrées dans `apps/web/package.json` et `pnpm-lock.yaml` : Space Grotesk, IBM Plex Sans, Cormorant Garamond, Manrope, Bodoni Moda et Syne. Toutes sont distribuées sous OFL-1.1 selon les fiches Fontsource et lues depuis les assets WOFF2 du site : aucune requête à Google Fonts ni à un CDN en exécution. Le navigateur ne télécharge que les sous-ensembles réellement utilisés. Les polices système Helvetica Neue et Georgia ne sont pas distribuées. Pour tout site client, utiliser les packages indiqués par l'export CSS/JSON et inclure les textes de licence applicables ; n'intégrer aucun fichier Helvetica Neue sans autorisation distincte. Le fallback local garantit le fonctionnement hors chargement des polices.

## Vérifications requises avant fusion
- pnpm exec tsc --project apps/web/tsconfig.typography.json (strict sur le module ; la vérification globale du dépôt est momentanément bloquée par des défauts préexistants)
- pnpm exec vitest run apps/web/src/typography-system.test.ts apps/web/src/typography-atelier.test.ts
- pnpm exec biome check apps/web/src/typography-system.ts apps/web/src/typography-system.test.ts apps/web/src/TypographyAtelier.tsx apps/web/src/typography-atelier.test.ts apps/web/src/FabriqueEnvironment.tsx
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
