# Music Studio — avancement face au prompt complet

29 septembre 2026. Référence : `docs/MUSIC_STUDIO_PRODUCT_BRIEF_20260928.md`
(86 sections), notamment sa Definition of Done §80 et ses recettes §75–76.

## Bilan honnête

**Environ 20 % du Music OS demandé.** Estimation de périmètre fonctionnel, pas
pourcentage de couverture de tests, de fidélité artistique ou de fonctionnalités
entièrement closes. Le catalogue et les premiers parcours fichiers/releases
existent ; les chaînes CRM, booking, recherche sourcée et échanges entre mondes
restent majoritairement à construire. Une infrastructure commune disponible
ailleurs dans IDA ne vaut pas un parcours musical livré.

La tranche du jour rend le relevé local réellement consultable depuis Music.
Elle ne transforme pas les 1 970 groupes trouvés en discographie approuvée et
n’importe pas les 59,3 Go d’originaux. Le total comprend 1 828 groupes à attribuer.

## Matrice des 17 conditions utilisateur

| §80 | État vérifiable | Manque pour clôturer le parcours musical complet |
| --- | --- | --- |
| 1. Importer/enregistrer un morceau | PARTIAL — création de tracks, sélection du projet, import privé borné et inventaire local | Liaison explicite candidat du relevé → track ; traitement des gros masters au-delà de l’import 25 Mio |
| 2. Conserver plusieurs versions | PARTIAL — toutes les versions du relevé sont conservées et consultables | Versions métier rattachées au track, validation et changement de version de référence |
| 3. Preview réelle | PARTIAL — lecteur réel des médias privés importés | Preview à partir de la bibliothèque choisie ; erreurs de fichier déplacé/codec et gros fichiers |
| 4. Waveform/analyse | NOT_IMPLEMENTED pour le parcours demandé ; quelques en-têtes WAV seulement | Waveform persistée, analyse DSP mesurée, statut/coût/limites, aucune valeur audio inventée |
| 5. Notes/tâches | PARTIAL — idées/briefs vers tâches communes | Notes de morceau, sessions, liens stables et historique consultable depuis sa fiche |
| 6. Créer une release | PARTIAL — création persistante et projet contrôlé | Fiche release complète avec gestion de ses relations et changements d’état |
| 7. Vérifier ce qu’il manque | NOT_IMPLEMENTED comme checklist musicale | Critères de readiness à partir des métadonnées, versions, assets et validations réelles |
| 8. Associer artwork/assets | PARTIAL — média privé liant track/release | Rôles artwork/master/promo, provenance, version et demande à La Baraque suivie |
| 9. Recherche labels/clubs sourcés | NOT_IMPLEMENTED | Recherche officielle/autorisée, provenance, date et qualification sans faux contact |
| 10. Enregistrer les contacts | NOT_IMPLEMENTED en parcours Music | Réutiliser le moteur de contacts avec identité, rôle musical, source et dédoublonnage |
| 11. Pipeline CRM | NOT_IMPLEMENTED | Étapes métier, historique, tâches/relances et vue Music réellement reliée |
| 12. Préparer un mail | NOT_IMPLEMENTED en parcours Music complet | Brouillon musical lié à un contact et une release/booking |
| 13. Transmettre à Workspace | NOT_IMPLEMENTED en parcours Music complet | Handoff persistant avec référence, états et retour visible dans Music |
| 14. Valider avant envoi | PARTIAL — mécanismes d’approbation communs existants | Parcours musical de révision/approbation puis retour d’état ; aucune émission test faite |
| 15. Suivre booking/release | PARTIAL pour les releases, NOT_IMPLEMENTED pour bookings | Venue/contact/calendrier/documents/états et historique de booking |
| 16. Conserver documents | PARTIAL — stockage privé partagé | Dossier de release/booking, catégories et récupération depuis sa fiche |
| 17. Historique après redémarrage | PARTIAL — données catalogue et relevé persistants ; relevé revalidé après réouverture du runtime | Historique de l’ensemble des chaînes musicales et de leurs handoffs |

## Tranche validée : bibliothèque locale

Entrée : **Music Studio → Bibliothèque → Consulter la sélection locale**.

- Relevé réel : 2 608 fichiers, 1 970 groupes, 104 Astromer / 38 Makerz / 1 828 à attribuer.
- Candidat le plus récent, recherche, filtres, pagination et versions consultables.
- Propriétaire/workspace contrôlés côté serveur ; aucune racine absolue dans la réponse.
- Absence de relevé, corruption, changement de snapshot, état vide et réessai traités.
- Test du runtime réel sur le relevé enregistré : PASS, 13 913 octets pour la première
  page de 25 groupes ; 128 ms lors de la mesure initiale (un échantillon, pas un SLA).
- 19 tests ciblés API/inventaire/projets réussis après ajout des cas de taille,
  compteurs, candidat et chemins invalides.
- Recettes navigateur sur données synthétiques Classic et Sci-Fi, bureau et 390 px.
  Fermeture/réouverture testée ; stabilisation du composant `Row` afin de conserver
  l’identité des boutons et le focus lors des changements d’état de l’environnement.
- Les captures synthétiques ne sont pas une preuve de lecture audio des originaux.
- Zéro appel cloud/LLM, scan permanent, audio préchargé ou modification des originaux.
- Build et typecheck de tous les packages : PASS. Lint des neuf nouveaux fichiers
  vérifiés : PASS. La seconde lecture du relevé réel mesure 131 ms pour 13 913 octets.

Voir `docs/MUSIC_LIBRARY_REVIEW.md` et le checkpoint pour les dernières commandes
de validation. CPU/GPU/RAM de l’ensemble d’IDA ne sont pas requalifiés par cette
petite tranche ; le coût mesuré est celui de la lecture du relevé et de sa réponse.

## Ordre concret de continuation

1. Relier les candidats locaux aux morceaux, avec choix d’identité et de version,
   références persistantes et preview réelle sans dupliquer les masters.
2. Ajouter analyse audio/waveform locale bornée avec résultat visible dans la fiche.
3. Compléter notes, sessions et checklist de release en réutilisant tâches/documents.
4. Contacts sourcés et pipeline CRM musical, puis brouillons et handoff Workspace.
5. Booking, label et échanges La Baraque/Finance, sans copier les données financières.
6. Recettes complètes §75 et §76, avec mobile, redémarrage et erreurs.

IDA Finance est la prochaine grande étape souhaitée par Alessandro. Aucun chantier
Finance n’a été ajouté à cette tranche Music et aucun paiement n’a été activé.
