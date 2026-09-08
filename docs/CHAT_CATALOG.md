# IDA — Chat local utile sur le catalogue

8 septembre 2026. Première tranche visible de la priorité conversationnelle : le chat existant retrouve les données autorisées et présente des réponses françaises détaillées. **Pas d'activation LLM**, ni de conversation générale ou de mémoire de relance implicite. Aucun nouveau Core, agent, fournisseur, endpoint, schéma SQL ou paquet.

## Parcours utilisable

Dans IDA → Conversation, sélectionner un exemple remplit le champ et lui donne le focus, sans envoi. Adapter la demande puis cliquer sur **Demander à IDA**.

| Demande | Comportement réel |
| --- | --- |
| `Liste mes morceaux` | Au plus cinq morceaux non archivés, tri par titre/id ; titre, artiste, BPM/tonalité si renseignés, statut français. |
| `Trouve le morceau « Demain »` | Recherche littérale du titre, pas agenda ; cinq résultats maximum par défaut. `Trouve un morceau « Demain »` limite explicitement à un. |
| `Peux-tu trouver les morceaux nommés « Aurore » ?` | Recherche par titre, cinq résultats maximum. Les accents de la valeur sont conservés ; pas de recherche phonétique ou sémantique. |
| `Montre-moi cinq vidéos inutilisées` | Bibliothèque filtrée VIDEO + UNUSED, plus récentes en premier. UNUSED n'est pas une preuve de disponibilité éditoriale. |
| `Cherche trois médias contenant « studio »` | Nom de fichier, description ou tags ; tous types/statuts, archives incluses si aucun statut demandé. |
| `IDA, montre-moi mes contenus inutilisés.` | Compatibilité historique : rotation éditoriale, UNUSED **sans aucun lien de proposition**, au plus douze. |
| `Qu’est-ce que j’ai aujourd’hui ?` / `Prépare demain` | Titres et heures dans le fuseau du workspace, dix éléments datés maximum. Exclut tâches sans échéance et calendriers externes. Les programmations restent qualifiées d'internes/non publiées. |

La recherche musicale accepte 1–10 résultats, un titre de 120 caractères maximum ; la recherche média un texte de 160 caractères, au plus un type et un statut. Les titres ambigus doivent être cités, particulièrement après un nom au pluriel. Préfixe IDA, formulations impératives ou `peux-tu / pourrais-tu`, accents et ponctuation courante sont pris en charge dans cette grammaire bornée.

Filtres non implémentés (meilleures vidéos, BPM, dates, exclusions…), quantités ambiguës ou actions combinées : `CLARIFY_CATALOG`, sans lecture du catalogue. `Jamais publié` n'est pas traduit en UNUSED. Une entrée hors grammaire retourne HELP. `Et le deuxième ?` n'est pas résolu à partir de l'historique. Les citations et mentions de demain dans un texte quelconque ne déclenchent plus l'ancien classement par sous-chaîne.

## Contrat HTTP et réutilisation

Route inchangée : `POST /v1/ida/commands`, corps `{ "message": "Liste mes morceaux" }`. Scope, permission et outil sont calculés au serveur ; les prétentions d'identité ou d'intention du corps ne les remplacent pas.

Champs existants `data.command`, `commandRunId`, `state`, `kind`, `message`, `tools`, `result` conservés. Nouveaux `kind` : SEARCH_TRACK, SEARCH_MEDIA, CLARIFY_CATALOG ; intentions déjà disponibles dans les contrats. La clarification est une réponse READ terminée, pas une action en attente d'approbation.

- SEARCH_TRACK : `result.tracks` reprend `MusicTrackFact` (id, title, artistCredit, genre, bpm, musicalKey, status, updatedAt) du store SQL existant ; `result.catalogQuery` explique la sélection déterministe (`kind`, `title?`, `limit`). Le store n'est pas une autorisation : Identity et Tool Gateway READ `MUSIC/list_tracks` l'encadrent.
- SEARCH_MEDIA : `result.media` ne contient que id, filename, mediaType, status ; `catalogQuery` contient kind, q?, mediaType?, status?, limit. Réutilise `DemoDatabase.listMedia` et `mediaListQuerySchema`, avec `CONTENT/search_media` READ. Pas de hash, chemin, URL, MIME, description ou contenu brut projeté au chat.
- CLARIFY_CATALOG : `result: {}`, outil READ `IDA/describe_supported_commands`. Aucun filtre implicite ni appel modèle pour deviner.
- TODAY/TOMORROW/UNUSED_CONTENT : résultats structurés existants inchangés ; `message` contient maintenant les libellés utiles, et plus seulement leur nombre.

`apps/web/src/api.ts` continue de lire le même `message`. `ConversationText` rend du texte React échappé avec retours à la ligne, jamais HTML ou Markdown actif. Aucune donnée métier n'est dupliquée dans le client.

## Ouverture des résultats — 9 septembre 2026

Après une nouvelle recherche SEARCH_TRACK/SEARCH_MEDIA réussie, des boutons **Ouvrir** accompagnent les résultats. Le client projette seulement type, ID exact et libellé depuis les objets structurés ; il ne déduit aucun lien du texte, du Markdown ou de l'historique. Au plus dix cibles, identifiants `trk_…`/`med_…` de 80 caractères maximum, casse conservée, doublons éliminés et libellés échappés.

Le clic navigue vers le module Musique ou Contenus existant. Une fiche relue par ID réutilise `TrackPanel` ou `MediaGrid`, avec retour à la conversation, accès au catalogue complet et actualisation. La sélection ne modifie pas la bibliothèque, ne marque pas un média utilisé et ne lance ni génération, ni publication. Les lecteurs privés existants ne sont affichés qu'après lecture autorisée de la fiche ; audio/vidéo sans autoplay. Un média seed sans fichier garde un aperçu indisponible, pas une vidéo inventée.

