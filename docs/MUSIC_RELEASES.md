# Music Studio — fiche release réelle

Tranche B.8, vérifiée le 30 septembre 2026. Contrat permanent IDA inchangé.

## Parcours livré

**Music Studio → Mes releases → Release à ouvrir**.

- Informations : modifier titre, type, date civile cible, label, description,
  tags et statut local. Les champs sont conservés si la sauvegarde échoue.
- Morceaux : associer un morceau existant du même projet, sans autre release,
  ou retirer son lien sans supprimer le morceau ni son fichier. Accès direct
  à sa checklist ; retour à la release avec relecture du serveur.
- Médias : lire les références directement associées à cette release dans la
  bibliothèque privée, sans lancer d’aperçu. Entrée vers la bibliothèque et
  son import existants. Les médias liés uniquement au track restent distincts.
- Historique : changements de champs, liens, statuts, date et révision dans
  l’audit partagé ; aucune copie des textes libres dans ce journal.
- Création : le bouton ouvre le catalogue existant ; aucun second registre.

La fenêtre réutilise `Sheet`, son verre, sa palette, sa présence spatiale,
son retour Accueil, sa fermeture clavier et ses modes de réduction du mouvement.
Les données ne viennent pas d’un chat ni d’une simulation. Erreur, vide,
chargement, réessai et invalidation de session sont affichés explicitement.
Les deux listes de morceaux et l’historique sont paginés par 25 ; les références
de médias sont bornées à 50, avec indication de cette limite.

## Contrat API

OpenAPI : `openapi/music-releases-v1.yaml`. Schémas exécutés : exports
`musicRelease*Schema` dans `packages/contracts/src/index.ts`.

| Route | Outil et permission | Fonction |
| --- | --- | --- |
| GET `/v1/music/releases/:releaseId` | `read_music_release`, MUSIC/READ | Fiche, projet, nombre de morceaux, révision |
| PATCH même route | `update_music_release`, MUSIC/WRITE | Champs éditables et `expectedRevision` obligatoire |
| GET `.../:releaseId/tracks?scope=linked\|available&offset=0` | MUSIC/READ | Morceaux du même projet, page de 25 |
| POST `.../:releaseId/tracks` | `link_music_release_track`, MUSIC/WRITE | `{trackId,attached,expectedRevision}` |
| GET `.../:releaseId/history?offset=0` | MUSIC/READ | Trace append-only, page de 25 |

Les routes de création/liste `/v1/releases` et de médias `/v1/media` sont
réutilisées sans créer de stockage parallèle. `releases.edit_revision` (entier
initialisé à 0, non négatif) et l’index `tracks_release_read_page` sont ajoutés
de façon idempotente à l’ouverture du module ; les autres tables sont inchangées.

## Sécurité, reprise et cohérence

- Identity, session, membership, client grant et Tool Gateway côté serveur,
  revalidation avant/après dans la même transaction. VIEW_ONLY lit mais n’écrit
  pas ; une révocation tardive annule données **et** audit.
- Workspace dans chaque requête ; morceau et release du même projet. Une
  ressource absente ou étrangère produit le même 404.
- PATCH strict : pas de workspace/projet/liens externes acceptés ; pas de
  valeur par défaut héritée de la création. Omettre `tags` les conserve.
  `null` efface date/label/description ; les autres champs ne sont pas nullables.
- Verrouillage et révision : modification concurrente différente → 409 sans
  écrasement. Répéter une intention déjà satisfaite → `unchanged:true`, sans
  nouvelle révision ni nouvel événement. C’est une idempotence d’état, pas une
  file de commandes ni une garantie de rejeu après changements intermédiaires.
- Aucun déplacement silencieux d’un morceau déjà lié ailleurs. Un média ou une
  campagne portant simultanément le morceau et une release incompatible bloque
  le changement de lien ; rien n’est déplacé ni supprimé. Une release archivée
  ne change pas ses liens tant que son statut n’est pas réactivé explicitement.
- Historique limité aux trois actions `music.release.updated`, `track_linked`,
  `track_unlinked` (ces deux dernières sous le même préfixe). Champs modifiés,
  révision, statuts et identifiant de track ; ni secret, chemin, ancien titre ou
  description. Les événements antérieurs de création restent dans l’audit Core.
- Après écriture réussie, le client notifie les projections communes. La
  checklist relit la relation et la date cible ; le catalogue conserve la même
  source de vérité. Une réponse HTTP 401 reste identifiable, tout en annulant
  les autres requêtes devenues invalides ; correction couverte par les tests.
- Aucun provider, appel cloud, son, caméra, import ou génération automatique.

## Sens des statuts et limites

`DRAFT`, `SCHEDULED`, `RELEASED`, `ARCHIVED` restent des **déclarations locales**.
`publicationAuthorized` vaut toujours false. Une date ou un statut ne programme
aucune diffusion et ne change pas automatiquement la date propre à un morceau.

Les étapes MUSIC_READY/MASTER_READY/ARTWORK_READY/METADATA_READY/PROMO_READY,
la checklist agrégée de release, les crédits/splits/licences, la distribution,
les contacts et la validation finale ne sont pas livrés par cette tranche.
Il n’y a pas encore d’ordre de tracklist, d’édition des relations de médias,
de versionnement d’artwork ou de dossier documentaire complet. Les champs non
enregistrés restent locaux au formulaire : enregistrer avant de changer de
section/release ou de fermer ; en cas de conflit, copier avant de recharger.

## Preuves

- 8 nouveaux tests API : édition/effacement, conservation des tags omis, retry,
  conflits simultanés, isolation/projet, archives et dépendances, permissions,
  révocation avec rollback, pagination, fermeture puis réouverture réelle de
  la base et de l’application.
- 2 nouveaux tests de transport : conservation du 401 et annulation des autres
  lectures ; rafraîchissement des projections uniquement après réussite.
- 178 tests ciblés sur 18 fichiers API/Web/contracts : PASS.
- 10 recettes navigateur : bibliothèque, versions, handoffs, checklist et
  releases en Classic/Sci-Fi : PASS. La recette release couvre perte de réponse
  **après écriture réelle**, retry sans doublon, conflit conservant le brouillon,
  association, checklist, médias, historique, 503/réessai et réouverture à 390 px.
- Captures : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-FVIGU2`.
  Captures release également relues dans `ida-mcp-browser-results-KH7xVg`.
- Types Contracts/API/Web, builds et lint ciblé : PASS. Avertissement préexistant
  du bundle Web principal ~973 Ko ; pas de mesure globale de performance.

Recettes synthétiques sur instance isolée. Le runtime personnel ouvert n’a pas
été redémarré, aucun original musical ni compte externe n’a été modifié.
