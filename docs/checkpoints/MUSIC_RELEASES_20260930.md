# Checkpoint Music B.8 — fiche release

30 septembre 2026. Audit **38 %**, 650/1700 (38,2 %), critère 6 seul de 50 à 75.
Avant : B.7 à 37 %. Pas de gain pour les domaines encore absents.

## Validé

Music Studio → Mes releases : édition, liens morceaux, médias directs et
historique. Catalogue commun, checklist et rafraîchissement des projections.
Contrats et limites : `docs/MUSIC_RELEASES.md` et
`docs/openapi/music-releases-v1.yaml`.

- 178 tests ciblés, 18 fichiers API/Web/contracts PASS.
- 10 recettes Edge isolées Classic/Sci-Fi PASS, dont 2 nouvelles release.
- Types/builds Contracts/API/Web et lint des fichiers de la tranche PASS.
- Persistance après vraie fermeture/réouverture API+base, conflits, retry
  après réponse perdue, isolation, révocation, mobile 390 et erreurs prouvés.
- Captures `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-FVIGU2`.
- Aucun original musical, compte externe, envoi ou provider touché.

Fichiers : `music-releases.ts` API/tests, `MusicReleases.tsx`, CSS,
`music-release-transport.test.ts`, `e2e/music-releases.spec.ts`. Raccords dans
contracts/index, app.ts, ReferenceEnvironment, playwright.config et api-transport.
Ce dernier notifie les mutations release et préserve le code 401 tout en
invalidant les autres lectures ; tests de session/voix/refresh repassés.

## Suite prioritaire

L’utilisateur précise avoir très peu de moyens et devoir trouver dates/labels.
Priorité désormais : contacts sourcés, opportunités et brouillons accessibles,
pas raffinement visuel du catalogue. Question non bloquante envoyée pour
projet/styles/villes. Ne pas attendre pour développer les parcours locaux.
Aucun contact automatique, faux email, résultat garanti ou nouvelle API.

L’audit architectural confirme l’absence d’annuaire partagé et de brouillon
Mail opérationnel : les créer comme primitives communes nécessaires, pas sous
forme de texte caché dans une tâche. Tasks reste réutilisable pour les relances.

## Restauration

Avant B.8 : `tmp/source-checkpoints/2026-09-30T09-15-00-727Z-source`.
Après B.8 : `tmp/source-checkpoints/2026-09-30T12-00-09-975Z-source`,
926 fichiers et 8 978 729 octets, empreintes vérifiées. Les snapshots excluent
coffre, clés, bases et médias ; ne remplacent pas une sauvegarde utilisateur.
Checkout largement modifié par travaux antérieurs : ne jamais stage global,
reset ou réécriture. Restaurer dans un checkout distinct puis comparer.
Le runtime personnel n’a pas été redémarré : seul le build courant est validé.
