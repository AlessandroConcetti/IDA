# Roue des Mondes — première tranche cliente

## Portée livrée — mise à jour du 9 septembre 2026

La vision validée organise IDA par **monde → environnement → espaces → agents → outils**. Cette tranche construit la navigation, pas de nouveaux agents ni de nouvelles capacités métier. Le monolithe modulaire et tous les modules musicaux et sociaux sont conservés.

| Monde | Espaces réellement reliés |
|---|---|
| Music Studio | Artist Brain (`memory`), Music Brain (`music`) |
| Content Studio | Content Library (`content`) |
| Social Hub | Social Brain (`social`), Approval Center et bibliothèque (`content`), calendrier, campagnes, statistiques |
| Workspace | Command Center (`home`), conversation (`ida`), tâches, mémoire, système et agents |
| IDA Home | Tâches, calendrier et mémoire existants ; aperçu quotidien en lecture seule, voir [IDA Home](IDA_HOME.md) |
| Travel, Finance, Research, Admin, Legal, Health, IDACAR | À venir : aucune action, aucun outil, aucun agent actif |

Artist Brain et Mémoire conduisent volontairement à l’écran partagé existant, pas à deux mémoires. `home` ouvre la vue d’ensemble, `ida` la conversation. « Explorer tous les espaces » conserve un accès direct à chacun des onze modules, en complément de la roue et de la navigation mobile.

## Contrats et composants

- `apps/web/src/worlds.ts` : catalogue local de navigation, cibles `NavigationId`, vidéo facultative, sélection clavier/scroll et conditions de lecture. Ce n’est **pas** l’Agent Registry : aucune permission, aucun manifeste d’exécution ni nouvelle API.
- `WorldWheel.tsx` : rail tactile/trackpad avec perspective, boutons précédent/suivant, grille alternative et environnement avec espaces. Tab/Entrée/Espace restent disponibles ; gauche/droite/Début/Fin sélectionnent. L’ouverture focalise le titre ; retour/Échap restitue le focus au bouton d’entrée.
- `WorldAmbience.tsx` : lecteur décoratif automatique sur la carte sélectionnée ou l’environnement ouvert, seulement après vérification de la visibilité et des préférences. Arrêt/démontage hors écran, onglet masqué ou sortie ; reprise au retour si l’utilisateur ne l’a pas arrêté. Le changement de thème seul ne recrée pas le lecteur.
- `AuroraHome.tsx`, `App.tsx`, `theme.ts`, `global-theme.css` : choix **Classic / Sci-Fi global**, incluant modules métier, formulaires, calendrier, navigation mobile et verrou. Préférence `ida.ui.theme.v1` conservée dans ce navigateur, sans synchronisation ni mémoire artistique. Stockage refusé : thème valable pour la visite uniquement. Le bouton reste accessible dans l’en-tête des modules.
- `world-scenes.css` : décors photographiques fournis, cadrage des cartes et contraste sur les ambiances. `main.tsx` applique la préférence avant le montage de la frontière d’accès. Aucun nouveau paquet, contrat API, schéma ou changement d’autorisation.

Le thème Sci-Fi conserve l’observatoire fourni comme décor d’accueil. Les cartes sans vidéo utilisent désormais les scènes fournies et portent « Vidéo à venir ». Les ambiances des environnements restent distinctes du choix de palette. Le vortex et un éditeur libre de thèmes ne sont pas implémentés ici.

## Médias locaux et provenance

Fichiers utilisateur copiés sans transformation dans `apps/web/public/design/`, exclus explicitement de Git :

| Fichier local | Source utilisateur | Vérification |
|---|---|---|
| `world-reference-v1.mp4` | `Downloads/tmphku6ngi6.mp4` | Studio musical au coucher du soleil ; 480 × 832, 4,78125 s, 1 220 896 octets. Lecture navigateur vérifiée, muette. SHA-256 `1C372E19BFBA2753C1537DBB242646E03AD2A7F84F83B7CE29DE53F049B6727E`. |
| `scifi-observatory.png` | `Downloads/9b7ff4b5-2ee2-4a84-9abf-5ca84e679327.png` | Observatoire spatial paysage. SHA-256 `E861AAAFD348C6ED132DF71DF3933C71ED325745091505002F83D7AB8EB6F856`. |

Ajouts dans `public/design/user-20260909/`, copiés sans transformation depuis le dossier utilisateur `FRONTEND VISUELS`, également ignorés par Git :

| Fichier local | Source | Usage |
|---|---|---|
| `ambient-2.mov` | `Vidéo_1.mov` | Observatoire de Workspace, H.264, 480 × 272 ; lecture navigateur vérifiée. |
| `ambient-3.mov` | `Vidéo_2.mov` | Atrium d’IDA Home, H.264, 568 × 320 ; décodage navigateur vérifié. |
| `ambient-1.mov` | `Vidéo.mov` | Avatar, 480 × 276 ; inspecté mais non intégré (texte incrusté et filigrane). |
| `classic-atrium.png` | `2fc4fba4-e5c8-48c4-8873-853b49c49b72.png` | Fond portrait Classic et poster d’IDA Home. |
| `world-scenes.png` | `196e6e28-ba78-4a0f-925c-1dca239ee77a.png` | Planche de douze scènes, cadrée par CSS pour les cartes. |

Les autres images sont des références artistiques, non des interfaces incrustées. Aucun filigrane retiré, aucune génération ni transmission externe de média. Les clips fournis sont de basse résolution : ne pas présenter leur agrandissement comme un décor HD final.

