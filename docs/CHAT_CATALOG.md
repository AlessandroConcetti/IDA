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

`apps/web/src/api.ts` continue de lire le même `message`. `ConversationText` rend du texte React échappé avec retours à la ligne, jamais HTML ou Markdown actif. Aucune route ou donnée métier n'est dupliquée dans le client.

## Sécurité, historique et limites

Les paramètres SQL sont liés, `%`, `_` et antislash recherchés littéralement. Identité/session/workspace/client sont contrôlés avant les nouvelles recherches puis relus avant historique et avant livraison de toute réponse. Le contexte initial ne peut pas gagner de droits ni prolonger son échéance d'inactivité pendant une requête ; un grant réduit à VIEW_ONLY conserve READ mais supprime l'écriture d'historique. Ces points de contrôle ne constituent pas une transaction atomique identité/données/historique/réponse réseau : aucune garantie de révocation rétroactive après livraison.

L'historique existant reste privé utilisateur/workspace, accessible par `/v1/ida/command-runs`. La réponse lisible inclut désormais des **extraits de métadonnées du catalogue/agenda**. Les objets structurés, chemins, secrets, traces IA et paramètres de provider ne sont pas stockés ; ni préférences ni mémoires permanentes ne sont créées. Les anciennes réponses historiques ne sont pas réécrites. Un libellé supprimé/renommé ultérieurement peut donc rester dans cette réponse historique ; rétention/export/effacement de production restent à traiter avant données sensibles.

Libellés bornés, caractères de contrôle neutralisés dans le message ; réponses inférieures à 4 000 caractères, compatibles avec le contrat existant. Un label hostile reste une donnée citée, jamais une instruction. Un code de statut de média vient de la base et ne certifie pas une publication externe vérifiée par IDA.

Pas de caméra, microphone, accès Home Assistant, cloud, téléchargement ou inférence. Les profils et agents restent PLANNED ; la non-qualification du modèle local est conservée. Dates de releases et domotique restent en pause.

## Vérification

Tests de grammaire, SQL réel synthétique, isolation workspace, alias de titre Demain, filtres médias et jokers littéraux, absence de résultats, clarification, refus Gateway/session, révocation pendant lecture, VIEW_ONLY, absence d'appel LLM/réseau, historique sans mémoire et limites de format. Parcours HTTP : création d'un morceau fictif → demande naturelle → réponse → historique. Tests frontend : exemples sans envoi au rendu, états désactivés, texte hostile échappé et lignes conservées.

Suite complète : **1 019 tests / 47 fichiers**, dont 157 nouveaux. Lint, types et builds vérifiés ; la recette visuelle et l'activation de l'aperçu sont consignées dans le relais de consolidation. Ce compte mesure les tests logiciels, pas la qualité d'un modèle ni l'aptitude à la production.

Suite recommandée : navigation vers les fiches et relances structurées sur sélection explicitement autorisée, puis génération de propositions par un fournisseur qualifié. Ne pas demander au modèle de trier un catalogue que SQL sait déjà sélectionner ; ajouter l'IA seulement sur une tâche où son apport et ses limites sont évaluables.
