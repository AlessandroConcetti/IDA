# Travel — menu de destinations et carnet, 10 septembre 2026

## Parcours

Roue des mondes → Travel / Explorer → bandeau « Où partons-nous ? » → pays → carnet. L'environnement, la scène nettoyée fournie et le point d'entrée sont conservés. Le bandeau des pays remplace la rangée de boutons fixe, sans ajouter un autre accueil.

Le bandeau est dépliable/repliable. Les six suggestions éditoriales existantes deviennent des cartes photographiques à défilement horizontal : Japon, Thaïlande, Italie, Islande, États-Unis, Bali. Recherche sans sensibilité aux accents, filtre Culture/Nature/Villes, contrôles précédent/suivant, défilement tactile et commandes accessibles au clavier. La sélection n'est ni une recommandation calculée par IA ni un classement de destinations validé en temps réel.

Une carte est mise en avant toutes les 6,5 secondes, avec déplacement doux de la bande et léger mouvement de sa photographie. Pause explicite ; arrêt au survol, au focus, pendant l'ouverture d'un panneau, lorsque le menu est fermé ou hors du viewport, lorsque la page est masquée, avec réduction de mouvement système ou arrêt des reflets. Une interaction de défilement manuel arrête la rotation jusqu'à reprise volontaire. Aucun son, vidéo, capteur ou appel fournisseur n'est lancé par le menu. Les photographies utilisent le décor local existant, sans nouvelle génération ni téléchargement. Les vidéos de la roue restent inchangées.

## Carnet utilisable

- Destination, dates facultatives, nombre de voyageurs et notes.
- Jusqu'à huit étapes avec lieu, date facultative, intention et commandes de réorganisation ; pas de tri imposé.
- Jusqu'à huit postes budgétaires, enveloppe globale, sous-total renseigné, marge/dépassement et montant par voyageur. Calcul en centimes ; champs inconnus distincts de zéro ; aucune conversion de devise ou récupération de tarifs.
- Jusqu'à douze préparatifs avec cases à cocher et progression.
- Vue récapitulative, export texte volontaire sur l'appareil et enregistrement dans les tâches partagées d'IDA.
- Réouverture depuis les aperçus de l'accueil Travel ou « Mes voyages » ; actualisation de la liste et navigation vers les tâches existantes.

Fermer le panneau ne détruit pas le brouillon. Changer de destination ou ouvrir un autre carnet demande un choix avant remplacement d'un brouillon modifié. Quitter Travel, recharger l'application ou la verrouiller détruit le brouillon non enregistré ; aucune mémoire navigateur durable n'est créée.

## Réutilisation et limites de persistance

Réutilisés : `ReferenceEnvironment`, `ReferenceRail`, `Sheet` natif (focus/Échap), `LineIcon`, animations Glass, transport API et outils TASKS existants. Aucun endpoint, modèle d'autorisation, table, agent ou dépendance supplémentaire.

Le carnet est une représentation versionnée d'un document de préparation dans `TaskRecord.description`, précédée de `IDA · Carnet de voyage · v1`. Son titre garde le préfixe `Voyage · `. Le contrat partagé est `packages/contracts/src/travel-notebook.ts` ; parsing strict, dates civiles réelles, tailles, limites et types. Le serveur reste l'autorité de l'accès et de l'écriture d'une tâche. Il ne traite pas ce texte comme une autorisation, une action de réservation ou un nouveau domaine métier.

La limite serveur de 4 000 caractères est conservée. Les notes ne sont jamais tronquées pour faire passer une sauvegarde. Les dates de départ/retour restent des dates civiles du carnet, pas des timestamps `dueAt`, et ne créent pas d'événement d'agenda.

L'API actuelle n'a pas de modification générale des tâches. Un carnet enregistré est donc ouvert en lecture seule. « Préparer une copie » permet de travailler sur un nouveau brouillon et annonce explicitement qu'une nouvelle tâche sera créée ; l'original n'est jamais écrasé. Les anciens projets et les formats inconnus restent lisibles sous forme de texte brut, jamais interprétés partiellement ni convertis silencieusement.

La création n'a pas de clé d'idempotence serveur. Un verrou synchrone empêche les doubles clics et une réponse réussie place le carnet en lecture seule. Aucun POST n'est rejoué automatiquement. Un résultat réseau ambigu bloque le renvoi et invite à consulter/actualiser Mes voyages avant une éventuelle nouvelle création ; un refus explicite de validation/droits/quota préserve le brouillon éditable. Cela n'est pas une garantie d'unicité globale contre des requêtes sur plusieurs appareils.

Pas de réservation, paiement, prix réel, formalité d'entrée validée, invitation, géolocalisation, partage automatique, IA ou synchronisation d'agenda. La liste est la projection des tâches renvoyées par le Core, pas une collection exhaustive de réservations.

## Vérification

Dix tests ciblés couvrent le round-trip, les formats inconnus, dates et DST, dates hors voyage, budget exact et valeurs inconnues, déplacement sans mutation, limites de taille, doublons d'identifiants et filtres de destinations. Vérification de types et compilation Web réalisées. Contrôle de format/lint sur les fichiers TypeScript concernés. Pas de recette navigateur ou sur téléphone dans cette tranche, ni création de carnet au nom de l'utilisateur dans sa base. Le verrou local existant reste nécessaire pour les lectures et sauvegardes authentifiées.

Les environnements Research/Travel/Music et leurs ajouts sont chargés à l'ouverture plutôt qu'avec la roue, pour limiter son chargement initial. Ce choix est une optimisation cliente sans changement du Core.
