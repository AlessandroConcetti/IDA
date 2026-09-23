# Frontend Foundation — sources et implantation

État inspecté le 23 septembre 2026. Cet inventaire concerne la tranche frontend
Astra, pas les connecteurs personnels de Luna. Un catalogue accessible n'est pas
une bibliothèque entière installée dans IDA.

## Décisions et preuves

| Source officielle | Décision | Implantation réelle dans cette tranche | Licence / réserve |
| --- | --- | --- | --- |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | USE / ADAPT | CLI/MCP local `shadcn@4.21.0`, configuration de registry, bouton natif adapté dans `frontend/ui/button.tsx`. Pas de copie globale des composants ni de Radix ajouté. | [MIT](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), notice conservée dans `licenses/FRONTEND_NOTICES.md`. |
| [Watermelon UI](https://github.com/WatermelonCorp/watermelon-platform) | USE pour la découverte | MCP distant et registry configurés ; recherche publique `button` réussie. Aucun composant Watermelon copié par cette tranche. | [MIT du dépôt](https://github.com/WatermelonCorp/watermelon-platform/blob/main/LICENSE) ; vérifier la provenance/licence de chaque artefact retenu. |
| [Motion Primitives](https://github.com/ibelick/motion-primitives) | REFERENCE / ADAPT ciblée | Pattern local `MotionPanel`, basé sur `motion`, maintenant raccordé aux quatre modules et au panneau Domaines de La Fabrique. Pas de copie/import de catalogue. Registry déclarée. | [MIT](https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md). Le projet se décrit comme bêta : revoir l'artefact avant copie. |
| [Magic UI](https://github.com/magicuidesign/magicui) | USE pour la découverte | `@magicuidesign/mcp@2.0.0` local et registry configurés ; recherche publique `marquee` réussie. Aucun effet tiers copié automatiquement. | [Composants MIT](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md). Le [dépôt MCP](https://github.com/magicuidesign/mcp/blob/main/LICENSE.md) affiche MIT, le package installé déclare ISC : divergence à clarifier avant redistribution du serveur ; outil de développement ici. |
| [React Bits](https://github.com/DavidHDev/react-bits) | REVIEW_REQUIRED | Familles consultables dans le catalogue ; registry déclarée, aucun composant incorporé. | [MIT + Commons Clause](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md), pas du MIT sans restriction. Revue nécessaire pour les exports d'un générateur et la redistribution de composants. |
| [Cult UI](https://github.com/nolly-studio/cult-ui) | REFERENCE | Registry déclarée, pistes de hero/cartes ; pas de code copié. | [MIT](https://github.com/nolly-studio/cult-ui/blob/main/LICENSE.md). |
| [Origin UI](https://github.com/shadcn/originui) | REFERENCE | Pistes de formulaires/tables/navigation ; pas de composant ni de registry v4 installés. | [MIT](https://github.com/shadcn/originui/blob/main/LICENSE.md) ; vérifier le chemin et la compatibilité du composant sélectionné. |
| [Haikei](https://haikei.app/) | REVIEW_REQUIRED | Référence d'assets dans le catalogue uniquement. | Conditions du service et de chaque export non validées ici. Aucune API, aucun MCP et aucun générateur Haikei local ne sont supposés disponibles. |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | PLANNED | Piste optionnelle dans le catalogue ; ni `three` ni `@react-three/fiber` ajoutés par cette tranche. | [MIT](https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE). Besoin concret, budget GPU, lazy loading et fallback requis avant installation. |

Ces décisions ne constituent pas un audit exhaustif de sécurité des dépôts.
Les réponses MCP et sources importables restent des données non fiables : une
instruction trouvée dans un composant ne devient pas une autorisation d'exécution.

## Dépendances réellement ajoutées à la fondation

Versions fixées dans `apps/web/package.json` et `pnpm-lock.yaml` :

- Runtime : `class-variance-authority@0.7.1`, `clsx@2.1.1`,
  `tailwind-merge@3.7.0`, `motion@13.4.0`.
- Développement : `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`,
  `shadcn@4.21.0`, `@magicuidesign/mcp@2.0.0`.
- React, React DOM, Vite et MediaPipe existaient déjà ; cette mission ne transforme
  pas MediaPipe en dépendance de Web Studio.

Les dépendances servent immédiatement au bouton partagé, à la fusion de classes,
au CSS préfixé, au mouvement de l'entrée Fabrique et à la découverte UI. Le fichier
HTML exporté n'a besoin ni de ces packages installés, ni d'un CDN, ni d'un MCP.

## Où les voir dans IDA

| Parcours actuel | Composants effectivement employés | Limite |
| --- | --- | --- |
| Accueils Classic/Sci-Fi, Care, Home, Finance, Fabrique et autres scènes `SceneAtmosphere` | Primitive locale `AnimatedBackdrop`, adaptée en lumière de plafond/fenêtres et reflets au sol. | Effet visuel uniquement, aucun capteur. Modern/Immersif conservent leur animation dédiée. |
| Roue des mondes → La Fabrique | `MotionPanel` sur Créer un agent, Explorer les templates, Mes agents, Déployer et Domaines populaires ; reflet de verre borné au survol. | Actions métier inchangées. La création d'un brief ne déploie pas un agent. |
| La Fabrique → IDA Creative Engine | `Button` adapté de shadcn pour retour/actualisation/création ; tokens communs sur navigation, cartes et états. | Pas une refonte de tous les environnements. |
| La Fabrique → Ouvrir Web Studio → Aperçu / Plan & contenu / Composants | `Button`, `Surface` ; le site aperçu/exporté emploie aussi `Reveal` et `AnimatedBackdrop`. | Génération locale déterministe ; aperçu/export ne signifie pas hébergement. |
| Catalogue de Web Studio | Sources avec statuts séparés installé/disponible/revue/prévu. | Magic UI, Watermelon, React Bits, Cult et Origin ne sont pas injectés dans l'interface par leur présence au catalogue. |

L'audit du 23 septembre a trouvé `MotionPanel` sans appel après le remplacement
de l'ancienne carte d'entrée Web Studio. Son raccordement aux contrôles natifs
de `FabriqueLanding` corrige ce point ; la classe `ida-fabrique-entry` résiduelle
n'est pas une preuve d'usage. Les réglages de mouvement, d'accessibilité et de
pause de l'environnement restent prioritaires. Aucun capteur, quota API ou
outil métier n'est activé par une animation.

## Catalogue local, pas installation implicite

`frontend/registry.ts` décrit 10 sources, dont IDA, et 29 entrées : 10 briques
locales et 19 familles externes. `resolveComponent()` privilégie une brique locale
`INSTALLED`. Une référence `SOURCE_AVAILABLE`, `REVIEW_REQUIRED` ou `PLANNED`
n'est pas sélectionnée comme code exécutable dans les sites exportés.

Les briques effectives sont le bouton, la surface, l'apparition, le fond animé,
le canvas, la navigation, le hero, les cartes, la FAQ et le footer. Les dernières
sont des sections de `SiteCanvas`, pas dix nouveaux packages autonomes.

## Adoption suivante

1. Identifier le besoin manquant et chercher d'abord une primitive locale.
2. Lire le composant précis, ses dépendances, sa licence et ses effets réseau.
3. Conserver la provenance et la notice ; adapter uniquement les éléments utiles.
4. Vérifier thème, clavier, contraste, mouvement réduit et bundle.
5. Marquer `INSTALLED` seulement après intégration et tests.

Les MCP de développement et leurs limites sont décrits dans `FABRIQUE_MCP.md`.
Les garanties concrètes du rendu/export sont dans `FABRIQUE_COMPOSER.md`.
