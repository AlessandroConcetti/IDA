# IDA — Du média choisi à la proposition à valider

9 septembre 2026. Parcours manuel local, sans génération IA ni publication externe.

## Utilisation

1. Dans Contenus, rechercher une image ou vidéo non archivée. Le même bouton existe depuis une fiche média ouverte par le chat et les médias liés d'un morceau.
2. Cliquer **Préparer une publication**. Le média est relu par ID exact ; son ancien nom ou une réponse du chat ne servent pas d'autorisation.
3. Renseigner titre interne, plateforme cible, texte, objectif ; hashtags et appel à l'action facultatifs.
4. Cliquer **Créer la proposition à valider**, puis **Voir les propositions à valider**. Le centre existant permet d'approuver ou de refuser. La préparation n'est pas une approbation, et approuver ne publie pas.

L'interface propose Instagram, TikTok et YouTube, présents dans le registre local. Cela ne signifie pas que les comptes sont connectés ou qu'un format est publiable. Facebook reste accepté par le contrat uniquement si une entrée active existe côté serveur ; il n'est pas proposé dans cette démo. Aucun contrôle de ratio, durée ou droits d'exploitation n'est revendiqué. Une image cible YouTube est un brief interne, pas une capacité certifiée de son API.

Un média déjà proposé, utilisé, planifié ou publié peut être réutilisé explicitement. Aucun changement de son statut ou compteur d'usage ; la rotation existante l'exclut naturellement dès qu'un lien de proposition existe. Une vidéo seed sans fichier reste sans aperçu.

## Contrats et sécurité

`POST /v1/post-proposals`, corps strict : `requestId` UUID, `mediaId`, `postTitle` (240), `platform`, `caption` (4000), `objective` (2000), `hashtags` (30 × 100), `cta?` (500). Chaînes principales non vides et nettoyées. Aucun workspace, acteur, état, rationale IA, hash d'approbation, compte, date ou chemin client accepté. Contrat détaillé dans l'OpenAPI locale.

`createManualPostProposal` réutilise `posts`, `post_variants`, `post_variant_media`, `approvals`, `activity_logs` et `calculatePostVariantPayloadHash`. Post PROPOSED, variante/approbation REQUESTED, livraison NOT_CONFIGURED, fuseau du workspace ; date et rationale absentes. Transaction unique, sans migration, dépendance, nouveau Core ou agent.

L'outil `CONTENT/create_manual_post_proposal` exige WRITE via Identity/Tool Gateway. Relecture transactionnelle de l'identité avant écriture et avant commit, avec permissions initiales/courantes, session, appareil, grant et membership. Un EDITOR peut proposer, pas approuver. Dernière revalidation avant réponse. Pas de garantie de révocation rétroactive après commit/livraison : un résultat peut donc être incertain côté client.

Média et projet éventuel dans le même workspace, plateforme active côté serveur. Média absent/étranger : même 404. Archive, type autre qu'image/vidéo ou plateforme inactive : 409. Métadonnées du hash issues de SQL ; décisions ultérieures liées à l'approbation et au hash exacts. Ni usage de fichier ni appel réseau nécessaire à la préparation.

## Idempotence et audit

Retour 201 pour création, 200 pour retry : `{ data: { postId, variantId, approvalId, replayed } }`. Ce reçu n'est pas l'état actuel d'approbation ; une décision peut survenir entre deux tentatives. La queue existante liste les demandes encore en attente.

IDs déterministes SHA-256 de `[workspaceId, actorUserId, requestId]`, protégés par les clés primaires. Audit append-only `post_variant.proposed` : seulement `requestHash`, `approvalId`, `payloadHash`, `source: MANUAL`, jamais texte, nom de média, UUID brut ou secret. Même clé/corps validé : même reçu sans nouvelles lignes ; autre corps avec la même clé : 409. La conservation des posts et audits est nécessaire à cette garantie : toute future purge devra en tenir compte.

`PostProposalSubmission` déduplique aussi les clics en cours. Après premier envoi, champs verrouillés ; retry explicite avec clé/contenu identiques, jamais automatique. Brouillon et clé cliente ne survivent pas à la sortie du formulaire/rechargement : après incertitude, consulter les propositions avant d'en recréer une. Aucun brouillon métier en localStorage. Le transport existant invalide les réponses après verrouillage et notifie le résumé après mutation.

## Vérifications et limites

Validation globale : **1 142 tests / 53 fichiers**, dont 40 nouveaux ; lint, types et builds réussis.

Tests HTTP synthétiques : création → queue → approbation existante, retries concurrents/idempotence/conflit, isolation, entrées hostiles, formats bornés, refus Gateway/VIEW_ONLY, EDITOR, revalidation transactionnelle avec rollback, absence de publication/mémoire/modification média/réseau. Tests frontend : rendu initial inerte, éligibilité, validation, transport, reçu, doubles clics, retry stable, erreurs et invalidation de session.

Pas de nouvelle recette navigateur ni de test téléphone physique dans cette tranche ; frontend vérifié par rendu serveur et helpers. Cartes, boutons et tokens Classic/Sci-Fi réutilisés ; formulaire responsive à une colonne sur petit écran. Démo locale uniquement, sans nouvelle exposition réseau.

Restent à livrer : édition d'une proposition existante avec invalidation d'approbation, date éditoriale des nouvelles propositions, compatibilité réelle des plateformes et génération par fournisseur évalué. Dates de releases et Home Assistant restent en pause.
