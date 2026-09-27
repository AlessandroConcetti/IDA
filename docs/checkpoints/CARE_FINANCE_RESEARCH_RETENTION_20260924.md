# Checkpoint — CARE / Finance : recherche publique et conservation

## Addendum backend du 2026-09-27

- Suppression CARE/Finance : un tombstone minimal est maintenant écrit dans une
  table séparée, dans la même transaction que la purge et l'audit. Il ne contient
  que l'ID opaque, le workspace, le propriétaire, la révision finale et l'heure ;
  le contenu et le titre restent supprimés. Une sauvegarde cohérente prise après
  l'opération conservera ce marqueur. Cela ne neutralise pas une sauvegarde plus
  ancienne qui précède le tombstone : aucun mécanisme de sauvegarde/restauration de
  production ni registre anti-rollback indépendant n'est encore implémenté.
- Tests synthétiques ciblés CARE/Finance : 11 réussis. Aucun document réel ni clé
  DPAPI de l'utilisateur n'a été utilisé.
- Ajout d'une capture logique en lecture seule, cohérente dans une transaction PGlite,
  puis d'un planificateur pur de reprise : il refuse l'absence de registre courant,
  fusionne ses tombstones avec ceux de l'archive et filtre les lignes supprimées ;
  4 tests synthétiques passent. Ce n'est pas encore un workflow de restauration :
  ni l'archive complète ni la fraîcheur/authenticité du registre ne sont protégées.
- Ajout d'une primitive cryptographique unitaire de re-chiffrement sous un ID et un
  matériel distincts, avec effacement du buffer plaintext temporaire. Elle ne réalise
  pas encore la rotation atomique et durable du trousseau ou des lignes PGlite.
- Vérification finale ciblée : 40 tests sur les trois suites coffre/restauration/
  chiffrement, TypeScript API et Biome réussis.
- Ajout d'un protocole pur de trousseau versionné et reprenable après interruption :
  une rotation conserve l'ancienne clé active pendant le rechiffrement, refuse
  l'activation si des lignes l'utilisent encore et refuse le retrait sans zéro
  référence et attestation de sauvegarde. Le plan refuse aussi un relevé de références
  incomplet au lieu de supposer qu'une clé absente a zéro ligne. Quatre tests de
  protocole supplémentaires passent (44 tests ciblés au total). Cette brique n'est
  pas persistée, n'est pas branchée à DPAPI/PGlite, et l'attestation de sauvegarde
  n'est pas vérifiable par elle-même ; elle ne constitue donc pas une rotation
  opérationnelle.
- L'inspection confirme le blocage concret du runtime : `AgentGoalKeyProvider`
  expose une seule clé de 32 octets (`getKey` / `getExistingKey`) et le coffre dérive
  ses enveloppes avec un `keyId` constant. Le lancement local instancie un provider
  DPAPI par domaine, mais aucun mécanisme ne charge plusieurs versions. Changer la
  clé en place casserait la lecture des lignes existantes ; aucun changement de clé
  n'a été fait.
- Vérification de reprise : 44 tests synthétiques sur les suites coffre,
  sauvegarde, chiffrement et trousseau ; TypeScript API réussi. Aucun coffre réel,
  secret ou profil DPAPI utilisateur n'a été sollicité.
- Ajout d'un compteur interne et read-only des enveloppes par version de clé, dans
  un snapshot PGlite `REPEATABLE READ`. Il traite séparément CARE et Finance, inclut
  les documents révoqués (toujours conservés) et refuse les identifiants de clé
  absents ou inconnus. C'est une mesure ponctuelle ; elle ne verrouille pas le coffre
  contre les écritures qui surviendraient ensuite. Les tests synthétiques ciblés
  passent maintenant à 46.
- Le registre comporte maintenant les deux coffres locaux chiffrés :
  `/v1/care/documents` et `/v1/finance/documents`. Le checkpoint du 26 septembre
  ne reflétait pas encore l’activation du coffre Finance déjà présente dans le code.
- Ajout de `POST /v1/{care,finance}/documents/:id/access` pour `REVOKE_ACCESS` et
  `RESTORE_ACCESS`. Chaque transition requiert le propriétaire, la confirmation
  explicite, la révision attendue et une session encore valide.
- Les documents révoqués restent retrouvables par le propriétaire via
  `GET /v1/{care,finance}/documents?includeRevoked=true`; les autres membres ne
  peuvent pas lister cette vue.
- La révocation bloque immédiatement la lecture et le partage aux agents tout en
  conservant le document. La restauration et la révocation re-chiffrent la charge
  avec la nouvelle révision/AAD dans la même transaction que l’audit minimal.
- CARE accepte une attribution de pôle explicite conservée dans la charge chiffrée :
  RHEUMATOLOGY, DERMATOLOGY, NEUROLOGY, SHARED ou UNCLASSIFIED. Les entrées historiques
  non attribuées restent UNCLASSIFIED ; aucune spécialité n'est inférée du texte.
  Un run spécialisé bloque un document attribué à un autre pôle, tandis que le run
  cross-lab accepte plusieurs documents CARE sélectionnés explicitement. Le pôle
  est inclus comme provenance dans l'en-tête de chaque extrait envoyé au modèle local,
  et un test vérifie les deux attributions sans exposer les contenus dans l'audit. Finance
  refuse le champ CARE. `POST /v1/care/documents/:id/lab` permet aussi au propriétaire
  de réattribuer un document actif avec confirmation et révision attendue; le contenu
  est re-chiffré avec la nouvelle AAD et le tag n'entre pas dans l'audit.
