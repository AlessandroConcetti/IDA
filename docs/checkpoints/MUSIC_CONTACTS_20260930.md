# Checkpoint Music B.9 — Labels & dates

30 septembre 2026. **43 %** : 725/1700, après 650/1700 à B.8 (38 %).
Seuls critères 10 (+50) et 11 (+25) progressent. Aucun gain compté pour
recherche intégrée, brouillons, envois ou booking encore absents.

## Livré et vérifié dans le build

Music Studio → Labels & dates : fiches sourcées, projet explicite, interlocuteur,
coordonnées facultatives, prochaine action, notes et suivi manuel. Identité
partagée dans `workspace_contacts`, relations Music séparées par projet.
Sources/limites : `docs/MUSIC_CONTACTS.md`, contrat OpenAPI dédié.

Cinq premières pistes officielles sont proposées sans auto-import : trois
marseillaises et deux labels. Les destinations ne sont pas automatiquement
qualifiées pour un artiste et rien ne prétend être une date à pourvoir.
Cadrage CONFIRMED dans `MUSIC_BOOKING_PRIORITIES_20260930.md` : deux projets,
Marseille et alentours prioritaires ; Avignon, Montpellier, Lyon ensuite ;
expérience de prestations privées et matériel, mais pas encore de portfolio.

## Preuves

- **187 tests / 20 fichiers PASS** : contacts, releases, checklist, versions,
  WAV, bibliothèque, inventaire, projets, handoffs/assets, médias, dates,
  transport et invalidation de session. Dont huit nouveaux tests API contacts
  et un test des suggestions.
- **12 recettes Edge PASS** : bibliothèque, versions, handoffs, checklist,
  releases, contacts, chacune Classic/Sci-Fi, responsive 390 px.
- Contacts : source réelle dans le formulaire, préremplissage sans écriture,
  sauvegarde réelle avec réponse perdue, retry sans doublon, conflit préservant
  les champs, filtrage, panne 503/réessai, fermeture/réouverture.
- Isolation workspace, READ/WRITE et VIEW_ONLY, révocation finale annulant
  la transaction, cohérence multi-projets, concurrence et vraie persistance
  après fermeture/réouverture API/base vérifiées.
- Typecheck API (tests inclus) et Web PASS ; builds API/Web PASS ; Biome des
  nouveaux fichiers PASS. Aucun ajout de dépendance/provider.
- Captures inspectées : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-sAwc50`.
- Warning existant : bundle principal Web ~973 Ko. La perf globale n’est pas
  requalifiée par les recettes ciblées.

Le runtime personnel n’a pas été redémarré. Les tests utilisent un lancement
isolé du build courant avec base synthétique et sorties réseau bloquées. Aucune
chanson personnelle, clé, source distante, compte ou mail n’a été modifié/envoyé.

## Reprise prioritaire

1. Brouillon Workspace partagé, lié à la fiche Music : objets persistants,
   révisions, lecture/modification depuis les deux mondes, zéro envoi implicite.
2. Présentation privée basée sur expérience/matériel déclarés, pas faux contenu.
   Référence à un morceau/lien validé pour les labels ; ne pas mélanger les projets.
3. Relance/tâche datée avec le moteur commun, historique visible et pipeline
   d’opportunités. Compter la réussite seulement après E2E/persistance/erreurs.

## Restauration

Avant : `tmp/source-checkpoints/2026-09-30T12-00-09-975Z-source`, 926 fichiers,
intégrité vérifiée. Après :
`tmp/source-checkpoints/2026-09-30T14-06-54-603Z-source`, 937 fichiers,
9 074 370 octets. Copie et empreintes vérifiées à la création ; le présent
ajout de référence est postérieur à cette copie (code inchangé).
Ces copies gardent les sources/tests/docs/config, jamais coffre, bases ou médias.
Elles ne remplacent pas une sauvegarde de données personnelles.

Checkout très largement modifié depuis plusieurs chantiers. Ne jamais stage
global, reset ou restaurer par-dessus. Le commit documentaire décrit le lot ;
le snapshot source complet préserve aussi les raccords mixtes non commités.
