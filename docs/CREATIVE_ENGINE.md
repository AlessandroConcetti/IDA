# La Fabrique — dossier Creative Engine

## Livraison du 13 septembre 2026

Accès : **La Fabrique → Creative Engine**. L'espace réutilise les dossiers créés par le formulaire « Nouveau projet » de La Fabrique. Il ne crée aucun exemple automatiquement.

Le parcours utilisable est manuel : choisir ou créer un brief, consigner une référence, préparer un plan et ses critères de réussite, consigner une revue, exporter le dossier. Les écritures sont persistées dans l'API partagée, pas dans le stockage du navigateur.

| Rubrique | État | Fonction réelle / limite |
| --- | --- | --- |
| Projets | REAL | Dossiers de conception issus des tâches `Fabrique · …`, création par le formulaire existant. Pas un dépôt logiciel isolé. |
| Références | REAL | Titre, URL HTTPS facultative et observations. URL enregistrée comme texte, jamais téléchargée. |
| Plans | REAL | Versions documentaires : titre, étapes, critères. Aucun lancement automatique. |
| Agents | PLANNED | Rôles proposés, pas d'agents enregistrés ou exécutés. |
| Workflows | PREPARED | Navigation manuelle Documenter → Planifier → Relire → Exporter. Pas d'orchestrateur. |
| Providers | BLOCKED | sd.cpp / Wan2GP candidats NEEDS REVIEW. MuAPI exclu, aucun fallback. |
| Jobs | BLOCKED | Aucun runner, aucune file d'exécution ni faux job. |
| Artefacts | PREPARED | Export JSON/Markdown des données du dossier. Pas de média ou logiciel généré. |
| Mémoire de travail | REAL | Notes explicitement saisies, limitées au dossier et au workspace. Pas de mémoire personnelle apprise. |
| Gouvernance / validation | REAL | Revue documentaire liée à un plan : REVIEWED ou CHANGES_REQUESTED. Jamais une autorisation d'exécuter ou déployer. |

## Décision d'architecture

Cette tranche étend le module TASKS, sans nouveau domaine exécutable. Un dossier est une tâche dont le titre commence par `Fabrique · `. Le statut de cette tâche décrit le travail de conception uniquement, pas la disponibilité d'un logiciel, d'un agent ou d'un fournisseur. Renommer une tâche hors de ce préfixe la retire de cette vue, sans supprimer ses enregistrements.

Les données documentaires sont classées privées au workspace. Aucun secret, donnée médicale ou bancaire ne doit y être saisi. Les notes ne sont ni injectées dans un modèle, ni promues en mémoire consentie. Rétention : jusqu'à une opération de suppression contrôlée du propriétaire du workspace ; cette tranche n'ajoute pas de purge ou suppression depuis l'interface. Ne pas utiliser cette première version pour des contenus exigeant une suppression fine immédiate.

Migration additive et idempotente à l'ouverture de l'API : index composite sur les tâches, table `creative_dossier_records`, index de lecture. Clé étrangère composite `(workspace_id, project_id)` vers les tâches. Les enregistrements sont immuables via cette API ; une correction crée un nouvel enregistrement. Il n'y a pas de mutation ou suppression exposée.

Chaque POST verrouille la tâche, revalide l'identité/permission, écrit le contenu et son événement d'audit dans la même transaction, puis revalide avant commit. La clé de dédoublonnage SHA-256 porte sur le contenu validé et normalisé, le workspace, le dossier, l'acteur et la catégorie. Une répétition identique par le même acteur renvoie le même enregistrement, sans nouvel audit. Une revue ne peut viser qu'un plan du même dossier/workspace.

## Contrat API

Toutes les routes utilisent l'identité serveur existante ; aucun `workspaceId`, rôle, secret, chemin fichier ou instruction d'exécution fourni par le client n'est accepté.

