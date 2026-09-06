# Roue des Mondes — première tranche cliente

## Portée livrée — 6 septembre 2026

La vision validée organise IDA par **monde → environnement → espaces → agents → outils**. Cette tranche construit la navigation, pas de nouveaux agents ni de nouvelles capacités métier. Le monolithe modulaire et tous les modules musicaux et sociaux sont conservés.

| Monde | Espaces réellement reliés |
|---|---|
| Music Studio | Artist Brain (`memory`), Music Brain (`music`) |
| Content Studio | Content Library (`content`) |
| Social Hub | Social Brain (`social`), Approval Center et bibliothèque (`content`), calendrier, campagnes, statistiques |
| Workspace | Command Center (`home`), conversation (`ida`), tâches, mémoire, système et agents |
| Travel, Finance, Research, Admin, Legal, Health, Home, IDACAR | À venir : aucune action, aucun outil, aucun agent actif |

Artist Brain et Mémoire conduisent volontairement à l’écran partagé existant, pas à deux mémoires. `home` ouvre la vue d’ensemble, `ida` la conversation. « Explorer tous les espaces » conserve un accès direct à chacun des onze modules, en complément de la roue et de la navigation mobile.

## Contrats et composants

- `apps/web/src/worlds.ts` : catalogue local de navigation, cibles `NavigationId`, vidéo facultative, sélection clavier/scroll et conditions de lecture. Ce n’est **pas** l’Agent Registry : aucune permission, aucun manifeste d’exécution ni nouvelle API.
- `WorldWheel.tsx` : rail tactile/trackpad avec perspective, boutons précédent/suivant, grille alternative et environnement avec espaces. Tab/Entrée/Espace restent disponibles ; gauche/droite/Début/Fin sélectionnent. L’ouverture focalise le titre ; retour/Échap restitue le focus au bouton d’entrée.
- `WorldAmbience.tsx` : unique lecteur décoratif à la demande, arrêt et démontage en sortie, masquage ou changement de thème. L’environnement hors écran arrête aussi la vidéo. Aucun redémarrage automatique au retour.
- `AuroraHome.tsx`, `App.tsx`, `worlds.css` : choix **Classic / Sci-Fi limité à l’accueil et aux environnements**. Les écrans métier restent clairs. Le choix reste en mémoire cliente pendant la navigation ; rechargement ou fermeture de la frontière d’accès revient à Classic. Aucun enregistrement dans la mémoire artistique ni synchronisation.
- `main.tsx` : feuille de style additionnelle. Aucun nouveau paquet, contrat API, schéma ou changement d’autorisation.

Le thème Sci-Fi utilise l’observatoire fourni comme décor d’accueil statique, pas comme remplacement d’une vidéo de monde. Les cartes sans vidéo restent des surfaces de navigation neutres et portent « Vidéo à venir ». Le vortex et le Theme Engine généralisé ne sont pas implémentés ici.

## Médias locaux et provenance

Fichiers utilisateur copiés sans transformation dans `apps/web/public/design/`, exclus explicitement de Git :

| Fichier local | Source utilisateur | Vérification |
|---|---|---|
| `world-reference-v1.mp4` | `Downloads/tmphku6ngi6.mp4` | Studio musical au coucher du soleil ; 480 × 832, 4,78125 s, 1 220 896 octets. Lecture navigateur vérifiée, muette. SHA-256 `1C372E19BFBA2753C1537DBB242646E03AD2A7F84F83B7CE29DE53F049B6727E`. |
| `scifi-observatory.png` | `Downloads/9b7ff4b5-2ee2-4a84-9abf-5ca84e679327.png` | Observatoire spatial paysage. SHA-256 `E861AAAFD348C6ED132DF71DF3933C71ED325745091505002F83D7AB8EB6F856`. |

Les autres fichiers sont des références artistiques, non des interfaces incrustées. Aucune génération ni transmission externe de média. Les vidéos suivantes seront ajoutées après réception et vérification du contenu/format ; elles ne bloquent pas les modules actuels.

Ces fichiers sont des **décors publics du client de démonstration locale**, pas des médias du DAM privé ; ils ne doivent contenir aucune donnée sensible. Les contenus musicaux privés continuent de passer par l’API, le stockage privé et les contrôles de workspace. Un autre checkout doit recevoir les décors séparément : Git ne les transporte pas. Une vidéo absente/illisible affiche une erreur et un réessai, sans bloquer les espaces.

## Activation, ressources et repli

- Aucun lecteur/source vidéo au rendu initial ni au simple changement de thème. Music Studio propose « Lire l’ambiance vidéo » ; lecture muette, en boucle, inline, avec arrêt explicite.
- Aucun son, microphone, caméra, permission OS, image biométrique, appel IA ou enregistrement de préférence durable.
- Mouvement réduit (`prefers-reduced-motion`) ou économie de données (`saveData`, si exposé par le navigateur) : lecture refusée et indication visible. Sans détection d’économie, l’activation reste manuelle.
- Une vidéo montée au maximum, aucun préchargement des autres clips. Pause/démontage en sortie, masquage ou changement de thème ; nettoyage des abonnements et rejet tardif de lecture ignoré.
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

Tests : toutes les cibles existantes, mondes futurs inertes, mémoire partagée, limites clavier, sélection par position, rendu des thèmes sans callbacks, lecteur absent avant demande et conditions de refus de lecture. Recette navigateur sur les composants réels sans écrire de donnée métier.

Ce n’est ni une validation de sécurité Internet ni une recette iPhone/Android physique. Les captures de l’aperçu sont partiellement tronquées dans l’environnement de test : ne pas confondre inspection fonctionnelle et validation visuelle multi-appareils complète.
