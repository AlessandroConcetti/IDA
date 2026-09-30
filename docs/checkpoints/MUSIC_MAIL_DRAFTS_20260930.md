# Checkpoint Music B.10 — brouillons partagés

30 septembre 2026. **49 %** du prompt Music : 825/1700, après 725/1700 (43 %)
à B.9. Seuls critères 12 et 13 progressent de 0 à 50. Aucun gain pour envoi,
approbation, recherche intégrée ou booking absent.

## Tranche vérifiée

Music Studio → Labels & dates → contact → Brouillons pour ce contact.
Trois intentions : label, date bar/club, prestation privée. Préremplissage
déterministe explicite, présentation saisie, morceau du bon projet facultatif,
lien et destinataire choisis. Un seul objet Workspace, éditable depuis Music,
Workspace (carte Mail → Brouillons Music) et Mail (Brouillons Music).

Persistance, révisions, idempotence, archivage, destinataire non remplacé
silencieusement, conflits conservant la saisie et erreurs/réessai. Un brouillon
ne modifie pas l'étape du contact. Aucun message envoyé, contenu cloud ou
brouillon Gmail créé. Contrat : `docs/WORKSPACE_MAIL_DRAFTS.md`, ADR 0011 et
OpenAPI `workspace-mail-drafts-v1.yaml`.

## Preuves du 30 septembre

- **199 tests / 22 fichiers PASS**, dont 10 tests API brouillons et 2 tests de
  préremplissage/navigation. Inclut les six tranches Music précédentes et les
  transports/invalidations partagés ciblés.
- **14 recettes navigateur Edge PASS**, sept parcours Music en Classic/Sci-Fi.
  Brouillons : création, perte de réponse après écriture/retry sans doublon,
  passage Music → Workspace → Mail → Music, même ID et texte, conflit concurrent,
  panne 503/réessai, onglet masqué sans perdre une saisie, réouverture, 390 px.
- API : fermeture/réouverture réelle de la base et du runtime, isolation d'un
  autre workspace, double permission IDA/Music, VIEW_ONLY, révocation finale
  annulant les mutations, concurrence, pagination et rejets d'entrées.
- Corrections issues de revue : limite HTTP couvrant les 12 000 caractères
  Unicode, titre de morceau multiline compatible avec sa source, conservation
  du panneau d'édition Workspace lors d'un changement d'onglet. Invalidation
  de session toujours prioritaire.
- Builds Contracts/API/Web et typechecks API/Web : PASS. Biome des 9 fichiers
  propres à la tranche : PASS. OpenAPI parsé, références internes résolues.
- Captures : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-FlD3Qz`.
  Données synthétiques identifiables, aucune correspondance personnelle.
- Aucun polling/provider/audio/caméra/micro ajouté. Éditeur Mail différé.
  Warning build existant : bundle principal ~988 Ko, chunk éditeur ~12 Ko ;
  performance globale CPU/GPU/RAM d'IDA non requalifiée par ces tests.

Recettes sur lancement isolé du build courant (8791), sorties externes bloquées.
**Le runtime personnel n'a pas été redémarré.** Le prochain lancement normal
doit utiliser ce build ; aucune recette de déploiement sur la base personnelle
n'est revendiquée. Les tests n'ont modifié aucun contact ou mail réel.

## Reprise utile prioritaire — B.11

Relier la prochaine action du contact à une vraie tâche datée Workspace, avec
accès aller-retour, fin explicite, historique et reprise. Réutiliser Task Center
et les contrats des handoffs Music, ne pas inventer un scheduler ni envoyer de
relance en silence. L'utilisateur veut décrocher des dates : deux projets,
Marseille/alentours prioritaires, puis Avignon/Montpellier/Lyon ; privé compris.

Restent notamment : recherche autorisée/sourcée intégrée, pipeline booking,
pièces jointes, liaison directe release/booking, approbation et expédition,
retour d'envoi, purge/rétention pilotée et annuaire Contacts général.

## Restauration et Git

Avant B.10 : `tmp/source-checkpoints/2026-09-30T14-55-28-065Z-source`, 937 fichiers,
9 074 548 octets, intégrité revérifiée. Après validation :
`tmp/source-checkpoints/2026-09-30T17-52-03-149Z-source`, 950 fichiers,
9 165 115 octets. Empreintes vérifiées lors de la copie ; cette référence
documentaire est postérieure au snapshot, code inchangé.
Copies sources/tests/docs/config uniquement, sans médias, base, coffre ou secrets.
Ce n'est pas une sauvegarde des données personnelles.

Le checkout contient de nombreux chantiers antérieurs non commités. Les fichiers
neufs propres à B.10 et sa documentation sont commités séparément ; les raccords
dans les gros fichiers mixtes sont préservés dans le snapshot complet. Ne pas
restaurer par-dessus, stage global ou nettoyer ces travaux préexistants.
