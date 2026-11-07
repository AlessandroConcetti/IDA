# IDA Content Studio — Monteur vidéo IA & carrousels
**Statut : cahier des charges, PAS une fonctionnalité déjà implémentée.** Charger seulement si la tâche concerne le montage vidéo, les sous-titres, la DA des contenus ou les carrousels.

## Référence fonctionnelle (captures du 07/11/2026)
Un outil tiers montré en vidéo dispose de quatre onglets « Veille / DA / Monteur / Carrousel », d'un lecteur Reel vertical, de réglages de typographie et couleur, d'une timeline, d'un champ de corrections écrites ou dictées, puis d'une validation humaine. Ces captures ne prouvent ni la qualité finale ni un temps de montage garanti de cinq minutes. S'inspirer **du workflow** et non copier son branding/UI à l'identique.

## Intégration dans IDA
Construire la capacité **dans IDA Content Studio**, reliée au Core, Content Library, Design System, permissions, agents existants si nécessaires et Approval Center. Ne pas lancer un outil autonome ou dupliquer une bibliothèque. L'UX doit être cohérente avec la DA IDA, sur ordinateur et mobile.

### Parcours utilisateur cible
1. **Importer** un ou plusieurs médias autorisés : métadonnées vérifiées, miniature, durée, dimensions, piste audio, propriétaire et statut.
2. **Définir un brief** : plateforme, audience, ton, objectif, durée cible, format 9:16 par défaut, langue, CTA, identité et contraintes de marque.
3. **Proposer le montage** : transcription horodatée (ou édition manuelle si module absent), sélection des extraits, suppression des silences/reprises, accroche, séquencement, sous-titres, coupes et transitions comme **propositions révisables**, jamais faits présentés comme déjà rendus.
4. **Éditer** : lecteur et timeline interactifs, lecture/pause/vitesse/seek, pistes de clips/audio/textes, crop, coupe, trim, zoom, volume, correction sous-titres, positions safe-area, annuler/rétablir. Toute commande visible agit sur des données réelles.
5. **Direction artistique** : presets enregistrés par workspace, duo de polices titre/sous-titre, couleur/accent, hiérarchie, effets, position et animation des sous-titres, logo optionnel. Prévoir une DA propre à chaque client, pas un thème IA universel.
6. **Corriger par phrase** : champ texte, dictée sur activation explicite uniquement. Transformer « coupe 00:07–00:09 », « mets les sous-titres en ivoire », etc. en **diff d'opérations structurées** avec aperçu, confirmation si destructif, historique versionné et rollback. **Modifier seulement l'élément nommé**, sans refaire tout le montage. Rendu incrémental si possible.
7. **Carrousel** : slides ordonnables, contenus éditables, visuels licenciés, même kit de marque, aperçu, exports images ou PDF réellement générés.
8. **Exporter et valider** : rendu réel, preview fidèle, contrôle du fichier, téléchargement, historique. Publication seulement via connecteur réel et approbation humaine explicite, jamais sur simple clic fictif.

### Ingénierie / coût
- FFmpeg/ffprobe pour métadonnées, clips, sous-titres, audio, exports. Modèle local de transcription si matériel adapté ; sinon adaptateur optionnel et état « à configurer ». Ne pas engager de cloud par défaut.
- Montage non destructif avec projets, sources immuables, EDL, segments, styles, versions, previews et exports persistants. Source de vérité serveur ; isolation workspace, stockage privé, contrôle des types/tailles/fichiers et audit.
- Modèle IA uniquement pour stratégie éditoriale et interprétation des instructions ; sortie JSON/opérations validées côté serveur, permissions et séquences bornées. Les opérations médias sont exécutées par code déterministe. Pas d'agents superflus.
- Jobs asynchrones : QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED, progression réellement mesurée, annulation, retries contrôlés, limite CPU/GPU/RAM, nettoyage temporaire, message d'erreur actionnable, interruption lorsque module inactif.
- Proxies de prévisualisation, export final en qualité propre à la plateforme, gestion des ratios, texte et audio synchronisés. Aucun média appartenant à un tiers n'est réutilisé sans droits.

### Phasage autorisé seulement par la demande
- **M0 — Audit ciblé** : chercher code/media API/UI/DA/approbations existants. Lister la réutilisation réelle et le manque, sans réécrire l'ensemble.
- **M1 — Première fonction réelle** : importer vidéo autorisée → projet éditable → couper → prévisualiser → exporter → enregistrer/rouvrir, avec UI IDA et erreurs traitées.
- **M2 — DA et sous-titres** : transcription réelle ou mode manuel, timecodes/styles persistés et rendu correspondant.
- **M3 — Édition conversationnelle** : instruction structurée, diff, application ciblée, undo/redo, dictée explicite.
- **M4 — Carrousels + performance** : édition et export réels, réutilisation de presets, optimisation.
Cette roadmap n'autorise pas à démarrer la phase suivante si l'utilisateur n'a demandé qu'une phase.

### Réception : impossible de dire « terminé » sans preuve
Tester une vidéo autorisée, une coupe réelle et son export ; refermer/rouvrir et retrouver projet et paramètres ; modifier **une** couleur/portion en démontrant que le reste est identique ; comparer preview et export sous-titres ; tester entrée invalide, permission, annulation et fichier manquant ; inspecter sur mobile et desktop. Corriger les défauts visibles **avant la première présentation**. Pas de fausse interface, de valeur inventée ni de promesse « un reel monté en 5 min ».

**Respecter `AGENTS.md`, `docs/IDA_FIRST_PASS_VISUAL_STANDARD.md` et `docs/IDA_PERMANENT_BUILD_CONTRACT.md`.** Ne lire ce document que dans un chantier vidéo/carrousel. Résultat final de Codex concis, factuel et prouvé.
