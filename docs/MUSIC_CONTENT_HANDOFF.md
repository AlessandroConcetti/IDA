# Music → La Baraque → Workspace

30 septembre 2026 — dossier de préparation et retour de visuels proposés
E2E_VERIFIED dans le runtime de recette. Ce n’est pas une chaîne de
publication/démarchage terminée.

## Engagement produit explicite

Music conserve le morceau, ses versions et ses métadonnées. La Baraque prépare
les contenus associés ; Workspace porte les tâches, échéances et, à terme, les
brouillons et envois autorisés. Une demande doit pouvoir se suivre dans les trois
mondes par la même référence, avec un retour visible dans Music. La chaîne
complète devra couvrir préparation, programmation, promotion et démarchage,
sans contourner les validations avant toute action externe.

## Parcours utilisable de cette tranche

1. **Music Studio → Contenus & promotion → Nouvelle demande Music**.
2. Sélectionner un morceau existant, une nature (artwork, teaser, dossier de
   presse ou promotion), un titre, un brief et éventuellement une échéance.
3. **Créer la demande** enregistre une tâche/dossier partagé, pas trois copies.
4. **Ouvrir ce dossier dans La Baraque** ou **dans Workspace** retrouve exactement
   ce dossier, ses notes, plans versionnés et revues documentaires.
5. Chaque destination possède aussi **Demandes Music**, avec liste, pagination,
   actualisation et ouverture du dossier. Music filtre par morceau.
6. Dans Workspace, une confirmation explicite permet de **Marquer la préparation
   terminée**. Le statut vient de la tâche existante et se retrouve dans Music.
7. Dans le même dossier, **Visuels proposés → Rattacher un visuel importé**
   sélectionne une image déjà importée et liée au morceau dans la bibliothèque.
   Le rattachement apparaît dans les trois mondes. **Voir le visuel** ouvre le
   fichier privé réel ; fermer l’aperçu le démonte.

Un statut « Préparation terminée » ne signifie jamais « média généré », « envoyé »
ou « publié ». Une revue de plan ne vaut pas une autorisation d’envoi.

## Source de vérité et sécurité

- Relation `music_content_handoffs` : workspace, track, task/project, nature,
  créateur, reçu idempotent UUID, empreinte de la demande et date UTC.
- Le titre, brief, statut et échéance sont lus dans `tasks`, jamais recopiés dans
  la relation Music. Le dossier réutilise `creative_dossier_records` et son
  moteur de notes/plans/progression ; les originaux musicaux ne sont pas lus.
- Création de tâche, liaison et audits atomiques. Helper transactionnel du moteur
  de tâches existant, pas de second moteur métier.
- Accès partagé uniquement au workspace courant et aux membres autorisés.
  READ vérifie Music + dossier commun ; WRITE vérifie Music + création de tâche
  + dossier commun. Réautorisation avant et après la transaction.
- Clés étrangères composites empêchant les liens entre workspaces.
- Audit append-only avec IDs/nature/états ; ni brief ni titre privé ni secret.
- Aucun provider, téléchargement, génération, micro, caméra, envoi ou publication.

## API

Contrats Zod stricts : `packages/contracts/src/music-handoffs.ts`.

`POST /v1/music/handoffs` reçoit `requestId`, `trackId`, `kind`, `title`, `brief`,
`dueAt?`. Retour 201 à la création, 200 pour un reçu identique, 409 si le même
UUID est réutilisé avec un contenu différent. UUID scindé par workspace/créateur.
Titre 180 caractères, brief 4 000, corps 24 Kio maximum. Date ISO UTC.

`GET /v1/music/handoffs?trackId=…&projectId=…&offset=0` : filtres facultatifs,
25 résultats maximum, `nextOffset` ou null. Paramètres étrangers rejetés ; aucune
sélection arbitraire de workspace ou d’acteur depuis le client.

Les destinations de navigation ne gardent qu’un ID en mémoire, consommé une fois,
expirant après 5 minutes et effacé à l’invalidation de session/workspace. Chaque
écran relit l’API autorisée ; cette navigation n’accorde aucun accès.

### Retour de visuels proposés (B.6)

- `POST /v1/music/handoffs/:handoffId/assets`, corps strict `{mediaId}` (2 Kio).
  201 au rattachement, 200 si déjà présent. La clé naturelle workspace/demande/média
  protège aussi une nouvelle tentative après perte de réponse. Un réessai renvoie
  le reçu historique, pas une nouvelle date de vérification physique.
- `GET /v1/music/handoffs/:handoffId/assets?offset=0`, pages stables de 25,
  `nextOffset`. Demande absente/étrangère : 404 identique. Champs étrangers refusés.
