# Music — consultation du relevé local

Tranche B.1, 29 septembre 2026. Statut : consultation de métadonnées vérifiée ; gestion musicale complète des versions encore partielle.

## Parcours visible

Music Studio → **Bibliothèque** → **Consulter la sélection locale**.
Le catalogue Music classique expose aussi ce composant. La fenêtre métier utilise
`Sheet`, sans remplacer la composition de l’environnement.

Le panneau propose recherche par titre/chemin relatif, filtre Astromer/Makerz/à
attribuer, pages de 25 groupes, détails et pages des versions. Il affiche la date
du relevé, les compteurs, les avertissements et les seules mesures techniques
effectivement lues dans les en-têtes WAV. Un fichier plus récent est un **candidat**,
pas une validation de master. Un fichier dont le nom n’indique pas explicitement
l’artiste reste à attribuer ; la date seule n’identifie pas un morceau final.

États : non configuré, chargement, relevé vide, recherche sans résultat, résultat,
erreur et réessai. La fermeture efface la vue et interrompt ses requêtes. Il n’y a
pas de requête de bibliothèque avant son ouverture, pas de polling, pas de LLM,
pas de lecture audio ni de scan en arrière-plan.

## Source de vérité et accès

- Le relevé immuable `inventory.json` est généré explicitement par
  `scripts/inventory-music-library.ts` dans `.data/music-inventories/<horodatage>/`.
- `.data/music-inventories/current.json` désigne le relevé courant, son SHA-256,
  son propriétaire et son workspace. Ce dossier privé n’est pas committé.
- `scripts/activate-music-inventory.ts <horodatage> <workspaceId> <userId>` valide
  le relevé, conserve l’ancien manifeste s’il existe et active le nouveau.
- Le lancement local (`local-preview.ts`, mode `LOCAL_LOCK`) injecte la liaison
  côté serveur. Changer le lancement nécessite son redémarrage ; le serveur déjà
  lancé ne recharge pas du code TypeScript à chaud.
- Les routes de lecture exigent session, scope et outil `MUSIC/READ`.
  Le mode démo et les autres propriétaires/workspaces ne voient pas le relevé.
  Les réponses ne contiennent ni racine absolue, ni credential.

Les noms et chemins relatifs sont des données privées non fiables, rendues en
texte React. Ils ne deviennent ni commandes, ni liens d’ouverture, ni prompts.

## Contrats et limites

`GET /v1/music/library` : recherche paginée, compteurs et candidat par groupe.
`GET /v1/music/library/:groupId/versions` : versions du groupe pour le même
`snapshotId`. Si le relevé change entre les pages : 409 et invitation à actualiser.

Contrats Zod stricts dans `packages/contracts/src/music-library.ts`. Le lecteur
borné contrôle le manifeste (4 Kio), le relevé (16 Mio), 20 000 fichiers maximum,
l’empreinte, les identifiants et les compteurs. Il refuse les chemins sortants et
les liens symboliques. Les lectures simultanées partagent uniquement la promesse
en cours, sans conserver un cache permanent des titres.

« Actualiser » relit le relevé enregistré, **ne rescane pas le disque**. La présence
actuelle des originaux n’est donc pas garantie. Les originaux ne sont ni copiés,
ni déplacés, ni supprimés. Ce relevé ne crée ni track ni master approuvé.

## Référencer une version et l’écouter

Dans chaque version, **Rattacher / préécouter** ouvre un parcours explicite :
choisir un track existant, créer une référence persistante puis demander une
préécoute. IDA ne déduit pas le morceau final ou le projet à partir du nom et ne
déplace pas le fichier. Le track garde son projet artistique existant.

Au rattachement et à chaque préécoute, le serveur revalide l’utilisateur et le
workspace, le snapshot actif, le chemin contenu dans la racine configurée, la
taille/date/identité du fichier et son SHA-256. Les données persistées contiennent
la référence, les métadonnées et l’empreinte, pas les octets audio. Le journal
append-only ne contient que l’identifiant de la référence.

`GET /v1/music/local-versions` énumère les références de l’utilisateur.
`POST /v1/music/local-versions` rattache une version ; la répétition de la même
demande retourne la référence existante. `POST .../:id/preview-ticket` vérifie à
nouveau l’original avant d’émettre un ticket lié à la session pour 120 secondes.
`GET .../:id/preview?ticket=...` ne sert que les plages demandées en lecture seule
et désactive le cache ; `POST .../:id/preview-stop` révoque immédiatement le
ticket et ferme les lectures ouvertes. Les réponses d’erreur ne divulguent pas le
chemin absolu.

La lecture est limitée à un fichier non vide d’au plus 1 Gio ; l’empreinte se
calcule par blocs de 128 Kio, avec une fenêtre maximale de 60 secondes. WAV,
AIFF, FLAC, Ogg, M4A, MP3 et AAC sont reconnus par leur signature de base ; le
codec reste dépendant du navigateur. Un original modifié, déplacé, hors racine,
trop volumineux ou non pris en charge est refusé. La recette Playwright utilise
un WAV synthétique de 4 secondes ; elle ne prouve pas encore la compatibilité de
chaque export personnel.