Deux lectures ciblées complètent l'API existante :

- `GET /v1/tracks/{trackId}` → `{ data: Track }`, outil `MUSIC/get_track` READ.
- `GET /v1/media/{mediaId}` → `{ data: MediaAsset }`, outil `CONTENT/get_media` READ.

Les deux réutilisent les projections et SQL existants, avec filtre lié **ID + workspace**, sans chercher dans les premières pages. Codes 400 `INVALID_TRACK_DETAIL_PARAMS` / `INVALID_MEDIA_DETAIL_PARAMS`, 404 `TRACK_NOT_FOUND` / `MEDIA_NOT_FOUND` identiques pour ressource étrangère ou inexistante ; refus Identity 401/403, `Cache-Control: no-store`. Les IDs acceptent lettres, chiffres, `_` et `-` après le préfixe, sans espaces ni chemin. La projection média complète conserve le hash déjà exposé par la liste, jamais la clé/URL/chemin de stockage. Aucun nouveau schéma SQL, dépendance ou agent.

La permission READ et le Tool Gateway sont vérifiés avant lecture ; identité et droits sont relus avant retour, y compris session locale et échéance d'inactivité en LOCAL_LOCK. Comme le chat, ce sont des contrôles de frontière, pas une garantie atomique contre une révocation après le dernier contrôle. `requestApi` et `SnapshotReader` existants rejettent les réponses d'une identité invalidée et ignorent celles d'une sélection démontée. Une erreur ne réaffiche jamais les vieux faits du chat comme fiche actuelle.

Les cibles restent **éphémères dans l'état React** : navigation aller-retour sans perte, mais rechargement/verrouillage les efface. L'historique textuel reste inchangé et privé ; pour obtenir des boutons après rechargement, relancer la recherche. Il n'existe pas encore de relance implicite « et le deuxième ? », d'édition depuis la fiche ni de lien partageable. Le mode de démonstration local n'est pas une authentification de production ou un accès iPhone distant.

## Sécurité, historique et limites

Les paramètres SQL sont liés, `%`, `_` et antislash recherchés littéralement. Identité/session/workspace/client sont contrôlés avant les nouvelles recherches puis relus avant historique et avant livraison de toute réponse. Le contexte initial ne peut pas gagner de droits ni prolonger son échéance d'inactivité pendant une requête ; un grant réduit à VIEW_ONLY conserve READ mais supprime l'écriture d'historique. Ces points de contrôle ne constituent pas une transaction atomique identité/données/historique/réponse réseau : aucune garantie de révocation rétroactive après livraison.

L'historique existant reste privé utilisateur/workspace, accessible par `/v1/ida/command-runs`. La réponse lisible inclut désormais des **extraits de métadonnées du catalogue/agenda**. Les objets structurés, chemins, secrets, traces IA et paramètres de provider ne sont pas stockés ; ni préférences ni mémoires permanentes ne sont créées. Les anciennes réponses historiques ne sont pas réécrites. Un libellé supprimé/renommé ultérieurement peut donc rester dans cette réponse historique ; rétention/export/effacement de production restent à traiter avant données sensibles.

Libellés bornés, caractères de contrôle neutralisés dans le message ; réponses inférieures à 4 000 caractères, compatibles avec le contrat existant. Un label hostile reste une donnée citée, jamais une instruction. Un code de statut de média vient de la base et ne certifie pas une publication externe vérifiée par IDA.

Pas de caméra, microphone, accès Home Assistant, cloud, téléchargement ou inférence. Les profils et agents restent PLANNED ; la non-qualification du modèle local est conservée. Dates de releases et domotique restent en pause.

## Vérification

Tests de grammaire, SQL réel synthétique, isolation workspace, alias de titre Demain, filtres médias et jokers littéraux, absence de résultats, clarification, refus Gateway/session, révocation pendant lecture, VIEW_ONLY, absence d'appel LLM/réseau, historique sans mémoire et limites de format. Parcours HTTP : création d'un morceau fictif → demande naturelle → réponse → historique. Tests frontend : exemples sans envoi au rendu, états désactivés, texte hostile échappé et lignes conservées.

Suite complète : **1 019 tests / 47 fichiers**, dont 157 nouveaux. Lint, types et builds vérifiés ; la recette visuelle et l'activation de l'aperçu sont consignées dans le relais de consolidation. Ce compte mesure les tests logiciels, pas la qualité d'un modèle ni l'aptitude à la production.

Après ouverture des fiches : **1 066 tests / 49 fichiers**, dont 47 nouveaux (25 backend, 22 frontend). Vérifiés : vrais IDs seed/import, média hors des 50 premiers résultats, homonymes/ID exact, paramètres hostiles, refus Gateway, session expirée/révoquée, grant VIEW_ONLY sans WRITE, révocation pendant lecture, verrou local réel, absence d'effet métier/réseau, invalidation des réponses tardives et rendu sans HTML ni envoi implicite. Lint global, types des quatre packages et builds réussis. Recette navigateur local : recherche musicale → Lumière Noire → retour chat → recherche vidéo → night-drive-preview.mp4. Les médias seed n'ont pas de fichier privé ; aperçu correctement indisponible. Aucun test physique iPhone ni validation de production revendiqué.

Suite recommandée : actions explicites depuis une sélection (par exemple consulter ses médias liés), puis génération de propositions par un fournisseur qualifié. Ne pas demander au modèle de trier un catalogue que SQL sait déjà sélectionner ; ajouter l'IA seulement sur une tâche où son apport et ses limites sont évaluables.