- `music_handoff_assets` conserve une référence, l’auteur et une preuve de
  vérification (SHA-256, MIME, taille, date UTC), jamais une seconde copie du
  fichier. Clés étrangères composites et audit append-only avec IDs uniquement.
- Écriture : autorisations Music WRITE + dossier partagé WRITE + Content READ,
  recalculées avant/après lecture du fichier et après l’écriture transactionnelle.
  Lecture : Music READ + dossier READ + Content READ. VIEW_ONLY ne peut rattacher.
- Seulement PNG/JPEG/WebP non archivés, liés au même morceau/workspace, avec
  stockage privé réel. Le lecteur privé existant contrôle type/chemin/taille/hash,
  avec la limite d’import existante de 25 Mio. Aucun chemin privé dans les réponses.
- Les lectures de liste restent des métadonnées historiques : elles ne scannent
  pas le disque et ne garantissent pas que le fichier existe encore. L’aperçu
  effectue une nouvelle lecture authentifiée, avec une URL d’inspection distincte
  pour éviter la réutilisation d’une image déjà décodée par la vitrine du navigateur.
  Erreur explicite/réessai si absent, modifié, accès refusé ou délai de 15 s dépassé.
- Un média archivé ou des métadonnées sources modifiées sont signalés, sans
  supprimer le rattachement historique ni présenter l’aperçu comme validé.
- Aucun aperçu automatique dans ce panneau, polling, cloud, création artistique,
  approbation ou publication. La vitrine existante de La Baraque reste indépendante.
- La sélection montre au plus les 50 images récentes du morceau et signale cette
  borne ; les rattachements sont paginés. Pas encore de recherche exhaustive dans
  ce sélecteur, de retrait/versionnement du rattachement ou de validation artistique.

## Vérifications

- 9 tests API : création, reçu idempotent et concurrence, conflits, erreurs et
  limites, isolation, Gateway, lecture restreinte, rollback après révocation,
  pagination, base fermée/réouverte avec note conservée ; disponibilité via `/creative/projects`
  et `/tasks`, statut de tâche répercuté dans Music.
- 2 recettes navigateur Classic/Sci-Fi : formulaire réel, écriture serveur dont
  la réponse est volontairement perdue, réessai sans doublon, navigation vers
  les deux autres mondes, même note relue, confirmation de fin et retour Music,
  fermeture/réouverture, desktop et 390 px. Données synthétiques uniquement.
- La recette a décelé un dossier recouvrant les boutons de navigation : corrigé
  en intégrant le dossier dans le flux de sa Sheet, sans clic forcé dans les tests.
- 3 tests de navigation : destination, consommation unique, expiration,
  invalidation de session/workspace et IDs invalides.
- Relecture finale commune : 62 tests serveur Music/Creative et 6 tests Web
  ciblés réussis avant B.6 ; 6 recettes navigateur Music réussies. Types et builds PASS.
- B.6 : 7 nouveaux tests API (fichiers réellement importés, concurrence, isolation,
  permissions, rollback, corruption de même taille, pagination, état historique et
  base fermée/réouverte avec fichier conservé). Avec la régression liée aux médias :
  81 tests API + 6 tests Web ciblés réussis.
- Recettes Classic/Sci-Fi étendues : fichier synthétique réellement importé par
  l’API, sélection/rattachement par l’UI, réponse perdue après écriture, reprise sans
  doublon, échec d’aperçu puis vraie lecture, même référence dans les trois mondes.
  Fermeture/réouverture UI et retour mobile à 390 px. Le redémarrage de base est
  testé séparément côté API, pas simulé par une simple réouverture de Sheet.
- Pas de polling ajouté, ni activité quand la Sheet est démontée. Nouveau chunk
  partagé MusicPromotion d’environ 19 Ko minifiés ; bundle principal ~973 Ko,
  avertissement de taille existant. Pas de benchmark global CPU/GPU revendiqué.

## Reste concret

- Versionnement/rôles/retrait des visuels proposés, lien release, validations de
  livrable, médias autres que l’image et checklist musicale. Le retour d’une image
  importée est désormais vérifié ; ce n’est pas la génération d’une pochette.
- Contacts sourcés, CRM musical et brouillon de démarchage lié à la demande.
- Préparation mail dans Workspace puis approbation et envoi via transport validé.
- Programmation/promotion externes après approbation : les capacités de planning
  interne existantes ne sont pas une preuve de publication effective.

Le serveur personnel déjà ouvert n’a pas été redémarré par cette tranche.
Le nouveau build doit être chargé par une relance d’IDA avant recette personnelle.
Les tests ne prétendent pas avoir produit ni démarché une chanson d’Alessandro.