| Route | Outil / permission | Réponse |
| --- | --- | --- |
| GET `/v1/creative/projects` | `read_creative_dossier` / TASKS READ | `{ data: CreativeProject[] }` |
| GET `/v1/creative/projects/:projectId` | même outil | `{ data: CreativeProjectDetail }` |
| POST `/v1/creative/projects/:projectId/references` | `write_creative_dossier` / TASKS WRITE | `{ data: Reference }` |
| POST `/v1/creative/projects/:projectId/plans` | même outil | `{ data: Plan }` |
| POST `/v1/creative/projects/:projectId/notes` | même outil | `{ data: Note }` |
| POST `/v1/creative/projects/:projectId/reviews` | même outil | `{ data: Review }` |

Schémas exécutables : `packages/contracts/src/creative-engine.ts`. Champs supplémentaires refusés. Titres 160 caractères, URL 1 000, observations/notes 2 000, revue 1 000 ; plans : 12 étapes et 12 critères de 300 caractères maximum. Corps HTTP 16 Kio maximum. Au plus 200 enregistrements par dossier. Une liste de plus de 200 dossiers renvoie une limite explicite, pas une collection prétendument complète.

POST : 201 création, 200 répétition identique. Échecs : 400 validation, 401 identité absente/révoquée, 403 permissions, 404 dossier/plan non accessible, 409 capacité atteinte, 413 corps excessif. L'événement `creative.dossier.recorded` apparaît dans l'activité TASKS ; son payload contient uniquement les identifiants, la catégorie et la traçabilité de l'outil, jamais le contenu, les URL ou les notes.

Le frontend distingue chargement, collection réellement vide et API indisponible. Les contenus sont rendus comme texte React. Les exports Markdown mettent le texte utilisateur dans des blocs délimités résistants aux backticks imbriqués ; aucun HTML utilisateur n'est exécuté. Le téléchargement est volontaire et sort une copie du périmètre IDA : l'utilisateur doit protéger son fichier exporté.

## Limites de sécurité conservées

- Aucun changement Tailscale, pare-feu, port, origine distante ou liste blanche du navigateur privé. Les nouvelles routes ne sont pas ouvertes au profil distant restreint.
- Aucun accès nouveau à C:, F:, une URL de référence, un dépôt, un secret ou un modèle.
- Aucun shell, installation, génération, worker autonome, publication ou capteur déclenché.
- Aucun nouveau moteur ou package installé. La gouvernance documentaire ne touche pas au système d'approbation des outils.
- Les fournisseurs locaux nécessitent une revue de version, provenance, licence/modèles, isolation, ressources, réseau et arrêt/rollback avant activation. Voir `CREATIVE_ENGINE_REFERENCE_AUDIT.md`.

## Vérification et retour arrière

Tests ciblés : contrats/validation, CRUD documentaire via l'API, répétitions concurrentes, isolation de workspace/dossier, plan étranger, refus VIEW_ONLY, session révoquée, rollback de l'audit et du contenu, limites, export et rendu initial sans appels implicites. Typecheck des packages et build du frontend requis.

Livraison vérifiée le 14 septembre : 49 tests ciblés réussis (Creative Engine, aperçu Home, Motion et pièces), typechecks API/Web/contrats et build Web. Le navigateur local retrouve l'écran de déverrouillage ; la collection créative répond 401 sans session. Le formulaire de plan et la mise en page à largeur réduite ont été vérifiés dans une fixture éphémère distincte, jamais dans les dossiers réels. Aucun parcours iPhone ni génération IA n'est déclaré validé.

Avant activation sur les données existantes : arrêter uniquement le launcher IDA identifié, utiliser la sauvegarde locale chiffrée vérifiée, puis relancer avec la même configuration loopback. Ne jamais copier une base PGlite ouverte. Le retrait du point d'entrée et de l'enregistrement de routes désactive cette capacité sans effacer la table ni les audits ; une restauration exige le parcours documenté de sauvegarde, pas une suppression improvisée.
