# Checkpoint Music — retour des visuels, 30 septembre 2026

## État validé et reprise

Music reste la priorité. Les rôles des versions locales et le dossier de préparation
partagé sont conservés. B.6 ajoute le rattachement d’une image privée réellement
importée dans une demande Music, visible depuis La Baraque et Workspace aussi.

Entrée : Music Studio → Contenus & promotion → une demande → Visuels proposés.
Autres entrées : La Baraque / Workspace → Demandes Music → même demande.

Référence : `docs/MUSIC_CONTENT_HANDOFF.md`. Audit courant :
`docs/audit/MUSIC_STUDIO_PROGRESS_20260929.md` (34 %, grille inchangée, 575/1700).

## Preuves et limites

- 7 tests API nouveaux, dont import privé réel, hash altéré à taille égale refusé,
  permissions multi-domaines, isolation, concurrence, rollback et base réouverte.
- Régression de 11 fichiers : 81 tests API + 6 tests Web PASS.
- Recettes des deux thèmes : réponse perdue après écriture, réessai sans doublon,
  aperçu manquant puis relancé, même référence dans les trois mondes, mobile/reprise.
- Builds et contrôles de types API/Web ; lint ciblé. Pas de dépendance ajoutée.
- Aucun original musical modifié, aucun cloud, client démarché ou média publié.
- Les tests utilisent des fichiers synthétiques. Pas de pochette utilisateur créée.
- Le build est préparé ; le serveur personnel ouvert n’a pas été redémarré.
- `sourceState=UNCHANGED` décrit les métadonnées, pas la présence actuelle du fichier.
  L’aperçu refait la lecture privée ; le reçu de rattachement conserve sa date initiale.
- Manquent encore : rôle/version/retrait/validation artistique des visuels,
  autres types de livrable, checklist de sortie, CRM/booking/démarchage musical.

## Prochaine tranche

Checklist musicale de préparation construite à partir des données réelles du morceau,
des versions, des assets et des validations — sans inventer une readiness. Garder
un accès direct à chaque manque depuis Music. Puis fiche release/CRM selon le brief.

## Restauration

Snapshot avant B.6 : `tmp/source-checkpoints/2026-09-29T21-02-29-801Z-source`.
Un snapshot source après validation est créé à la clôture. Son `manifest.json`
donne les hashes et le périmètre. Il contient code/tests/docs/config, pas médias,
secrets, coffre ou base utilisateur. Restaurer dans un nouveau checkout après
vérification, puis reconstruire ; ne pas écraser le workspace en cours.

Le checkout contient beaucoup de travaux antérieurs non commités et des fichiers
d’intégration mêlés. Ne pas ajouter globalement ces changements dans un commit.
