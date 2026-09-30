# Music Studio — checklist de préparation

Tranche B.7, vérifiée le 30 septembre 2026. Contrat de construction :
`IDA_PERMANENT_BUILD_CONTRACT.md`. Avancement :
`audit/MUSIC_STUDIO_PROGRESS_20260929.md`.

## Parcours réel

**Music Studio → Checklist de préparation → Morceau à vérifier**.
La fenêtre hérite du `Sheet` commun : verre et palette Classic/Sci-Fi,
navigation, profondeur, réduction de mouvement, clavier et adaptation mobile.
Elle n’utilise aucun chat générique et ne crée aucune tâche automatiquement.

Depuis B.8, **Music Studio → Mes releases → Morceaux → Vérifier** ouvre aussi
la checklist sur le morceau exact. Éditer la date de sa release ou changer son
association se reflète à la prochaine lecture ; la date propre au morceau reste
prioritaire, sans écrasement automatique. Voir `MUSIC_RELEASES.md`.

Dix points affichent **Enregistré**, **À compléter**, **À examiner** ou **Non
vérifié**, avec l’explication et les seules actions disponibles :

- Identité, release et date cible : consulter la fiche enregistrée, en lecture
  seule. Une différence entre les dates du morceau et de sa release est signalée.
- Master et analyse : ouvrir les versions locales du morceau sélectionné,
  choisir explicitement un master, analyser un WAV ou consulter sa mesure.
- Pochette et préparation : ouvrir les demandes Music filtrées sur ce même
  morceau. Création, visuel privé et dossier partagé réutilisent le parcours
  Music → La Baraque → Workspace existant.
- Crédits/droits complets, distribution et validation finale : restent **Non
  vérifié** ; aucun faux bouton d’approbation ni résultat positif inventé.

Le retour à la checklist relit l’API. Un bouton permet aussi l’actualisation
explicite. Une erreur efface le bilan précédent au lieu de le présenter comme
actuel. Liste vide, chargement, erreur avec réessai et session invalidée sont
traités ; les requêtes sont annulées au démontage/changement de contexte.

## API et sécurité

`GET /v1/music/tracks/:trackId/readiness` ; aucun paramètre de requête accepté.
Schéma : `packages/contracts/src/music-readiness.ts`.

Réponse `{data:{track,evaluatedAt,policyVersion:1,scope:"TRACK_PREPARATION",
items,summary,publicationAuthorized:false}}`. Les dix éléments ont `key`,
`label`, `state`, `detail`, `count` nullable et `action` nullable. Les quatre
compteurs sont des nombres de points, pas un pourcentage de qualité musicale.

- `read_music_readiness` exige `MUSIC/READ`, ainsi que les permissions de lecture
  des morceaux, médias, demandes, dossiers créatifs et versions locales.
- Autorisation avant lecture puis revalidation transactionnelle avant/après
  projection. Un client VIEW_ONLY peut lire, jamais écrire par cette route.
- Chaque jointure impose le workspace ; les références locales imposent aussi
  le propriétaire. Les preuves locales ne sont exposées qu’avec un binding
  LOCAL_LOCK correspondant à l’utilisateur et au workspace.
- 400 : identifiant/paramètres invalides ; 401 : identité expirée/révoquée ;
  403 : lecture refusée ; 404 identique pour morceau absent ou étranger.
- Aucune table de checklist, écriture, capture, modèle ou requête réseau.
  Les tables existantes sont la source de vérité. Ni secret ni chemin disque
  n’est retourné. Le redémarrage ne perd pas le bilan puisqu’il est recalculé.

## Sens exact des preuves

Un master **Enregistré** prouve le rôle choisi, pas la qualité audio. Son analyse
doit appartenir à cette version, au même propriétaire/workspace, à son empreinte
et à l’algorithme WAV courant. L’analyse d’une ancienne version n’est pas comptée.
Sans binding local, ces deux points sont inconnus, pas artificiellement manquants.

Une pochette **Enregistrée** est une image privée non archivée, directement liée
au morceau et rattachée à une demande ARTWORK non annulée, dont hash/taille/type
correspondent au reçu de rattachement. Cette lecture ne rouvre pas le fichier :
l’aperçu existant vérifie sa disponibilité réelle. Une image d’un autre type de
demande ne devient pas une pochette par simple présence dans la bibliothèque.

Les demandes TODO/IN_PROGRESS signalent une préparation à examiner. DONE indique
une préparation déclarée terminée, pas un rendu, un accord artistique ou un envoi.
Les demandes annulées ne sont pas comptées. Le choix d’une release/date reste
facultatif pendant la création ; aucun état n’empêche de travailler le morceau.

## Preuves et limites

- 6 nouveaux tests API : projection sans effet, absence/isolation, permissions,
  révocation pendant lecture, dates/métadonnées, image importée réellement via
  l’API, variations/cancellation, fin de tâche et base fermée/réouverte.
- Test de versions étendu : le bilan suit le rôle MASTER, une analyse WAV réelle,
  le remplacement de master et la disparition du rôle après réouverture.
- 93 tests ciblés PASS sur 12 fichiers API/Web.
- 8 recettes navigateur PASS : bibliothèque, versions, handoff, checklist, en
  Classic et Sci-Fi. Checklist : version synthétique, choix du master et analyse
  depuis la fenêtre, dossier préfiltré, création, relecture, erreur/réessai,
  fermeture/réouverture, mobile 390 px ; aucun audio chargé implicitement.
- Captures relues ; contraste des boutons Classic corrigé et testé.
- Types et builds Contracts/API/Web, lint ciblé : PASS. Avertissement préexistant
  de bundle principal Web ~973 Ko ; pas de benchmark global de performance.
- Le runtime personnel n’a pas été redémarré ; les tests utilisent une instance
  isolée et des données synthétiques. Aucun original de `F:\MUSIQUES 2K26` modifié.

Cette tranche ne clôture pas le critère complet de readiness : édition des
métadonnées depuis ce panneau, crédits/splits/licences, validation artistique,
distribution, états d’approbation et readiness de toute une release restent à
construire. Aucun droit de publier n’est déduit de la checklist.
