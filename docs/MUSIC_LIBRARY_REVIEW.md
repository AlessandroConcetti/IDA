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
- Les deux routes de lecture exigent session, scope et outil `MUSIC/READ`.
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
ni déplacés, ni supprimés. Ce relevé ne crée pas de tracks, de masters approuvés,
de médias privés ou de discographie. Leur liaison constitue la tranche suivante.

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

Relevé réel activé : 2 608 fichiers / 1 970 groupes, 104 Astromer, 38 Makerz,
1 828 à attribuer. Ce sont des groupes candidats, pas des morceaux approuvés.

## Récupération

En cas de relevé altéré : l’interface affiche une erreur, sans exposer les données
partielles. Régénérer un relevé depuis le dossier choisi puis l’activer explicitement,
ou réactiver un relevé antérieur intact. L’activation sauvegarde l’ancien manifeste.
Les snapshots de sources ne remplacent pas une sauvegarde des originaux musicaux
ni de `.data` ; ces données restent à sauvegarder avec le stockage utilisateur.
