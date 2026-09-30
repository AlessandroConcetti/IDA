# ADR 0011 — Brouillon Workspace, origine Music

- Date : 2026-09-30
- Statut : accepté, B.10 ; stockage/édition internes, aucun transport.

Le carnet Music B.9 contient des contacts sourcés. Un mail préparé pour un
contact ne doit pas devenir trois copies divergentes dans Music, Workspace et
Mail. L'inventaire ne révèle pas de moteur de brouillons partagé déjà raccordé.

Décision : Workspace possède `workspace_mail_drafts`, avec référence obligatoire
à la relation Music contact/projet et morceau facultatif du même projet. Une
API et un éditeur sont consommés par les trois points d'entrée. Le destinataire
est explicitement choisi pour le message, sans réécriture lors d'un changement
de coordonnées dans l'annuaire partagé. Aucune tâche n'est présentée comme mail.

Cette première projection requiert IDA READ/WRITE selon l'opération et MUSIC
READ pour ses sources. Elle réutilise Identity/Tool Gateway, transactions,
révisions et audit ; aucun transport externe, agent supplémentaire ou nouveau
provider. Les tables sont créées de façon additive au démarrage, sans suppression
ni migration des données déjà présentes. La préparation des textes est
déterministe : un agent n'est pas nécessaire pour un formulaire et un modèle.

Les états DRAFT/ARCHIVED ne constituent jamais une approbation ou un envoi.
La future expédition devra vérifier une approbation portant sur la révision,
le contenu et le destinataire exacts ; aucune modification approuvée ne pourra
être réutilisée silencieusement. Cette ADR n'autorise pas cette expédition.

Rétention : même frontière privée workspace que les contacts ; archivage
conservateur, purge utilisateur à construire. Aucun texte libre dans l'audit.
Preuves : tests API de permissions/isolation/rollback/concurrence/redémarrage,
parcours navigateur dans les trois surfaces et documentation B.10.
