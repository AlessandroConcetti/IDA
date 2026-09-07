# IDA Home — un environnement dans l’accueil existant

## Décision UX — 7 septembre 2026

IDA conserve **un seul accueil principal**, `AuroraHome`, derrière la frontière d’accès existante. IDA Home est le monde `home` de la Roue des Mondes, et non une deuxième page d’accueil ou application. Le parcours reste accueil → Roue → environnement → espaces → agents/outils existants. Aucun agent ni outil supplémentaire n’est activé par cette navigation.

L’utilisateur peut choisir « Ouvrir IDA Home dans l’accueil au démarrage ». Cela ouvre ce même environnement dans le même composant : aucune nouvelle route, aucun deuxième Core. La Roue reste toujours accessible par le retour ou Échap. Sans choix, l’accueil présente la Roue, initialement centrée sur Music Studio.

Attention au vocabulaire : le monde `home` contient IDA Home ; la cible de navigation métier `home`, déjà existante, reste le Command Center. Ce sont deux identifiants dans deux catalogues distincts, pas deux accueils. IDA Home ne possède aucune nouvelle cible métier.

## Première tranche utilisable

- Accueil existant recomposé : navigation latérale desktop, commande et suggestions à envoyer explicitement, quatre compteurs issus du résumé serveur, Roue, explorateur des onze modules et navigation mobile.
- Dans IDA Home : trois premières tâches ouvertes classées par échéance, nombre total de tâches ouvertes, trois derniers événements du journal et accès à la conversation. Les espaces Tâches, Calendrier et Mémoire réutilisent leurs écrans et données actuels.
- Les échéances utilisent le fuseau du workspace. La date affichée en haut vient de `workspaceDate` serveur ; aucun prénom, horaire ou compteur n’est inventé.
- « Dernière activité » est un historique, **pas un centre de notifications**. Une planification interne n’est jamais présentée comme une publication sur une plateforme réelle.
- Classic / Sci-Fi, transparence réduite, clavier et présentation responsive sont conservés. Aucun décor ou clip supplémentaire n’est généré. L’ambiance d’IDA Home attend la vidéo utilisateur.

Maison, courses, budget, banque et domotique restent à venir. Ce premier environnement regroupe le quotidien déjà disponible ; il ne simule pas des fonctionnalités domestiques ou des agents professionnels actifs.

## Composants et données

| Fichier | Responsabilité |
|---|---|
| `apps/web/src/AuroraHome.tsx` | Unique accueil, composition, raccourcis, état de présentation et entrée de la Roue |
| `WorldWheel.tsx` | Ouverture facultative d’un monde connu, emplacement de contenu contextuel, retour/focus existants |
| `worlds.ts` | Monde IDA Home et cibles des espaces existants ; les autres mondes sont préservés |
| `HomeOverview.tsx` | Lectures indépendantes des tâches et de l’activité, états et liens, aucun formulaire métier |
| `home-overview.ts` | Tri de présentation, formatage, libellés d’activité bornés et cibles des compteurs |
| `home-start.ts` | Préférence locale de démarrage, lecture défensive et enregistrement explicite |
| `home.css` | Composition et adaptation desktop/mobile avec les tokens existants |

Réutilisation exclusive des contrats actuels : résumé déjà chargé par `App`, `fetchTasks()`, `fetchActivityLogs({ limit: 3 })`, transport même origine et `SnapshotReader`. Aucun endpoint, schéma, migration, manifeste d’agent ou paquet ajouté.

Les deux nouvelles lectures ne sont connectées que lorsque l’environnement IDA Home est monté et que la source API est disponible. Le démontage déconnecte les lecteurs et ignore les résultats tardifs. Chargement, absence de données et erreur sont distingués ; un ancien résultat n’est pas affiché pendant une relecture. Les cartes disposent d’un réessai et d’une actualisation manuelle.

Le signal local de mutations existant peut déclencher une relecture. Les tâches et préférences modifiées dans leurs espaces sont relues au retour, par remontage. **Ce n’est pas une synchronisation temps réel entre onglets ou appareils** ; aucune boucle de polling ou agent permanent n’est ajoutée.

## Préférence et sécurité

`ida.ui.start-view.v1` contient uniquement `home` ou `worlds` dans le stockage local du navigateur, après action explicite. Valeur absente, invalide ou accès refusé : repli sur la Roue. Échec d’enregistrement : message indiquant un choix limité à la visite. Cette préférence de présentation est commune à ce navigateur, non synchronisée, sans identifiant, secret ou donnée métier ; elle ne constitue pas une mémoire artistique ni une autorisation.

Même avec IDA Home choisi au démarrage, `LocalAccessGate`, transport, permissions, workspace et Tool Gateway restent inchangés. Aucun client ne gagne de droits. Aucun microphone, caméra, appel IA, lecteur vidéo ou outil d’écriture n’est activé à l’ouverture. Les titres de tâches sont rendus comme du texte ; les événements inconnus utilisent un libellé générique sans payload ni identifiant exposé dans la carte.

## Recette

1. Depuis l’accueil, sélectionner IDA Home dans la Roue puis entrer ; vérifier les tâches et le journal existants.
2. Ouvrir les espaces liés puis revenir : mêmes données et même point d’entrée. Contrôler aussi les onze modules, dont musique, contenu, social, calendrier et campagnes.
3. Cocher le choix de démarrage et recharger : le même accueil contient directement IDA Home. Décocher et recharger : retour à la Roue. Tester retour et Échap sans perdre l’accès aux autres mondes.
4. Vérifier Classic/Sci-Fi, transparence, clavier et viewport mobile ; aucune vidéo ou permission matérielle au démarrage.
5. Tester les états vides/chargement/erreur, les dates du workspace, le rejet des anciens résultats et le stockage indisponible via les tests dédiés et ceux de `SnapshotReader`.

Cette tranche reste une démonstration locale : pas de déploiement Internet, de validation sur téléphone physique ou de certification de sécurité. La section précédente sur les dates de release est laissée en pause et conservée séparément dans le working tree.
