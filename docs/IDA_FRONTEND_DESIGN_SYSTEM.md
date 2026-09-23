# IDA Frontend Foundation — système de design partagé

La fondation est une couche cliente opt-in sous `apps/web/src/frontend/`.
Elle ne remplace pas les thèmes historiques et ne modifie aucune règle métier,
permission, API, mémoire ou connexion. Elle est déjà consommée par La Fabrique,
Creative Engine et Web Studio ; le reste d'IDA n'est pas déclaré migré.

## Tokens et isolation

`foundation.css` définit les tokens sous `.ida-foundation`. Le thème Classic est
le défaut ; `data-theme="scifi"` sélectionne la variante sombre. Un thème Classic
explicite sur la fondation peut rester clair sous un parent Sci-Fi.

| Groupe | Variables principales | Rôle |
| --- | --- | --- |
| Couleurs | `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--accent`, `--muted-foreground` | Surfaces et contrastes cohérents. |
| États | `--border`, `--input`, `--ring`, `--destructive` | Bordures, champs, focus, erreur. |
| Forme | `--radius`, `--ida-ui-space`, `--ida-ui-shadow` | Arrondis, échelle d'espacement et élévation. |
| Typographie | `--ida-ui-font` | Pile locale Inter/system-ui ; aucun chargement de police distante. |
| Mouvement | `--ida-ui-duration`, `--ida-ui-ease` | Retours d'interaction partagés. |

Tailwind 4 importe uniquement thème et utilities, sans Preflight. Les classes
utilitaires portent le préfixe `ui:` et les sources de compilation sont limitées
à la fondation. `cn()` fusionne les classes avec ce même préfixe. Les nouveaux
composants ne doivent pas ajouter un reset global.

## Primitives réutilisables

| Primitive | Usage réel / limites |
| --- | --- |
| `Button` | Élément `button` natif ; variantes primary/secondary/ghost, `type="button"` par défaut, états disabled et focus. Adaptation ciblée shadcn/cva ; pas de faux lien ni de permission portée par le composant. |
| `Surface` | Section sémantique et tokens de panneau. Les titres restent à fournir par le consommateur. |
| `Reveal` | Apparition CSS ; le contenu reste présent sans JavaScript. |
| `AnimatedBackdrop` | Deux gradients décoratifs animés, `aria-hidden`, pas de canvas ni de réseau. |
| `MotionPanel` | Raccordé aux quatre modules natifs de La Fabrique et au panneau Domaines populaires. Entrée courte décalée, élévation bornée à 3/4 px sur pointeur fin ; aucune enveloppe DOM ne modifie les grilles. |
| `SiteCanvas` | Renderer du plan de site ; même arbre pour aperçu et export. Navigation, hero, cartes, FAQ native et footer. |

Exemple d'utilisation cliente :

```tsx
import { Button, Surface } from "./frontend/components";
import "./frontend/foundation.css";

<section className="ida-foundation" data-theme="classic" data-motion="none">
  <Surface aria-labelledby="action-title">
    <h2 id="action-title">Une action existante</h2>
    <Button onClick={onExistingAction}>Continuer</Button>
  </Surface>
</section>
```

`onExistingAction` conserve les contrôles métier actuels. Le bouton ne donne
aucun droit supplémentaire et ne remplace pas les validations côté serveur.

## Mouvement, accessibilité et responsive

- Cibles des boutons de 44 px minimum et focus visible de 3 px.
- Les modes du site sont `none`, `subtle` et `expressive`. Le moteur peut réduire
  l'intensité selon le type de site. Le décor expressif est absent en mode immobile.
