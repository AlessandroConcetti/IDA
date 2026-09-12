# Care — interface du laboratoire, 12 septembre 2026

## Présentation et références

La carte IDA Care ouvre `CareEnvironment`, chargé à la demande, dans le même Core. Les références utilisateur Care mobile, Sci-fi et Classic guident la composition : atrium, laboratoire central, pôles clinique/recherche, rubriques, cartes de suivi et dock vocal. Les contrôles sont du HTML, jamais des boutons peints sur une capture.

Le décor propre, sans interface ni données médicales intégrées, est local : `apps/web/public/design/user-20260909/care-laboratory-v1.png` (1672 × 941). Il a été généré avec imagegen à partir des références et reste hors Git comme les autres médias. Conserver ce fichier avec l'installation. Classic utilise une palette chaude ; Sci-fi un contraste sombre. La reproduction exacte des maquettes n'est pas qualifiée.

## Actions disponibles

- Recherche de rubriques sans accents, navigation clavier et six rubriques réelles.
- Entrer dans le laboratoire : rejoint les panneaux des équipes et y place le focus.
- Mon dossier : ouvre le `CareProfile` existant, facultatif et éphémère. Aucun enregistrement ou envoi de données de santé.
- Recherche : rejoint l'environnement Research, sa bibliothèque et ses outils existants.
- Équipes, pathologies, analyses, traitements et suivi : panneaux explicites sur ce qui reste à préparer, sans diagnostic ou service clinique simulé.
- Tâches générales : navigation vers le Core existant, sans transfert implicite du profil.
- Orbe : dialogue général partagé ; aucun micro activé à l'ouverture, aucune donnée corporelle transmise. La voix exige son propre clic explicite.
- Paramètres : thème et réduction des animations, sans modification des permissions.

Les noms de maladies et indicateurs des images utilisateur ne sont pas importés comme dossier personnel. Aucun « suivi actif », pourcentage de progrès, publication récente ou équipe en analyse n'est fabriqué.

## Vérification et limites

Rendu serveur Classic/Sci-fi sans réseau, vidéo, caméra ou navigation implicites couvert par les tests. Types, lint et build passent. Vérification dans le navigateur : mode mobile à 480 px CSS sans débordement de Care, rail masqué, deux pôles présents, rubrique Pathologies ouvrable et refermable. Mouvement réduit système, pause client, transparence réduite et couleurs forcées prévus. Recette sur iPhone physique non effectuée.

Restent des fonctionnalités métier distinctes : dossier privé consenti et révocable, pièces médicales protégées, consentements, journal/suivi, recherche clinique sourcée, agents déclarés/évalués et supervision humaine. Aucun de ces services n'est activé par le thème ou le décor.
