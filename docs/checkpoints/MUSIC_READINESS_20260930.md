# Checkpoint Music — checklist réelle de préparation

30 septembre 2026. Dernière tranche B.7 validée. Music reste prioritaire ;
ne pas reprendre la refonte générale, les fournisseurs ou Finance à sa place.

## Reprise

- Audit stable : `docs/audit/MUSIC_STUDIO_PROGRESS_20260929.md`.
- **37 %** : 625/1700, arrondi de 36,8 %. Seul le critère 7 progresse de 0 à 50.
- Nouvelle entrée : Music Studio → Checklist de préparation.
- Contrat/parcours/limites : `docs/MUSIC_READINESS.md`.
- 93 tests ciblés API/Web et 8 recettes navigateur PASS ; aucun provider externe.
- Captures finales : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-dAiIVr`.
  Ces captures sont des preuves synthétiques, pas les données musicales de l’utilisateur.

## Fichiers et raccords

- Contracts : `music-readiness.ts`, export dans l’index commun.
- API : `music-readiness.ts`, tests, outil READ et route enregistrés dans `app.ts`
  après les tables de versions/demandes/assets. Aucune migration nouvelle.
- UI : `MusicReadiness.tsx`, `music-readiness.css`, entrée dans
  `ReferenceEnvironment.tsx`. Réutilise MusicLocalVersions avec trackId et
  ouverture explicite depuis la checklist ; MusicPromotion préfiltre ce morceau.
- Tests : `music-local-versions.test.ts` enrichi, nouveau
  `e2e/music-readiness.spec.ts` enregistré dans `playwright.config.ts`.

## Prochaine tranche utile

Compléter la fiche release : relations morceaux/assets, édition contrôlée des
métadonnées et historique, en réutilisant les catalogues existants. Garder le
même dossier entre Music, La Baraque et Workspace. Puis développer les contacts
musicaux/CRM et le brouillon de démarchage vers Workspace : les critères 9–13
restent à zéro et ne doivent pas être gonflés par une simple tâche de préparation.

## Restauration et limites

Snapshot avant B.7 : `tmp/source-checkpoints/2026-09-30T05-52-03-575Z-source`,
revérifié avant l’implémentation (908 fichiers). Snapshot après et manifeste
de vérification : `tmp/source-checkpoints/2026-09-30T08-33-10-412Z-source`,
916 fichiers, 8 884 889 octets. Cette note de localisation est ajoutée après
création ; l’implémentation finale et l’audit à 37 % sont dans le snapshot.

Les snapshots contiennent sources/tests/docs/config, pas coffre, clés, base
utilisateur, originaux ni médias privés. Restaurer dans un checkout distinct,
vérifier les hashes puis reconstruire ; ne pas écraser les travaux en cours.
Le checkout contient encore beaucoup de changements antérieurs mêlés ; ne
jamais les ajouter globalement au commit. Le build est prêt mais le serveur
personnel ouvert n’a pas été redémarré par cette tranche.
