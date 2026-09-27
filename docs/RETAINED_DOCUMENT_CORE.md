# Socle de conservation CARE / Finance

> **Mise à jour 2026-09-27 (état actuel, remplace l'état historique ci-dessous).**
> Les coffres HEALTH et FINANCE sont raccordés à PGlite avec une enveloppe
> AES-256-GCM, des routes authentifiées et le partage ponctuel d'IDs sélectionnés
> aux agents correspondants. L'enregistrement exige `explicitSave: true`; suppression,
> révocation et restauration exigent le propriétaire, `explicitConfirmation: true` et
> la révision courante. Chaque transition d'accès re-chiffre la charge avec sa nouvelle
> révision/AAD dans la transaction de l'audit. Les textes privés ne sont pas en clair
> dans les tables ni dans l'audit. CARE accepte une attribution explicite à un pôle
> (`RHEUMATOLOGY`, `DERMATOLOGY`, `NEUROLOGY`, `SHARED` ou `UNCLASSIFIED`) qui reste
> dans la charge chiffrée. Les anciennes entrées sans pôle sont lues comme
> `UNCLASSIFIED`; aucune spécialité n'est déduite automatiquement. Un agent spécialisé
> refuse un document explicitement attribué à un autre pôle; l'agent cross-lab peut
> rapprocher plusieurs documents seulement lorsqu'ils sont choisis pour ce run. Le pôle
> figure dans l'en-tête de provenance transmis au modèle local sans être ajouté à l'audit.
> Une mission peut restreindre la sélection par une liste de références chiffrées, mais
> n'accorde jamais d'accès : le propriétaire sélectionne les IDs pour chaque run, qui
> les compare à la révision courante de la mission, puis relit le coffre du domaine.
>
> **L'activation n'est pas validée de bout en bout sur l'instance de bureau.** Le test
> local DPAPI `CurrentUser` échoue dans l'environnement Codex car le profil utilisateur
> Windows n'y est pas chargé ; l'opération échoue alors sans écrire le document.
> Vérifier cette initialisation depuis le processus IDA ouvert par l'utilisateur avant
> d'y conserver des données réelles. L'import est limité au texte : PDF/DOCX et UI
> d'import/export restent à faire. La sauvegarde/restauration durable et la rotation
> restent également à faire.

Date de création : 2026-09-24. État actuel détaillé ci-dessous et dans l'actualisation.

`apps/api/src/retained-document-core.ts` implémente deux briques pour la prochaine
tranche de coffre. Ce module ne crée ni dossier, clé persistante, fichier utilisateur,
table, endpoint ni permission. Aucun agent n'y reçoit un accès documentaire.

## Marqueurs de suppression pour reprise

Mise à jour 2026-09-27 : le coffre persiste maintenant un tombstone sans contenu dans
`care_retained_documents_tombstones` et `finance_retained_documents_tombstones` quand
le propriétaire confirme une suppression. Le marqueur (ID opaque, workspace, owner,
révision après suppression, horodatage) est écrit dans la même transaction que la
purge de la ligne chiffrée et l'audit. Il ne contient ni titre, catégorie, texte ni
enveloppe chiffrée. Une copie cohérente de la base prise après cette transaction
conserve donc le fait de suppression.

La purge actuelle retire la ligne logique ; elle ne certifie pas l'effacement physique
des pages/WAL du moteur ni des sauvegardes antérieures, qui peuvent encore contenir
le texte chiffré.

`apps/api/src/retained-document-backup.ts` capture les lignes chiffrées et tombstones
CARE/Finance dans une transaction PGlite `REPEATABLE READ READ ONLY`, en mémoire
uniquement. Son planificateur pur exige ensuite un registre courant, fusionne ses
marqueurs et exclut les lignes correspondantes avant restauration. Le module ne lit
ni n'écrit de fichiers, ne chiffre pas l'archive complète et ne peut pas prouver que
le registre fourni est récent ou authentique. Aucun workflow de restauration
n'appelle encore ce planificateur.

`reencryptRetainedDocument` re-chiffre une enveloppe authentifiée avec un nouvel ID
et un nouveau matériel de clé, puis efface son buffer plaintext temporaire. Cela
reste une primitive par document : aucun trousseau versionné DPAPI, changement
atomique de toutes les lignes, reprise après crash ni rollback de coffre n'est livré.

`apps/api/src/retained-document-keyring.ts` définit maintenant un protocole pur et
versionné (`ACTIVE` → `STAGED` → `ACTIVE`/`RETIRED`) : il permet de reprendre le
plan après redémarrage, interdit l'activation tant que des lignes référencent encore
l'ancienne clé et interdit son retrait tant qu'il reste des références. Il exige un
compteur explicite pour chaque version ; un relevé incomplet est refusé, jamais traité
comme zéro. Ce module
ne persiste rien, ne contient pas de clés et n'est raccordé ni au provider DPAPI ni
aux transactions du coffre. Son argument `verifiedBackup` est une attestation fournie
par l'appelant, pas une preuve cryptographique : aucune sauvegarde durable vérifiable
n'existe encore. Les tests ne démontrent donc pas une rotation de production.

`countRetainedVaultKeyReferences` lit le nombre d'enveloppes par `keyId` dans un
snapshot PGlite cohérent et read-only, séparément pour CARE ou Finance. Les documents
révoqués sont comptés car ils restent conservés et doivent rester déchiffrables. Un
`keyId` absent/inconnu fait échouer le comptage. Ce résultat est un instantané, pas un
verrou : il ne peut pas autoriser à lui seul une activation ultérieure si des écritures
peuvent survenir entre le comptage et la migration.

Limite importante : ce tombstone dans PGlite ne constitue pas une protection contre
le rejeu d'une sauvegarde plus ancienne que le marqueur ; cette copie ne contient pas
encore le tombstone. IDA ne fournit toujours pas de sauvegarde/restauration de
production, de registre anti-rollback indépendant ni de rotation durable de clé.
Ne pas remettre en ligne une base historique avant une future reconciliation des
tombstones et l'invalidation des sessions. Aucun vrai coffre ni profil DPAPI n'a été
utilisé pour cette tranche.

## Enveloppe chiffrée versionnée

- AES-256-GCM, nonce aléatoire de 12 octets, tag de 16 octets ; une clé de 32 octets
  doit être fournie par le futur adaptateur de clés serveur. Elle n'est pas générée,
  stockée ou recherchée dans ce module.
- AAD canonique : format, identifiant de clé, domaine HEALTH/FINANCE, workspace,
  propriétaire, document, révision et règle de conservation. Changer la portée,
  même pour un document chiffré avec la même clé, rend son ouverture impossible.
- Charge opaque bornée à 2 Mio ; titre, type et contenu doivent se trouver **dans**
  la charge chiffrée, pas dans les métadonnées publiques. Type/hash/antivirus/parsing
  isolé restent à implémenter dans le futur parcours d'import.
- Décodage base64 canonique, enveloppe stricte, aucune livraison de plaintext avant
  validation GCM. Erreurs à codes fixes sans contenu ni détails crypto.
- Les copies temporaires de clé et le buffer provisoire de déchiffrement sont
  effacés au mieux. Pas de promesse de purge forensique JavaScript, du heap, du
  système ou des buffers détenus par l'appelant. Le plaintext rendu lui appartient.

Le test de re-chiffrement avec une nouvelle clé et le protocole pur de trousseau ne
prouvent **pas** la rotation atomique d'un coffre persistant ni sa restauration. Ces
tests d'intégration restent obligatoires.

## Conservation et révocation

Règle immuable dans ce format : `UNTIL_OWNER_EXPLICIT_DELETE`. Aucun champ TTL,
date d'expiration, commande d'agent ou timer de nettoyage n'est accepté.

| Action du propriétaire | État résultant | Contenu |
|---|---|---|
| Révoquer l'accès | ACCESS_REVOKED | Conservé, futurs traitements refusés par le store |
| Rétablir explicitement l'accès | STORED | Conservé |
| Demander explicitement la suppression | DELETION_REQUESTED | Purge à effectuer/vérifier, **pas déjà supprimé** |

Le planificateur de transition vérifie portée propriétaire/workspace/document,
confirmation explicite et révision attendue. Il refuse agents, timers, mauvais
propriétaires, commandes obsolètes et reprise d'une suppression en attente.
Il ne marque jamais un fichier DELETED avant une purge réelle vérifiée.

**Frontière de confiance :** le champ `actor` n'est pas une preuve d'identité. Le
module est interne, appelé seulement **après** Identity → Permissions → Tool Gateway
et approbation liée à l'action. Le futur endpoint ne doit jamais accepter l'identité
effective depuis un JSON client ou un modèle. Il doit revérifier session, instance,
membership et propriétaire avant lecture, transaction et livraison.

Une transition changeant la révision impose de re-sceller le contenu avec la nouvelle
AAD dans la même transaction. La couche persistante devra assurer idempotence,
concurrence, journalisation atomique, annulation des lectures après révocation et
rejeu des tombstones avant toute restauration de sauvegarde.

## Reste avant complétion et validation de bureau

1. Vérifier que l'initialisation de la clé DPAPI CurrentUser fonctionne depuis IDA
   lancé sous le profil interactif ; le profil manque dans l'environnement Codex.
2. Ajouter export explicite, rotation durable et sauvegarde/restauration avec
   tombstones de suppression.
3. Faire livrer par Astra l'UI d'import/sélection. Le backend accepte du texte seulement,
   avec une limite de 2 Mio au stockage et 12 000 caractères par contexte agent ;
   aucun PDF/DOCX ni livre complet n'est encore traité.
4. Ajouter provenance/citations et vérifier la purge des copies éventuelles ; aucune
   donnée sensible réelle n'a été testée.

Le store de chat existant n'est pas utilisé : il écrit des colonnes texte et purge
selon ses propres limites de conversation. CARE et Finance utilisent des tables
chiffrées dédiées, distinctes du chat et l'une de l'autre.

## Contrat HTTP CARE actuellement implémenté

Les routes sont locales, authentifiées par Identity/Tool Gateway, limitées au
workspace et au propriétaire résolus côté serveur, et répondent `Cache-Control:
no-store` :

- `GET /v1/care/documents` retourne au plus 500 métadonnées du propriétaire ; le
  contenu n'est jamais inclus. Un coffre vide ne crée pas de clé.
- `GET /v1/{care,finance}/documents?includeRevoked=true` ajoute les métadonnées
  révoquées, et est réservé au propriétaire ; cela permet de retrouver un document
  conservé afin de rétablir son accès.
- `POST /v1/care/documents` accepte strictement `title`, `category`, `content`,
  `explicitSave: true` et le champ facultatif `careLab`. Ce dernier n'est jamais
  inféré et vaut `UNCLASSIFIED` s'il est omis. Finance refuse ce champ. Seul le texte
  est pris en charge ; l'enveloppe chiffrée est limitée à 2 Mio. Une clé DPAPI manquante
  fait répondre l'API en erreur sans écrire.
- `POST /v1/care/documents/:id/lab` permet au propriétaire de réattribuer un document
  CARE existant et actif. Le corps strict contient `careLab`, `expectedRevision` et
  `explicitConfirmation: true`. Le texte est authentifié puis re-chiffré sous la
  nouvelle révision/AAD dans la même transaction que l'audit; le tag lui-même n'est
  pas écrit dans l'audit. Une révision obsolète, un membre non-owner ou un document
  révoqué est refusé. Cette route n'existe pas pour Finance.
- `GET /v1/care/documents/:id` rend le contenu au propriétaire après revalidation de
  session/permissions et authentification AES-GCM du document.
- `DELETE /v1/care/documents/:id` exige le rôle `OWNER`, le corps strict
  `{ "expectedRevision": n, "explicitConfirmation": true }` et une révision courante.
  La suppression de ligne et l'audit minimal sont transactionnels ; aucun agent ni
  temporisateur ne peut la demander.
- `POST /v1/{care,finance}/documents/:id/access` accepte `REVOKE_ACCESS` ou
  `RESTORE_ACCESS`, exige `OWNER`, confirmation explicite et révision attendue ; le
  changement d'état, le nouveau chiffrement/AAD et l'audit sont atomiques. Révoquer
  bloque lecture et partage aux agents mais conserve le contenu.
- `POST /v1/environment-agents/run` accepte facultativement 1 à 12
  `retainedDocumentIds` uniques uniquement pour CARE, ou `financeDocumentIds` uniques
  uniquement pour Finance. Le serveur revalide séparément chaque autorisation de
  lecture, charge seulement les documents choisis pour le run local, impose une limite
  de contexte et n'enregistre dans l'audit que le nombre chargé. Un run d'un seul pôle
  refuse les documents explicitement affectés à un autre pôle ; `SHARED` et
  `UNCLASSIFIED` ne passent qu'avec sélection explicite. Le run cross-lab accepte les
  pôles CARE choisis. Aucun appel cloud ni partage automatique n'est fait. Le test du
  rapprochement cross-lab utilise des notes synthétiques ; aucun document réel n'a été
  traité.

Ce contrat serveur ne signifie pas que l'utilisateur dispose déjà d'une UI pour
importer, sélectionner ou supprimer ces documents : cette partie reste confiée au
frontend et n'est pas livrée par cette tranche.
L'UI ne fournit pas encore le choix visuel du pôle ou la réattribution d'un document
historique. Ces actions sont disponibles dans le contrat API, mais les anciens
documents restent `UNCLASSIFIED` jusqu'à une confirmation du propriétaire.
