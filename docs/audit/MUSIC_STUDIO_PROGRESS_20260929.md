# Music Studio — avancement face au prompt complet

Relevé du 29 septembre, actualisé le 30 septembre 2026. Référence : `docs/MUSIC_STUDIO_PRODUCT_BRIEF_20260928.md`
(86 sections), notamment sa Definition of Done §80 et ses recettes §75–76.

## Bilan honnête

**50 % du Music OS demandé.** Estimation de périmètre fonctionnel, pas
pourcentage de couverture de tests, de fidélité artistique ou de fonctionnalités
entièrement closes. Le catalogue et les premiers parcours fichiers/releases
existent ; le carnet de contacts, les étapes manuelles et les brouillons partagés
Music → Workspace → Mail et les relances datées partagées sont vérifiés.
Les chaînes CRM complètes, booking,
recherche sourcée et expédition de messages
restent majoritairement à construire. Une infrastructure commune disponible
ailleurs dans IDA ne vaut pas un parcours musical livré.

Le pourcentage est désormais calculé avec une grille stable sur les 17 critères
de la Definition of Done : 0 = absent, 25 = amorce, 50 = parcours partiel
prouvé, 75 = parcours vérifié mais incomplet, 100 = parcours complet avec
persistance, reprise et erreurs. Le dernier état validé est **850 / 1 700,
soit 50 %**. L’ancien 23 % était une estimation antérieure,
pas un nouveau relevé ; il n’est plus utilisé pour comparer les sessions.

La tranche du jour rend le relevé consultable depuis Music et relie un fichier
local explicitement choisi à un track existant, avec préécoute réelle bornée.
Elle ne transforme pas les 1 970 groupes trouvés en discographie approuvée et
n’importe pas les 59,3 Go d’originaux. Le total comprend 1 828 groupes à attribuer.

## Matrice des 17 conditions utilisateur

| §80 | État vérifiable | Manque pour clôturer le parcours musical complet |
| --- | --- | --- |
| 1. Importer/enregistrer un morceau | PARTIAL — création de tracks, sélection du projet, import privé borné, inventaire local et rattachement explicite d’une référence locale vérifiée au track | Liaison et import unifiés de tous les assets ; validation du parcours sur un original choisi et limites pour les gros masters |
| 2. Conserver plusieurs versions | PARTIAL — références locales, SHA-256, rôles REVIEW/CURRENT/MASTER/ARCHIVED avec validation explicite, historique et remplacement atomique vérifiés | Étendre aux autres assets/imports et rôles draft/mix/stems sans perdre la traçabilité |
| 3. Preview réelle | PARTIAL — préécoute authentifiée et éphémère de l’original local, sans copie, plafonnée à 1 Gio et testée sur WAV synthétique | Recette sur un original choisi, matrice codecs/navigateurs et parcours des masters dépassant la limite locale |
| 4. Waveform/analyse | PARTIAL — analyse WAV locale mesurée, waveform 256 segments, crête et RMS persistés et visibles ; BPM, tonalité, loudness LUFS et autres formats restent absents | Ajouter les mesures audio restantes seulement si elles sont nécessaires, avec la même preuve locale et des limites explicites |
| 5. Notes/tâches | PARTIAL — demandes de préparation liées au morceau, tâche partagée avec échéance, notes/plans/revues consultables dans les trois mondes et fin explicite depuis Workspace | Carnet de sessions de morceau et parcours de tâches musicales au-delà de la préparation promotionnelle |
| 6. Créer une release | PARTIAL — création, fiche éditable, relations morceaux, médias directs, historique et statuts déclaratifs ; persistance/retry/conflits et UI vérifiés | Tracklist ordonnée, rôles/versionnement des assets, pipeline de readiness, contacts/distribution et approbation finale |
| 7. Vérifier ce qu’il manque | PARTIAL — checklist de morceau calculée depuis métadonnées, master/analyse du propriétaire, image Artwork et tâches partagées ; accès aux parcours réels, persistance et erreurs vérifiés | Édition des métadonnées depuis la checklist, validation artistique, crédits/droits, distribution, approbation finale et bilan complet de release |
| 8. Associer artwork/assets | PARTIAL — média privé liant track/release ; demande partagée et retour d’image importée avec hash/date, aperçu contrôlé, reprise sans doublon, persistance et UI dans les trois mondes | Versionnement/retrait du rattachement, rôles artwork/master/promo, validation artistique et autres types de médias |
| 9. Recherche labels/clubs sourcés | NOT_IMPLEMENTED comme moteur intégré ; cinq suggestions éditoriales officielles datées consultables et préremplissables | Recherche officielle/autorisée actualisée, provenance, date et qualification sans faux contact |
| 10. Enregistrer les contacts | PARTIAL — identité/provenance partagée, relation par projet, coordonnées facultatives, dédoublonnage, édition et persistance vérifiés dans Music | Annuaire général Workspace, rôles multiples, historique consultable et purge/rétention pilotée |
| 11. Pipeline CRM | PARTIAL — étapes déclaratives, prochaine action, tâches datées partagées avec Workspace, fin explicite et dates de création/achèvement visibles dans Music | Historique complet de suivi, report/notification de relance et pipeline d’opportunités ; aucun état d’envoi réel encore |
| 12. Préparer un mail | PARTIAL — brouillon local persistant contact/projet/morceau, trois intentions, texte modifiable, destinataire/lien explicites, sans fait inventé ni envoi | Pièces jointes, liaison directe release/booking, préparation contextuelle avancée et approbation finale |
| 13. Transmettre à Workspace | PARTIAL — même brouillon consultable/éditable depuis Music, Workspace et Mail ; IDs, révisions, reprise/erreurs vérifiés | Validation et retour d’envoi externe ; aucune synchronisation Gmail ni émission livrée |
| 14. Valider avant envoi | PARTIAL — mécanismes d’approbation communs existants | Parcours musical de révision/approbation puis retour d’état ; aucune émission test faite |
| 15. Suivre booking/release | PARTIAL pour les releases, NOT_IMPLEMENTED pour bookings | Venue/contact/calendrier/documents/états et historique de booking |
| 16. Conserver documents | PARTIAL — stockage privé partagé | Dossier de release/booking, catégories et récupération depuis sa fiche |
| 17. Historique après redémarrage | PARTIAL — données catalogue et relevé persistants ; relevé revalidé après réouverture du runtime | Historique de l’ensemble des chaînes musicales et de leurs handoffs |

