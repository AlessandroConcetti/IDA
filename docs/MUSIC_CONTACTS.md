# Music — Labels & dates, tranche B.9

30 septembre 2026. Point d’entrée : **Music Studio → Labels & dates**.
Fiche persistante, pas simulation de prospection ou moteur d’envoi.

## Parcours concret

- Ajouter une organisation/lieu, choisir explicitement son projet musical et son
  type (label, bar, club, organisateur, lieu de réception, booker…). Fournir une
  source HTTPS publique ; email et personne sont facultatifs.
- Enregistrer les coordonnées, notes de qualification, prochaine action et étape.
  Retrouver la même fiche après fermeture du panneau ou redémarrage API/base.
- Filtrer par projet, interlocuteur et étape ; rechercher littéralement ville,
  pays, organisation, personne ou email. Pagination de 25, sans recherche réseau.
- La fiche est modifiable avec révision : un conflit garde les champs locaux et
  propose une relecture explicite. Une réponse perdue peut être rejouée sans
  créer une deuxième piste ni doubler l’audit.
- Les styles Classic/Sci-Fi réutilisent la fenêtre commune, les animations
  partagées et le repli de mouvement réduit. Parcours testé à 390 px aussi.

## Deux projets, une identité partagée

`workspace_contacts` possède les coordonnées et leur provenance. Music possède
`music_contact_links` : projet, type, étape, notes et prochaine action. Le même
contact peut être suivi pour les deux projets sans dupliquer son identité.
Une modification des coordonnées invalide les révisions de toutes ses fiches
Music ; une modification de suivi reste propre au projet.

Le dédoublonnage compare organisation + personne normalisées, et email lorsqu’il
existe. Une divergence demande une correction explicite, jamais une fusion
silencieuse. Pas de rapprochement approximatif des homonymes. La nouvelle base
partagée est réutilisable, mais le panneau Contacts général de Workspace n’est
pas livré par cette tranche. Aucun second moteur Mail n’est créé.

## Sources et premières pistes

`music-contact-seeds.ts` fournit cinq pistes éditoriales datées, ouvertes à la
lecture et au préremplissage uniquement. Aucune écriture avant choix du projet
et clic **Ajouter la piste**. Elles ne sont pas actualisées automatiquement.

| Piste | Source officielle consultée le 30/09/2026 | Qualification restant à faire |
| --- | --- | --- |
| FK Events, Marseille | https://www.fkevents.fr/contact | Agence proposant DJ et réceptions : demander si elle accepte des collaborateurs indépendants ; pas d’annonce de recrutement constatée |
| Rooftop des Réformés, Marseille | https://rooftop-lesreformes.com/privatisation | Lieu de réceptions : vérifier le responsable et l’admission de nouveaux prestataires ; contact général publié |
| R2 Le Rooftop des Terrasses, Marseille | https://www.lerooftopdesterrasses.com/infos-pratiques | Contact commercial de privatisation, pas adresse de booking artistique confirmée |
| Serial Records | https://www.serialrecords.com/ | Label house/électronique avec entrée Submit : écouter le catalogue, sélectionner le bon morceau et vérifier ses consignes |
| Cascade Records | https://cascaderecords.fr/contact-us/ | Adresse démo officielle : adéquation musicale à vérifier avant pitch |

Les suggestions de collaboration sont des pistes, pas des offres ouvertes,
ni des revenus ou dates promis. Voir `MUSIC_BOOKING_PRIORITIES_20260930.md` pour
le cadrage utilisateur : deux projets, Marseille/alentours puis Avignon,
Montpellier et Lyon ; prestations privées possibles sans faux portfolio.
L’absence de contenu privé n’est pas compensée par des témoignages inventés.

## API, sécurité et données

Contrat : `docs/openapi/music-contacts-v1.yaml` ; schémas stricts dans
`packages/contracts/src/music-contacts.ts`.

- GET `/v1/music/contacts` et `/:contactId` : outil `read_music_contacts`, READ.
- POST `/v1/music/contacts` : outil `write_music_contacts`, WRITE, UUID
  d’idempotence obligatoire, 201 première création / 200 rejeu exact.
- PATCH `/:contactId` : WRITE, `expectedRevision` obligatoire ; champs absents
  conservés et champs facultatifs remis à `null` pour effacer. Un rejeu sans
  changement est un succès sans nouvel audit. Un changement concurrent donne 409.
- Identité/session/client/workspace résolus côté serveur ; revalidation en début
  et fin de transaction. Grants VIEW_ONLY, outil refusé, révocation et autre
  workspace contrôlés. Verrou par workspace et contraintes DB pour les doublons.
- Corps limité à 20 Kio ; URLs HTTPS sans credentials, port non standard,
  IP ou nom local. Aucun téléchargement, résolution DNS ni interprétation du
  contenu de la source ; liens ouverts uniquement par l’utilisateur.
- Audit append-only `music.contact.created` / `music.contact.updated` : IDs,
  noms des champs, révision, étapes ; pas de notes, email ou texte privé dans
  le payload. Pas de nouvelle route de lecture d’historique dans B.9.
- Classification : coordonnées professionnelles et notes privées du workspace,
  pas mémoire permanente d’IDA ni contexte LLM automatique. Données conservées
  localement en base jusqu’à décision utilisateur ; pas de collecte continue.
  L’étape CLOSED clôt le suivi, elle ne supprime pas les coordonnées. La purge
  ciblée et la politique de rétention paramétrable restent à implémenter.
  La sauvegarde source ne sauvegarde pas la base utilisateur.

## États honnêtes et limites

Les états CONTACTED, REPLIED, INTERESTED et DECLINED sont **déclarations
manuelles**, pas des événements de transport email. La prochaine action est une
note, pas un rappel programmé. La vérification enregistrée est USER_RECORDED,
jamais une certification de source, de délivrabilité ou de booking disponible.

Restent : annuaire général Workspace, brouillon partagé lié au contact et au
morceau, approbation et envoi, relance/tâche datée, historique de suivi dans
l’interface, pipeline booking complet et recherche officielle intégrée.
Les cinq pistes éditoriales ne ferment pas le critère « recherche labels/clubs ».

## Preuves et restauration

Tests `music-contacts.test.ts` : source, aucun réseau, entrées, dédoublonnage,
deux projets, révisions, rejeu, concurrence, isolation, permissions,
rollback après révocation, recherche/pagination et vraie fermeture/réouverture
API + base. `music-contact-seeds.test.ts` valide les cinq sources préremplies.

`e2e/music-contacts.spec.ts` : entrée dans Music, préremplissage sans écriture,
choix du projet, sauvegarde dont la réponse est perdue, retry sans doublon,
édition/conflit, filtres, erreur 503/réessai, fermeture/réouverture et mobile
Classic/Sci-Fi. Aucune API privée, chanson personnelle ou émission externe.

Checkpoint avant : `tmp/source-checkpoints/2026-09-30T12-00-09-975Z-source`,
926 fichiers, intégrité vérifiée. Bilan et snapshot après dans
`docs/checkpoints/MUSIC_CONTACTS_20260930.md`.