## Vérifications

- Tests API : isolation propriétaire/workspace, authentification, Gateway,
  pagination, recherche accent-insensible, paramètres rejetés, intégrité,
  conflit de relevé, fermeture/réouverture du runtime sur base persistante.
- Tests navigateur Classic/Sci-Fi : entrée réelle, recherche, versions, pagination,
  état vide, 503/récupération, largeur 390, bureau, Échap, réouverture clavier/clic,
  retour de focus, absence de mutation API et de chargement préalable du relevé.
- `scripts/verify-music-inventory.mjs` relit le relevé réel par `createApp` avec une
  session et une base de test isolées, sans démarrer de listener ni modifier la base
  personnelle. Il ne journalise que compteurs, octets et durée.

## Analyse WAV locale

Depuis la fiche d’une version rattachée, l’action **Analyser ce WAV** appelle
`POST /v1/music/local-versions/:id/analysis`. Le serveur vérifie le propriétaire,
le workspace, le snapshot, la taille/date et l’empreinte avant de lire l’original
par blocs de 128 Kio. L’analyse est limitée aux WAV RIFF standards PCM 8/16/24/32
bits et float 32/64 bits, 1 à 8 canaux, 8–192 kHz, 1 heure et 256 Mio. Elle
retourne une durée, la fréquence, le nombre de canaux, la crête d’échantillon,
le RMS et 256 segments min/max. Ces valeurs sont des analyses locales ; elles ne
se présentent pas comme LUFS, BPM, tonalité ou validation de master.

Le résultat est persisté avec la version et son SHA-256. Une répétition réutilise
la ligne après revalidation. `GET .../:id/analysis` permet de consulter une mesure
conservée même si l’original est momentanément hors ligne ; l’interface l’indique
explicitement et n’affirme pas que le fichier est toujours disponible. Les erreurs
de format, changement pendant la lecture, timeout, annulation et réautorisation
sont renvoyées avec un état visible.

La preuve runtime du 29 septembre a analysé un WAV réel du dossier local configuré
avec IDA (54 754 640 octets, 44,1 kHz, 2 canaux, 310,4 s) puis a relu l’analyse
persistée. La base était en mémoire et l’original n’a pas été modifié. Les recettes
navigateur utilisent une fixture WAV synthétique pour rester reproductibles.

Relevé réel activé : 2 608 fichiers / 1 970 groupes, 104 Astromer, 38 Makerz,
1 828 à attribuer. Ce sont des groupes candidats, pas des morceaux approuvés.

## Rôles et historique des versions locales

Chaque version rattachée offre un panneau **Rôle de la version** : À classer,
Version courante, Master validé ou Archivée. Une version a un seul rôle ; un
morceau a au plus une courante et un master pour ce propriétaire/workspace.
Valider un master est une décision utilisateur, pas une certification audio.
Le choix d’un nouveau détenteur du même rôle remet l’ancien « À classer » dans
la même transaction. Archiver ne supprime ni l’original ni les références.

`POST /v1/music/local-versions/:id/role` reçoit `{role, expectedRevision}`.
Le rôle et la révision sont relus après verrouillage : une vue périmée reçoit
409, sans écraser un changement concurrent. Une promotion courante/master
revérifie l’empreinte de l’original ; classer/archiver reste possible hors disque.
Un choix inchangé est idempotent et ne crée pas d’événement supplémentaire.

`GET .../:id/history?offset=0` projette l’audit append-only en pages de 50,
limité au propriétaire et workspace. Raison, ancien/nouveau rôle et date sont
visibles depuis **Consulter l’historique des rôles**, sans chemin absolu.
Les modifications de versions ne publient aucun fichier et n’envoient rien.

Tests : remplacement atomique, conflit, concurrence, droits, pagination,
redémarrage et original absent/modifié ; recettes navigateur Classic/Sci-Fi,
validation, historique, réouverture et archivage à 390 px.

## Récupération

Depuis **Music Studio → Checklist de préparation**, les versions rattachées
peuvent maintenant s’ouvrir directement pour le morceau choisi. Le retour au
bilan relit le rôle master et l’analyse persistée de cette version. Cette
projection ne relit pas l’original ni ne certifie sa qualité : voir
`MUSIC_READINESS.md`.

En cas de relevé altéré : l’interface affiche une erreur, sans exposer les données
partielles. Régénérer un relevé depuis le dossier choisi puis l’activer explicitement,
ou réactiver un relevé antérieur intact. L’activation sauvegarde l’ancien manifeste.
Les snapshots de sources ne remplacent pas une sauvegarde des originaux musicaux
ni de `.data` ; ces données restent à sauvegarder avec le stockage utilisateur.