### Calcul de l’avancement

| Critère | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Score | 75 | 75 | 75 | 50 | 50 | 75 | 50 | 75 | 0 | 50 | 50 | 50 | 50 | 25 | 25 | 25 | 50 |

### Deltas vérifiés, sans changement de grille

- Après analyse WAV : 475/1 700 → 28 %.
- Après rôles/historique des versions locales : critère 2 de 50 à 75,
  soit 500/1 700 → 29 %.
- Après dossier Music → La Baraque → Workspace : critères 5 et 8 de 25 à 50,
  soit 550/1 700 → 32 %. Le critère 13 reste à 0 : pas encore de mail transmis.
- Après retour d’image privée vérifiée dans le dossier (B.6, 30 septembre) :
  critère 8 de 50 à 75, soit 575/1 700 → 34 %. Preuves : 7 nouveaux tests API,
  2 parcours navigateur étendus Classic/Sci-Fi, reprise réseau, aperçu en erreur
  puis disponible, conservation après redémarrage API. Ni rôle master artwork,
  ni génération, ni publication ne sont comptés.
- La tranche ne vaut pas une chaîne complète de promotion ou de démarchage.
- Après checklist réelle de préparation (B.7, 30 septembre) : critère 7 de 0 à
  50, soit 625/1 700 → 37 %. Six nouveaux tests API, scénario de versions étendu,
  93 tests ciblés et huit recettes navigateur PASS, dont deux nouvelles recettes
  de checklist Classic/Sci-Fi (master, analyse, création de demande, relecture,
  erreur/réessai, mobile). Aucun gain pour droits/distribution non implémentés.
  Détail : `docs/MUSIC_READINESS.md` ; checkpoint B.7 dédié.
- Après fiche release réelle (B.8, 30 septembre) : critère 6 de 50 à 75,
  soit 650/1 700 → 38 %. Huit nouveaux tests API et deux de transport ;
  178 tests ciblés et 10 recettes navigateur PASS (Classic/Sci-Fi, 390 px,
  perte de réponse après écriture, retry, conflit, association, checklist,
  médias, historique, erreur et réouverture). Redémarrage API/base vérifié.
  Aucun gain pour CRM, pipeline complet, crédits ou distribution encore absents.
  Détail : `docs/MUSIC_RELEASES.md` ; checkpoint B.8 dédié.

- Après contacts et suivi manuel (B.9, 30 septembre) : critères 10 de 0 à 50
  et 11 de 0 à 25, soit 725/1700 → 43 %. Huit tests API nouveaux et un test
  des cinq pistes éditoriales ; 187 tests ciblés et 12 recettes navigateur PASS,
  dont deux nouvelles Classic/Sci-Fi. Création, réponse perdue/retry sans doublon,
  révisions/conflit, filtres, panne/réessai, mobile et réouverture prouvés ; vraie
  fermeture/réouverture API/base testée. Les cinq sources ne valent pas un moteur
  de recherche ; aucune hausse des critères 9, 12 ou 13. Détails :
  `docs/MUSIC_CONTACTS.md` et checkpoint B.9. Le runtime personnel n’est pas
  redémarré par ces recettes isolées.

