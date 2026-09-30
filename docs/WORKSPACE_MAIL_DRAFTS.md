# Brouillons partagés Music → Workspace → Mail — B.10

30 septembre 2026. Capacité locale réelle ; **aucun envoi, brouillon Gmail,
approbation finale ou appel IA** n'est effectué.

## Parcours utilisable

1. Music Studio → Labels & dates → ouvrir un contact → **Brouillons pour ce
   contact** → Préparer un message.
2. Choisir label, date en bar/club ou prestation privée. Référencer éventuellement
   un morceau du même projet et un lien d'écoute HTTPS. Le bouton de préremplissage
   propose un texte local modifiable, sans genre, tarif, disponibilité ou portfolio
   inventés. L'expérience et le matériel viennent du champ saisi par l'utilisateur.
3. Relire puis créer le brouillon. Son destinataire peut rester vide pour préparer
   une candidature sur formulaire officiel. Aucun statut « contacté » n'est ajouté.
4. **Ouvrir ce même brouillon dans Workspace** rejoint son éditeur. Les entrées
   Workspace → carte Mail → **Brouillons Music**, et Workspace → Mail →
   **Brouillons Music**, retrouvent les mêmes IDs/textes, sans copie par monde.
5. Modifier, enregistrer, fermer et rouvrir. Archivage/restauration internes
   disponibles. Un conflit garde la saisie et demande une relecture explicite.

Le changement d'onglet préserve l'éditeur Workspace, y compris lors de la
consultation de la source. Une invalidation de session/espace ferme toujours
l'accès. Enregistrer avant de quitter volontairement une fiche ou fermer IDA :
pas d'autosauvegarde cachée du texte en cours ni de cache localStorage.

## Propriété, droits et sécurité

- `workspace_mail_drafts` possède objet, texte, destinataire choisi et état.
  Music garde le contact/projet/morceau d'origine ; les vues résolvent ces références.
- Le destinataire enregistré est un choix explicite. Modifier l'email du contact
  ne remplace pas celui d'un brouillon : l'UI signale leur différence.
- IDA `read_workspace_mail_drafts` READ / `write_workspace_mail_drafts` WRITE,
  **et** `read_music_contacts` READ. Ce double contrôle est nécessaire car cette
  première projection partagée contient des données Music. Pas de ModuleKey
  Workspace ajouté artificiellement. Identité et workspace sont résolus au serveur.
- Revalidation avant/après lecture ou mutation ; verrou transactionnel workspace,
  clés étrangères composites et rollback si permission/session révoquée.
- POST UUID d'idempotence : 201 première création, 200 rejeu du même contenu,
  409 si clé réutilisée avec un autre contenu. PATCH utilise `expectedRevision` ;
  un rejeu de l'état déjà enregistré réussit sans deuxième événement d'audit.
- Schémas stricts, objet mono-ligne 240 caractères, texte 12 000 caractères,
  corps HTTP 128 Kio (couvre Unicode/échappements JSON), 25 brouillons par page.
  Texte rendu comme texte, jamais HTML. Aucun téléchargement ou visite de lien.
- Audit append-only `workspace.mail_draft.created` / `.updated` : IDs, champs
  modifiés, révision et état, jamais contenu du message, objet ou email.
- Classification : correspondance professionnelle privée du workspace, en base
  locale comme le carnet de contacts, pas mémoire/LLM. Archivage non destructif ;
  purge et rétention paramétrables non livrées. Le snapshot source exclut ces données.

## États, charge et limites

Chargement, liste vide, erreur/réessai, conflit et refus de session sont visibles.
Les champs restent après échec de sauvegarde ; une lecture en échec ne laisse pas
un ancien brouillon éditable. Aucune boucle de polling, transport email, caméra,
micro, provider ou nouvelle dépendance. Requêtes abandonnées au démontage.
Éditeur Mail chargé à la demande ; fenêtre/design spatial commun conservé,
Classic/Sci-Fi, clavier, bureau et 390 px.

Non livré : pièces jointes, rattachement direct release/booking, génération IA,
copie externe, validation finale, expédition, accusé de réception, relance datée
ou pipeline commercial complet. Les statuts autorisés sont DRAFT et ARCHIVED,
jamais APPROVED/SENT. Changer le champ lien n'altère pas automatiquement le texte.

Contrat exécutable : `packages/contracts/src/workspace-mail-drafts.ts`.
Contrat API : `docs/openapi/workspace-mail-drafts-v1.yaml`.
Preuves et restauration : `docs/checkpoints/MUSIC_MAIL_DRAFTS_20260930.md`.

Prochain lot prioritaire : relier les prochaines actions du contact aux tâches
datées partagées Workspace, avec retour visible dans Music. L'envoi externe
restera une tranche distincte avec approbation du message et destinataire exacts.
