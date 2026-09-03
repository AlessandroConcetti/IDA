# IDA — Input Providers et contrôle gestuel futur

## Statut

Contrat architectural futur. Aucun accès caméra ni moteur de détection gestuelle n'est livré ou activé.

## Principe absolu caméra

> Pas de demande explicite de l'utilisateur = pas de caméra.

La caméra ne peut être ouverte ni au démarrage, ni à l'ouverture de Home, ni en arrière-plan, ni par un agent, une automatisation, une recommandation, une préférence antérieure ou une détection de contexte. Même configurée, la fonction attend une nouvelle action explicite de l'utilisateur pour chaque session d'utilisation.

Le consentement OS ne vaut pas demande fonctionnelle. IDA doit cumuler : action utilisateur courante, permission OS et indicateur visible. L'utilisateur peut arrêter la capture immédiatement.

## Flux cible

```text
Action explicite « Activer les gestes »
                 ↓
CameraLease courte et visible
                 ↓
Gesture Detection locale
                 ↓
GestureInputProvider
                 ↓
événement UI standardisé
                 ↓
carousel des agents
```

Le `CameraLease` est créé uniquement depuis le parcours interactif autorisé. Il est fermé lors de l'arrêt, de la navigation hors du parcours, du verrouillage, de la perte de visibilité, d'une erreur ou d'une expiration courte.

## Contrat `GestureInputProvider`

Le provider ne reçoit aucun outil IDA. Il transforme localement des observations en événements UI bornés :

```text
SWIPE_LEFT
SWIPE_RIGHT
POINT        (futur, désactivé par défaut)
PINCH        (futur, désactivé par défaut)
```

La première capacité se limite à faire défiler le carousel des agents. Elle ne sélectionne pas un agent, n'envoie pas une commande, ne valide pas une approbation et ne déclenche jamais un outil. `POINT` et `PINCH` exigeront une nouvelle décision d'ergonomie et de sécurité.

Le moteur de vision est interchangeable derrière ce contrat. La préférence va à une détection locale ; aucun flux, frame ou feature biométrique ne quitte le terminal sans une future capacité cloud distincte, explicitement demandée et documentée.

## Vie privée et données

- aucun enregistrement photo ou vidéo ;
- aucun buffer conservé après traitement ;
- aucun visage, empreinte ou profil biométrique ;
- aucun contenu caméra dans les logs, analytics, prompts ou mémoire ;
- seul un événement discret, sa confiance bornée et son instant peuvent exister en mémoire volatile ;
- l'état caméra actif est toujours visible ;
- l'interface classique reste entièrement fonctionnelle sans permission caméra.

## Plateformes

Web/PWA, Windows, macOS, iOS et Android peuvent fournir une caméra via des APIs différentes. Chaque client adapte la source au même `GestureInputProvider`; le Core ne voit jamais les images. Un client sans caméra ou sans moteur compatible annonce simplement `UNAVAILABLE`.

## Tests obligatoires

- zéro demande de permission ou ouverture caméra au démarrage et à la navigation ;
- agent, automatisation et commande distante incapables d'activer la caméra ;
- activation seulement après geste utilisateur vérifiable ;
- arrêt immédiat, expiration et fermeture à la perte de visibilité ;
- aucun frame envoyé au backend, provider cloud, log ou mémoire ;
- `SWIPE_LEFT/RIGHT` bornés au carousel ;
- faux positifs ignorés sous le seuil de confiance ;
- clavier, souris, tactile et lecteurs d'écran toujours utilisables ;
- état `UNAVAILABLE` honnête lorsqu'aucune capacité n'est installée.

## Non-objectifs

- contrôle intégral d'IDA par gestes ;
- écoute vidéo permanente ;
- reconnaissance faciale ou d'identité ;
- validation d'une publication, d'un achat ou d'une action sensible ;
- développement du moteur avant le Core, Identity et les fonctions prioritaires.
