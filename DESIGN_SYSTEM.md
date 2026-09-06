# IDA — Design personnalisable et expériences visuelles

## Statut

Première tranche `IDA_AURORA` livrée le 5 septembre 2026 : accueil clair inspiré des deux références desktop/mobile, décor d’atrium local sans texte, typographie fine, verre dépoli, cinq cartes vers les espaces existants et accès aux six autres modules. Le champ de commande appelle le même IDA Core. Le Command Center opérationnel reste accessible depuis sa carte ; aucun module n’est supprimé.

Le verrou local et les espaces internes partagent une palette claire à travers les variables CSS `--ida-*`. Le bouton soleil de l’accueil réduit sa transparence pour la visite courante ; ce réglage n’est pas encore persistant ni synchronisé. Les cartes désignent des espaces, pas des agents prétendument actifs. Les compteurs proviennent du résumé API et restent indisponibles en cas d’échec.

Cette tranche n’implémente pas encore de `ThemeProvider`, de manifeste appliqué, de thème Cosmos, de vortex, de caméra, de geste ou de fond d’écran natif. Le reste de ce document décrit ces étapes futures.

Fichiers : `apps/web/src/AuroraHome.tsx`, `aurora.css`, tokens partagés dans `styles.css` et raccordement dans `App.tsx`. Le décor généré est livré localement mais exclu de Git conformément à la règle sur les médias ; provenance, prompt et chemin dans [Aurora — ressource graphique](docs/AURORA_ASSET.md). Sans ce fichier, le fond ivoire de repli conserve une interface fonctionnelle.

## Direction artistique commune

Les références fournies fixent le langage visuel principal : architecture lumineuse, blancs chauds, verre dépoli, lumière naturelle, volumes calmes, typographie fine et espacée, profondeur discrète et très peu de contrôles visibles à la fois.

Tous les thèmes IDA doivent rester :

- premium, lisibles et minimalistes ;
- cohérents sur desktop et mobile ;
- contextuels plutôt que chargés en widgets ;
- accessibles au clavier, au tactile et aux technologies d'assistance ;
- indépendants des données, permissions, agents et règles métier.

Les thèmes ne peuvent jamais transformer un état simulé en capacité active, cacher une demande d'approbation ou altérer le sens d'un statut système.

## Thèmes initiaux visés

### `IDA_AURORA`

Thème premium clair inspiré des références : ivoire, sable, verre opalin, accents bleu très pâle, halos diffus et ombres larges. Il constitue le thème principal et la référence de lisibilité.

### `IDA_COSMOS`

Thème secondaire futuriste pour une expérience plus science-fiction : noir spatial profond, champs d'étoiles mesurés, verre fumé, lumière froide/blanche, volumes orbitaux et détails lumineux précis. Il doit rester une interprétation Apple premium, jamais un dashboard cyberpunk, une accumulation de néons ou un décor qui gêne le contenu.

## Personnalisation contrôlée

La personnalisation passera par des design tokens versionnés et non par du CSS arbitraire :

- thème ;
- couleur d'accent parmi une palette contrôlée ;
- contraste ;
- densité ;
- taille typographique ;
- niveau de transparence ;
- niveau de mouvement ;
- arrière-plan statique ou cinématique autorisé.

Le choix par défaut peut suivre le compte et être synchronisé. Le terminal conserve un override local pour performance, accessibilité et économie d'énergie. Au début, aucun thème tiers, script, URL distante ou asset non vérifié ne sera chargé.

## Séquence d'ouverture cinématique

Le thème Cosmos pourra proposer :

```text
IDA apparaît lettre par lettre
          ↓
profondeur lumineuse / vortex spatial
          ↓
transition continue vers le Command Center dans les étoiles
```

Cette séquence sera :

- activée volontairement et séparément du thème ;
- courte, interrompable et jamais rejouée à chaque navigation ;
- totalement supprimée avec `prefers-reduced-motion` ou le niveau de mouvement `OFF` ;
- simplifiée automatiquement sur mobile, batterie faible ou matériel insuffisant ;
- sans appel IA, réseau, caméra ou microphone ;
- incapable de retarder l'accès aux tâches, validations ou alertes importantes.

Une illustration statique élégante constitue toujours le fallback. Les animations utiliseront d'abord CSS/WebGL léger mesuré ; aucune librairie 3D lourde ne sera ajoutée avant un prototype profilé.

## Architecture frontend cible

```text
ThemeManifest
    ├── design tokens
    ├── assets locaux vérifiés
    ├── capacités de mouvement
    └── variantes desktop/mobile
              ↓
ThemeProvider → composants IDA existants
              ↓
MotionPolicy → intro / transitions / arrière-plan
```

Le futur contrat `ThemeManifest` déclare version, palette, tokens, assets locaux, compatibilité et niveau matériel minimal. Le client applique le thème ; le serveur stocke seulement la préférence validée. Aucune logique métier ne dépend d'un thème.

## Mode fond d'écran desktop futur

Une capacité `AMBIENT_DESKTOP` pourra afficher IDA comme surface d'ambiance sur la version ordinateur. Le premier candidat est Windows ; le contrat restera compatible macOS lorsque ce client existera.

Ce mode devra :

- être installé et activé explicitement ;
- masquer les données privées par défaut ;
- fonctionner sans modèle IA, micro ou caméra en arrière-plan ;
- offrir sortie immédiate, pause, limite de ressources et mode économie d'énergie ;
- ne jamais remplacer l'application classique ;
- utiliser une intégration native isolée plutôt qu'une modification fragile du shell système.

iOS et Android n'exposeront pas cette fonction desktop. Une éventuelle expérience de verrouillage mobile fera l'objet d'un contrat distinct avec les limites des OS.

## Tests requis avant livraison

- contraste, zoom, navigation clavier/tactile et lecteurs d'écran ;
- rendu desktop, tablette, iPhone et Android ;
- `prefers-reduced-motion`, mouvement `OFF` et intro interrompue ;
- absence d'accès réseau/caméra/micro lors de l'intro ;
- restauration sûre après thème invalide ou asset absent ;
- budget CPU/GPU/mémoire et batterie ;
- aucune différence fonctionnelle ou de permission entre thèmes ;
- aucun contenu sensible visible dans `AMBIENT_DESKTOP` sans déverrouillage.

## Ordre de livraison

1. Stabiliser les tokens Aurora et terminer la recette visuelle/accessibilité des modules ; la première composition d’accueil est livrée.
2. Ajouter un `ThemeProvider` et une préférence persistante sans nouvelle animation.
3. Formaliser `IDA_AURORA` comme manifeste de référence, sans reconstruire les composants livrés.
4. Prototyper `IDA_COSMOS` derrière un flag utilisateur.
5. Mesurer puis ajouter l'intro cinématique optionnelle.
6. Étudier `AMBIENT_DESKTOP` seulement après le client desktop natif.

Cette évolution ne doit pas retarder Identity, le Core, Music, Content, Approval ou Social.