- Après brouillons partagés (B.10, 30 septembre) : critères 12 et 13 de 0 à
  50, soit 825/1700 → 49 %. Dix tests API et deux tests UI/passage de contexte
  nouveaux ; **199 tests ciblés / 22 fichiers et 14 recettes navigateur PASS**.
  Parcours Music → Workspace → Mail → Music avec un seul ID, édition/conflit,
  réponse perdue/retry, panne/réessai, onglet masqué sans perte du texte,
  réouverture et 390 px Classic/Sci-Fi. Redémarrage réel API/base, isolation,
  permissions, révocation/rollback, Unicode et pagination prouvés. Critère 14
  inchangé : aucune approbation finale, synchronisation Gmail ou émission.
  Détails : `docs/WORKSPACE_MAIL_DRAFTS.md` et checkpoint B.10. Vérifié sur un
  lancement isolé du build actuel ; runtime personnel non redémarré.

- Après relances datées (B.11, 30 septembre) : seul critère 11 de 25 à 50,
  soit 850/1700 → **50 %**. Onze tests API et quatre tests UI/navigation/date
  nouveaux ; **214 tests ciblés / 24 fichiers et 16 recettes navigateur PASS**,
  plus trois tests préexistants du Task Center. Un seul ID de tâche Music →
  Workspace → Tâches → Music, clôture partagée, échéance/fuseau, retard, filtres,
  erreur/retry, réponse perdue sans doublon, mobile et réouverture vérifiés.
  Redémarrage réel API/base, permissions cumulées, isolation et révocation finale
  avec rollback de création/achèvement prouvés. Les longues prochaines actions
  restent intégrales dans les détails ; le titre est borné à 240 caractères.
  Ni notification, envoi, report, historique CRM complet ni booking comptés.
  Voir `docs/MUSIC_FOLLOWUPS.md` et checkpoint B.11. Runtime personnel inchangé.

À chaque reprise : lire ce calcul, annoncer périmètre et preuve attendue sauf
demande contraire, puis écrire le delta après vérification. Aucun gain pour du
code seul. Voir `docs/MUSIC_CONTENT_HANDOFF.md` pour le parcours et ses limites.

Ce calcul explique pourquoi une tranche complète peut faire avancer le total de
quelques points : le prompt couvre beaucoup de domaines encore absents (CRM,
labels, bookings, handoff, outreach et documents), alors que la tranche traite
une seule capacité avec une preuve de bout en bout.

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

## Tranche B.3 : analyse WAV locale et waveform

Entrée : une version WAV déjà rattachée dans **Music Studio → Bibliothèque →
Consulter mes versions rattachées**. Le bouton **Analyser ce WAV** vérifie à
nouveau l’original sous la racine configurée, lit par blocs bornés et enregistre
une analyse déterministe. **Consulter l’analyse enregistrée** reste disponible
après fermeture ou lorsque le disque n’est plus accessible ; cette lecture
historique indique explicitement que l’original n’a pas été revérifié.

- Formats analysés : WAV RIFF standard PCM 8/16/24/32 bits et float 32/64 bits,
  1 à 8 canaux, 8–192 kHz, 1 heure et 256 Mio maximum.
- Résultat réel : durée, fréquence, canaux, crête d’échantillon en dBFS, RMS en
  dBFS et waveform de 256 segments min/max. Le résultat est présenté comme une
  analyse, pas comme une mesure LUFS ou un master approuvé.
- Le fichier reste local, n’est ni copié ni envoyé à un modèle. Toute modification
  pendant la lecture, annulation, dépassement de temps, erreur de format ou
  révocation de session produit un état d’erreur explicite.
- Smoke test IDA sur un WAV réel de `F:\MUSIQUES 2K26` : PASS via `createApp` et
  les routes IDA, 54 754 640 octets, 44,1 kHz, 2 canaux, 310,4 s, crête −0,30
  dBFS, RMS −6,05 dBFS, 256 segments, relecture persistée PASS. La base de test
  était en mémoire et le fichier personnel n’a pas été modifié.
- Tests API ciblés : 43 PASS sur cinq fichiers Music, dont 22 tests du décodeur
  WAV (formats, signal stéréo en opposition, silence, chunks, corruption,
  annulation, dépassement et revalidation) et les parcours de liaison,
  persistance, reprise hors disque et contrôle de scope.