Ces fichiers sont des **décors publics du client de démonstration locale**, pas des médias du DAM privé ; ils ne doivent contenir aucune donnée sensible. Les contenus musicaux privés continuent de passer par l’API, le stockage privé et les contrôles de workspace. Un autre checkout doit recevoir les décors séparément : Git ne les transporte pas. Une vidéo absente, illisible ou refusée par le navigateur laisse le poster visible, sans bloquer les espaces ni créer de boucle de réessais.

## Activation, ressources et repli

- Aucun lecteur/source vidéo au rendu serveur : la visibilité et les préférences navigateur sont vérifiées avant montage. Lecture automatique, muette, en boucle, inline, sans bouton Play ni contrôles natifs. Un bouton commun permet de désactiver les ambiances pendant la visite de la roue.
- Aucun son, microphone, caméra, permission OS, image biométrique ou appel IA. Les préférences clientes n’activent aucun capteur, agent ou outil.
- Mouvement réduit (`prefers-reduced-motion`) ou économie de données (`saveData`, si exposé) : poster uniquement. Sans `IntersectionObserver`, le repli reste statique. Sans API `saveData`, les autres contrôles s’appliquent ; on ne peut pas détecter un mode économie non exposé.
- Une vidéo montée au maximum, uniquement sur la carte sélectionnée (jamais dans la grille) ou dans l’environnement ouvert. Aucun préchargement des autres clips. Pause/démontage en sortie ou masquage ; nettoyage des abonnements et rejet tardif de lecture ignoré.
- Aucune information indispensable dans un décor. Surfaces opaques, focus, libellés, commandes classiques et grille restent disponibles.

## Suite : dépendances et critères d’acceptation

1. **Consolider la démo** : compléter calendrier et verrou, recette desktop/téléphone, erreurs et restauration. Aucun retrait de contrôle pour réussir une démonstration.
2. **Compléter les ambiances** : recevoir les vidéos, cadrer desktop/mobile, limiter poids/décodage et vérifier sur appareils physiques. Critère : une seule ambiance active, arrêt fiable et interface complète sans vidéo.
3. **Missions et contexte** : proposer les adaptations minimales Request Context, Context Broker et missions persistées. Réutiliser Identity, workspace et Tool Gateway ; validation avant modification structurelle.
4. **Providers, sorties réseau et coffre** : définir fournisseurs, egress autorisé, compartiments, rétention, sauvegarde/restauration et récupération. Validation et tests avant exposition réseau ; un appareil authentifié ne contourne jamais les permissions des outils.
5. **Agents par domaine** : manifestes versionnés, outils/contexte bornés, évaluations, gouvernance spécialisée et escalade humaine. Finance/Banque en lecture seule par défaut ; pas de paiement, de professionnel simulé ou de modèle continuellement actif. Pas de microservices par défaut.
6. **Clients et personnalisation avancés** : même Core pour navigateur téléphone, Windows, Mac, iOS, Android et futurs clients. Anglais après consolidation française ; voix opt-in, gestes et fond d’écran desktop restent des capacités séparées. Jamais de caméra sans nouvelle demande explicite dans le parcours courant.

Pas de calendrier arbitraire : chaque tranche nécessite ses données, limites de sécurité et critères de sortie. Aucun domaine futur n’est activé par sa seule présence dans la roue.

## Vérification

### Cartes immersives — correction du 9 septembre 2026

- Les dimensions du rail sont désormais définies dans `worlds.css`, sans réduction concurrente dans `home.css` ni hauteur contradictoire dans `world-scenes.css`. Largeur desktop 280–360 px, hauteur minimale 460 px ; sous 600 px, largeur `clamp(230px, 72vw, 330px)` et hauteur minimale 420 px. La grille conserve ses dimensions compactes indépendantes.
- Dans l'aperçu de 1 278 px, la carte active passe de 217 × 249 à 358 × 460 px (environ trois fois la surface). Au breakpoint téléphone testé à 480 px : 330 × 420 px ; aucun débordement horizontal de la page, y compris dans la grille.
- La carte active ne porte plus de transformation 3D ni de transition de transformation : son lecteur reste sur un plan 2D, comme l'environnement ouvert. La perspective des cartes voisines est conservée. Aucun changement de fichier vidéo, de résolution, de permission ou de politique d'autoplay.
- Diagnostic temporaire `getVideoPlaybackQuality()` sur huit secondes : 259 images, aucune image perdue pour la carte corrigée et pour l'environnement. Le même relevé avec l'ancien transform ne perd pas non plus d'image : la saccade signalée n'est **pas reproduite par ces compteurs** et sa cause n'est pas démontrée. Ces données ne mesurent pas toute la fluidité de composition à l'écran. Instrumentation retirée après comparaison ; confirmation sur l'affichage utilisateur encore nécessaire.
- Recette sans donnée métier modifiée : sélection clavier Début/Fin, retour grille/rail, zéro vidéo dans la grille et après arrêt manuel ; reprise et entrée Music Studio avec un seul lecteur. Tests frontend, types, lint des styles modifiés et build vérifiés.

Tests : toutes les cibles existantes, mondes futurs inertes, mémoire partagée, limites clavier, sélection par position, rendu des thèmes sans callbacks, lecteur absent avant détection des préférences, conditions de refus et persistance bornée du thème. Recette navigateur sur les composants réels sans écrire de donnée métier : autoplay Music Studio/Workspace, arrêt, navigation entre modules, palettes et stockage du thème.

Ce n’est ni une validation de sécurité Internet ni une recette iPhone/Android physique. Les captures de l’aperçu sont partiellement tronquées dans l’environnement de test : ne pas confondre inspection fonctionnelle et validation visuelle multi-appareils complète.