- `data-motion="none"` et `prefers-reduced-motion: reduce` arrêtent animations,
  transitions et défilement animé dans la fondation. `MotionPanel` reçoit la
  politique résolue de `useEnvironmentMotion` (OFF/LOW/STANDARD/HIGH et pause),
  consulte aussi la préférence OS et n'anime rien sans politique explicite.
  LOW conserve seulement un fondu court, sans déplacement ni survol animé.
  Un panneau masqué, hors écran ou derrière une fenêtre arrête son animation ;
  son contenu reste immédiatement visible. Les éléments décoratifs sont masqués
  en couleurs forcées.
- Les effets sont décoratifs : aucune information ni action essentielle ne
  dépend d'une animation. Aucun capteur n'est activé par le système de design.
- Le validateur de plans vérifie les contrastes des tokens sur surfaces opaques.
  Ce contrôle n'est pas une certification d'accessibilité de toute l'application.
- Le studio offre des aperçus de layout à 1280, 768 et 390 px, mis à l'échelle
  pour tenir dans le panneau. Les tests navigateur vérifient les usages réels.

Le dialogue Web Studio possède titre accessible, gestion clavier, contrôle du
focus et restitution du focus à la fermeture. Les statuts/erreurs ont des régions
accessibles. Les sites exportés utilisent des ancres et `details/summary` natifs.

## Ce qui modernise déjà IDA elle-même

- `AnimatedBackdrop` est maintenant réellement réutilisé par `SceneAtmosphere`
  dans les accueils Classic/Sci-Fi et les environnements : deux couches de lumière
  pour plafonds/fenêtres et reflets au sol. Le rendu local est adapté au décor,
  pas une injection de CSS du catalogue externe. Voir `SCENE_ANIMATIONS_20260919.md`.
- La Fabrique : les quatre boutons **Créer un agent / Explorer les templates /
  Mes agents / Déployer** et le panneau **Domaines populaires** emploient
  maintenant `MotionPanel`. Leurs callbacks et leur disposition ne changent pas.
  Le reflet de survol est champagne en Classic et bleuté en Sci-Fi ; les contrôles
  restent natifs et le contenu n'est jamais initialement caché.
- L'accès **Ouvrir Web Studio** (ou **Déployer**) ouvre l'éditeur chargé à la
  demande. L'ancienne carte `ida-fabrique-entry` n'est plus rendue par la nouvelle
  composition de référence : ne pas la présenter comme un effet encore visible.
- Creative Engine : boutons de retour/actualisation/création, navigation active,
  panneaux et états avec les tokens communs ; métier existant conservé.
- Web Studio : même fondation pour l'éditeur, le catalogue et le site produit.

L'audit du 23 septembre a constaté que `MotionPanel` était installé mais sans
appel après le remplacement de l'ancienne entrée Fabrique. Le raccordement aux
modules ci-dessus corrige cette régression d'adoption, sans annoncer une migration
complète d'IDA. Les MCP shadcn, Magic UI et Watermelon restent des outils de
développement ; ils ne rendent aucun effet à eux seuls. Les entrées externes du
catalogue Web Studio ne sont pas des composants automatiquement incorporés.

Cette fondation ne prétend pas à elle seule animer les photographies de tous les environnements,
remplacer les maquettes de Chat/Voice/Care ni fournir une scène 3D. Le hero du site
emploie des formes CSS ; R3F/Three demeure prévu, pas installé. Haikei reste une
source d'assets à valider, pas une intégration active.

## Composition et validation

Le Design Brain est **local et déterministe**. Il transforme un brief borné en
plan validé ; il ne consomme pas de quota LLM. Les descriptions sont des textes,
jamais des scripts. Aperçu et export utilisent `renderSiteHtml()` avec CSS
embarquées et CSP restrictive. Les imports de plans sont validés et bornés.

Références de vérification : tests `frontend/{registry,design-brain,site-export,MotionPanel}.test.ts`,
tests navigateur `e2e/fabrique-web.spec.ts`, build et checkpoint
`docs/checkpoints/FRONTEND_FOUNDATION.md`. Les résultats datés du checkpoint font
foi ; ce document n'annonce pas à lui seul un passage des tests.
