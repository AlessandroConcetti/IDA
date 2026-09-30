# Music → Workspace — relances datées, B.11

30 septembre 2026. Une relance est ici une **tâche personnelle à réaliser**,
pas un courriel envoyé ni une notification programmée.

## Parcours vérifié

1. Music Studio → **Labels & dates** → ouvrir un contact → **Relances datées**.
2. **Planifier une relance** : titre modifiable, détails et date/heure locale.
   La prochaine action de la fiche préremplit le titre. Si elle dépasse 240
   caractères, son texte intégral reste dans les détails, visibles et modifiables.
3. Enregistrer : IDA crée une seule tâche partagée. **Voir cette relance dans
   Workspace** ouvre cette même tâche, pas une copie.
4. Workspace → **Relances Music** permet de retrouver les actions ouvertes ou
   closes et de revenir à leur contact. La tâche est aussi dans **Tâches**.
5. **Marquer la relance terminée**, puis confirmer, clôt la tâche commune.
   La clôture depuis Tâches se voit également dans Music après relecture.
   Date de création, échéance, état et date d'achèvement restent consultables.

Une confirmation de fin ne prouve pas qu'un contact a été démarché. L'étape CRM
reste inchangée. Aucune action externe, copie Gmail ou réservation n'a lieu.

## Une seule source de vérité

Le moteur partagé **Tasks/Workspace** possède titre, description, échéance et
état. Music possède uniquement `music_contact_followups` : référence au suivi
contact/projet, ID de tâche, fuseau choisi, auteur et clé d'idempotence.
Les vues joignent ces références au lieu de dupliquer la tâche ou les coordonnées.
Les contraintes composites interdisent les liaisons entre workspaces.

Les migrations additives s'exécutent dans l'enregistrement du module, à la suite
des tables Contacts/Tasks existantes. Pas de changement de fournisseur ni de
nouvelle dépendance. Les données existantes sont conservées.

Classification : prochaines actions et notes professionnelles privées du
workspace, stockées en base locale, jamais mémoire d'IDA ou contexte IA implicite.
Les tâches closes restent conservées ; purge/rétention paramétrables non livrées.
Le checkpoint source ne sauvegarde pas les données personnelles.

## Dates et états

- L'interface montre le fuseau du navigateur. Elle convertit l'heure saisie en
  UTC et enregistre le fuseau séparément ; la relecture affiche ce fuseau d'origine.
- Une heure supprimée lors du passage à l'heure d'été est refusée. Lors d'une
  heure répétée à l'automne, la première occurrence est retenue et annoncée.
- Une échéance passée est permise et marquée **En retard** tant que la tâche est
  ouverte. L'indicateur est recalculé au rendu, sans minuteur ni notification.
- OPEN regroupe TODO/IN_PROGRESS ; CLOSED regroupe DONE/CANCELLED.
  La création de cette tranche produit TODO ; l'action de clôture produit DONE.
- Chargement, liste vide, lecture en erreur sans anciennes lignes, réessai,
  conflit de fiche, sauvegarde incertaine et clôture en erreur sont visibles.
  Les champs d'un enregistrement échoué sont conservés.

## API et autorisations

Schémas exécutables : `packages/contracts/src/music-followups.ts`.
Contrat HTTP : `docs/openapi/music-followups-v1.yaml`.

- GET `/v1/music/followups` : `read_music_followups` TASKS READ **et**
  `read_music_contacts` MUSIC READ. Filtres contact, tâche, état et pagination de
  25 lignes, tri de création décroissant. Aucune lecture d'un autre workspace.
- POST `/v1/music/contacts/:contactId/followups` : `create_music_followup`
  MUSIC WRITE **et** `create_task` TASKS WRITE **et** MUSIC READ.
  Révision du contact exigée pour une nouvelle création. UUID d'idempotence :
  201 à la création, 200 au rejeu identique, 409 pour contenu divergent.
  Le rejeu renvoie l'état courant de la tâche sans la rouvrir.
- Achèvement : route existante POST `/v1/tasks/:taskId/complete`, contrôlée par
  `complete_task` TASKS WRITE. Pas de second moteur de clôture Music.
- Identité/session/workspace et permissions sont revalidés avant et après la
  transaction. Révocation finale ou interruption : rollback, y compris pour
  l'achèvement commun, sans audit de succès trompeur.
- Schémas stricts ; titre 240 et détails 4 000 unités UTF-16 maximum, NUL refusé,
  UTC valide et fuseau reconnu. Corps HTTP limité à 64 Kio.
- Création de tâche, lien et audits atomiques. Verrou workspace et contraintes
  assurent qu'un retry/concurrent n'ajoute pas une deuxième tâche.
- Audit append-only : `music.followup.created`, `task.created` et
  `task.completed` ; IDs et état, sans texte privé ni coordonnées dans le payload.

## Limites explicites

Pas de scheduler, notification, répétition, report/modification d'échéance,
suppression, synchronisation Calendar, courriel ni état CONTACTED automatique.
Les dates de création/fin ne remplacent pas l'historique CRM complet, encore à
construire. L'envoi externe exige une tranche distincte avec approbation exacte.

La fenêtre partagée conserve les thèmes et le responsive existants. Aucune
animation nouvelle, polling, scan, microphone, caméra, audio ou appel cloud.
Chargement à l'ouverture ; requêtes annulées au démontage. Navigation aller-retour
limitée à une référence en mémoire, consommée une fois, expirant après cinq
minutes et effacée en cas d'invalidation de session/workspace.

Preuves détaillées et restauration : `docs/checkpoints/MUSIC_FOLLOWUPS_20260930.md`.