- Playwright : 4 PASS Classic/Sci-Fi, analyse visible, waveform, préécoute réelle
  synthétique, fermeture/réouverture, consultation historique, réutilisation,
  erreur de fichier et responsive 390 px.
- Typecheck et builds Contracts/Domain/API/Web : PASS ; Biome des fichiers de la
  tranche : PASS. Le warning de taille du bundle Web reste présent (~972 Ko).

Voir `docs/MUSIC_LIBRARY_REVIEW.md` et le checkpoint pour les dernières commandes
de validation. CPU/GPU/RAM de l’ensemble d’IDA ne sont pas requalifiés par cette
petite tranche ; le coût mesuré est celui de la lecture du relevé et de sa réponse.

## Tranche B.2 : rattachement et préécoute locale

Entrée : Music Studio → Bibliothèque → bibliothèque locale → **Rattacher / préécouter**.

- Choix explicite d’un track déjà présent ; aucun rapprochement automatique à partir du nom du fichier.
- Le serveur revalide le snapshot, le propriétaire/workspace, le chemin sous la racine configurée, les métadonnées et le SHA-256 avant d’écrire la référence.
- Les versions enregistrées sont persistantes, liées au track, dédoublonnées par contrainte DB et journalisées sans chemin absolu ni contenu audio.
- La préécoute ouvre l’original en lecture seule par plages, après vérification d’empreinte ; accès temporaire lié à la session et au workspace, révocable, `no-store`, sans duplication ni transfert à un fournisseur.
- Limites vérifiées dans le code : 1 Gio par fichier, hachage par blocs de 128 Kio, plafond de 60 s par vérification et accès de préécoute de 120 s.
- Tests API : 2 tests PASS (persistance après recréation du runtime, répétition idempotente, plages HTTP, arrêt/expiration du ticket, isolation d’identité, Gateway, entrées invalides et fichier changé/déplacé). Le refus de liens symboliques existe dans le lecteur ; cette recette ne crée pas de symlink Windows réel.
- Non-régression API Music : 5 fichiers, 33 tests PASS — inventaire, bibliothèque, choix du projet, références locales et médias liés.
- Playwright : 4 tests PASS Classic/Sci-Fi, relevé et lien/préécoute, lecture effective d’un WAV synthétique de 4 s, arrêt, réouverture persistante, erreur de fichier et responsive 390 px. Aucune chanson personnelle n’a été lue pendant cette recette.
- Typecheck Contracts/Domain/API/Web : PASS ; builds Contracts/Domain/API/Web : PASS ; Biome sur les 9 fichiers de cette tranche : PASS.
- La taille du bundle principal Web reste élevée (environ 968 Ko minifiés) : avertissement du build, sans régression fonctionnelle constatée.

Cette tranche rend les références de versions persistantes et la préécoute
opérationnelles, mais elle ne gère pas encore l’approbation de master, l’analyse
audio, la waveform, les stems ni les releases de bout en bout.

## Ordre concret de continuation

1. Priorité utilisateur du 30 septembre : contacts labels/lieux (B.9), brouillons partagés Workspace/Mail (B.10) et tâches de relance datées (B.11) vérifiés. Prochaine tranche : historique de suivi du contact consultable, puis revue/approbation du message exact avant toute tranche d'envoi externe. Deux projets, Marseille/alentours prioritaires, puis Avignon/Montpellier/Lyon ; prestations privées comprises. Objectif concret : candidatures et dates, sans promesse de résultat ni envoi automatique.
2. Construire la checklist agrégée de release et compléter rôles/versionnement des assets ; les checklists morceau (B.7) et la fiche release (B.8) sont vérifiées.
3. Compléter le carnet de sessions et les autres rôles de fichiers (draft/mix/stems).
4. Booking, label et échanges Finance, sans copier les données financières.
5. Recettes complètes §75 et §76, avec mobile, redémarrage et erreurs.

IDA Finance est la prochaine grande étape souhaitée par Alessandro. Aucun chantier
Finance n’a été ajouté à cette tranche Music et aucun paiement n’a été activé.

Vérification d’architecture B.9 : contrairement à l’hypothèse de l’ancien audit,
l’annuaire Contacts partagé et les brouillons Mail n’étaient pas implémentés
dans le runtime inspecté. B.9 ajoute l’identité partagée et le parcours Music,
pas encore la surface Contacts générale de Workspace. Le moteur Tasks existe ;
il ne vaut pas moteur d’envoi. Construire le brouillon partagé nécessaire sans
second moteur mail, puis relier les dossiers Music. Ne pas considérer une tâche
comme un mail. B.10 a désormais livré ce brouillon partagé ; la surface Contacts
générale, l'approbation et l'envoi restent ouverts.