- Le store de missions accepte désormais les IDs candidats chiffrés. Lors d'un run
  CARE/Finance, `goalContext` lie une mission et sa révision attendue; il ne donne pas
  le droit de lecture. Le propriétaire doit encore sélectionner séparément les IDs,
  qui sont validés comme sous-ensemble des références de la mission puis relus par le
  coffre du domaine sous ses propres permissions. Le résolveur revalide workspace,
  propriétaire, session, instance, état et révision pendant le run. Seules des
  références sont retournées au résolveur; le texte de mission n'est pas injecté.
- Vérification ciblée : tests du coffre CARE/Finance et des agents cross-lab réussis ;
  tests du résolveur de mission réussis ; TypeScript API/Contracts et Biome sur les
  fichiers ciblés réussis. Six suites ciblées totalisent 108 tests. Tests sur données
  synthétiques en mémoire ; aucune
  clé DPAPI réelle ni aucun document de l’utilisateur n’a été lu.
- Restent bloqués par l’expérience Windows réelle : valider DPAPI CurrentUser depuis
  le processus IDA. Le dépôt ne fournit toujours pas d’UI frontend de sélection,
  révocation/restauration, export ou import PDF/DOCX ; Astra garde la piste frontend.
  Pas de sauvegarde/restauration durable avec tombstones ni de rotation de clé.

La prochaine action backend sans compte externe est de concevoir un provider DPAPI
versionné capable de lire deux clés sans écraser l'ancienne, puis d'intégrer le
rechiffrement transactionnel, la reprise et le rollback au coffre. Cela devra être
validé sous le processus IDA Windows avant toute activation. La sauvegarde durable,
son authentification/fraîcheur anti-rejeu et la restauration avec tombstones restent
également à construire. La validation DPAPI CurrentUser exige la session Windows
réelle ; aucune donnée privée ne doit y être enregistrée avant cette validation.
L'UI de sélection des documents, liaison d'une mission et réattribution des pôles
reste dans la piste frontend d'Astra.

## Addendum d'exécution du 2026-09-26

- Ajout de `apps/api/src/care-retained-documents.ts` : stockage PGlite chiffré
  AES-256-GCM, enregistrement explicite, liste metadata-only, lecture no-store et
  suppression transactionnelle après confirmation OWNER.
- Le run CARE accepte désormais `retainedDocumentIds` : il charge seulement les IDs
  sélectionnés du workspace/propriétaire. L'audit ne garde ni titre ni texte ; les
  documents conservés ne sont pas envoyés au cloud.
- La clé DPAPI est dédiée et ne se crée qu'après confirmation d'enregistrement.
  Le test réel `CurrentUser` échoue dans le sandbox Codex car le profil interactif
  Windows n'y est pas chargé ; valider depuis IDA bureau avant tout document réel.
- Limites : texte seulement, sans UI d'import, PDF/DOCX, extraction/citations,
  export, révocation persistante, rotation durable ni sauvegarde/restauration.
  Finance n'est pas encore raccordé ; frontend complet reste à Astra.
- Vérification ciblée : 31 tests API/agents réussis et `apps/api` typecheck réussi.
  Le test de DPAPI réel n'a pas passé dans cet environnement.

Date : 2026-09-24

## Livré et vérifié

- `CareResearchAdapter` interroge uniquement Europe PMC avec des sujets publics
  bornés (rhumatologie, dermatologie, neurologie).
- Chaque recherche exige un consentement ponctuel. L'option traitement ajoute
  uniquement le terme documentaire public `adalimumab / anti-TNF` ; aucun dossier,
  symptôme, dose, compte, document privé ou livre n'est transmis.
- Limites locales : une recherche simultanée, 30 appels par heure, timeout de
  10 secondes et cache de 15 minutes. Les résultats sont bornés à dix articles
  et leurs liens Europe PMC.
- Identité et verrou local sont revérifiés avant l'appel externe et avant la
  livraison. L'audit ne conserve que des identifiants opaques et le résultat de
  l'opération.
- Le panneau CARE ouvre la recherche depuis chaque laboratoire avec un consentement
  visible et une notice de confidentialité.
- Le panneau Agents affiche la règle commune CARE/Finance : le futur coffre ne
  supprimera rien automatiquement ; suppression seulement sur autorisation
  explicite du propriétaire.

## Règle de conservation confirmée

CARE et Finance suivent `docs/adr/0009-user-controlled-retention-care-finance.md`.
Les documents médicaux, symptômes, traitements, notes de laboratoire, données
financières, budgets, justificatifs et notes restent jusqu'à une demande explicite
de suppression. Cette règle est acceptée mais le stockage durable n'est pas encore
activé : les écrans actuels restent éphémères et n'enregistrent aucune donnée réelle.

Avant activation du coffre : séparation propriétaire/workspace, chiffrement
authentifié, rotation, sauvegarde/restauration, export, révocation, suppression
active des caches et tests d'autorisation sont obligatoires. Finance reste en
lecture seule ; aucune banque, transaction ou paiement n'est ajouté.

## Vérifications de cette tranche

- API contrats/domain : build réussi.
- API : typecheck et build réussis.
- CARE recherche : 5 tests réussis (consentement implicite refusé, cache, limite
  de source, erreur fournisseur et révocation de session).
- Suite agents ciblée : 50 tests réussis.
- Lint Biome ciblé : réussi.
- Frontend Vite : build réussi (726 modules transformés).
- OpenAPI : route quota Google documentée et test de parité réussi.

## Reprise

Le prochain jalon est le coffre chiffré CARE/Finance avec contrat de cycle de vie
et tests d'accès/suppression. Aucun secret, appel facturable ou document réel n'a
été utilisé dans cette tranche.
