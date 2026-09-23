# IDA — feuille de route d’exécution confirmée le 23 septembre 2026

Source : demandes utilisateur, ordre confirmé pendant la livraison frontend. Cette feuille
ne certifie pas un état de production. Aucun pourcentage global ; distinguer code, recette
isolée, connexion réelle et validation physique utilisateur.

## Ordre et conditions de sortie

| Ordre | Livraison | État vérifié / prochaine action | Condition de sortie |
| --- | --- | --- | --- |
| 1 | Frontend PC/mobile | Fabrique/Finance Classic et Sci-Fi, Care/Home mobile, chat étoilé, sons opt-in, robot Immersive, Modern, paramètres et contrôles micro/caméra. Voir FRONTEND_FOUNDATION.md. | Build, parcours desktop/mobile, sauvegarde après. Puis revue visuelle utilisateur et uniformisation selon ses retours. |
| 2 | Boutons et parcours réellement utiles | Navigation et fonctions existantes raccordées. Certaines rubriques Finance/IDACAR affichent encore leurs prérequis, pas une fonction métier. | Inventaire bouton → action → API → erreur/état vide ; aucun bouton décoratif annoncé opérationnel. Dépendances externes explicitement signalées. |
| 3 | Qwen local + Gemini d’appui | Qwen et Gemini ont leurs transports. Le chat actuel appelle Qwen uniquement ; pas de complément automatique Gemini. | Routage commun, choix consenti, quota observé, plafond journalier approuvé, fallback local, aucune sortie de données sensibles ni secours payant implicite. |
| 4 | Voix globale | Wake word IDA après activation volontaire, session locale limitée à 25 s ; synthèse locale et ElevenLabs existantes. Nouveau bouton commun ouvre les commandes. | Demandes vocales vers intentions/outils contrôlés, réponses vocales et arrêt depuis les parcours autorisés. Vérifier les navigateurs/appareils réellement utilisés. Pas de promesse d’écoute système permanente. |
| 5 | Motion tracking | MediaPipe/CameraManager/Recognizer/FSM/Event Bus présents ; simulation et aperçu webcam opt-in. | Modèle local vérifié, webcam → tracker → recognizer → FSM, calibration réelle, arrêt immédiat, actions clientes inoffensives d’abord. Toute action OS/HA reste Gateway/Policy/Approval/Audit. |
| 6 | Azure + Google Cloud | Pas d’adaptateur Azure/Vertex, pas de crédit vérifié. Préparation dans CLOUD_BUILD_PREPARATION.md. | Compte/projet/région/modèle admissible, coffre et identité, autorisation du mode crédit borné, limite/expiration/arrêt testés, petit essai explicitement autorisé. |
| 7 | Agents Care | Laboratoires préparés, pas enregistrés/exécutés. À faire après connexion cloud. | Manifeste par laboratoire/pathologie, gouvernance, outils et contextes bornés, évaluation, activation révocable. Conception initiale publique/synthétique ; coffre médical et usage des données personnelles = jalon distinct. |
| 8 | Agents Finance | Interface sans montants fictifs ; aucun agent Finance déployé. | Manifeste, sources réelles, analyse en lecture seule, gouvernance et escalade humaine. Aucun paiement/transfert/trade. |
| 9 | Agents Music Studio + prospection | Catalogue/morceaux/sorties existent ; Music Librarian encore PLANNED. Aucun parcours complet de prospection/envoi. | Recherche de contacts professionnels avec sources officielles, portefeuille persistant isolé par workspace, brouillons, validation humaine liée au contenu/destinataires, envoi via connecteur autorisé, anti-doublon/audit. Une modification invalide l’approbation. |
| 10 | La Fabrique et MCP utilisables | Fondation UI, composer, preview/export local et trois MCP UI vérifiés précédemment. Tous les MCP ne sont pas des outils métier actifs. | Parcours créer → prévisualiser → enregistrer/exporter ; panneau MCP affiche installé/configuré/autorisé/exécuté distinctement. Agents validés, aucune publication implicite. |
| 11 | Navigateur privé/Tailscale | Relais HTTPS privé existant. Affichage iPhone confirmé historiquement ; recette réseau actuelle à faire. | Même API, session/grants appropriés et révocables, contrôle sur PC et iPhone hors Wi-Fi. Aucun Funnel ni accès public. |
| 12 | Home Assistant, en dernier | Pilote LG TV et HTTPS présents ; extinction historiquement confirmée. Allumage par casque n’est pas preuve IDA. | Recette réelle ON/OFF et état observé, preuves Gateway/Policy/Audit ; élargissement par entité/service avec permissions explicites, jamais suppression globale de la sécurité. |

## Règles de reprise

- Terminer la tranche active, enregistrer preuve, état réel, limites, fichiers et prochaine action.
- Consulter FRONTEND_FOUNDATION.md et LUNA_CONNECTIONS.md avant de modifier leurs zones.
- Ne pas recommencer OAuth, ACL/DPAPI, tests vocaux ou redémarrages sans raison nouvelle.
- Les anciens états documentés peuvent être dépassés : lire le code et vérifier le runtime ciblé.
- Secrets : fenêtre PowerShell visible ouverte par l’assistant, saisie masquée. Jamais dans
  le chat, logs, prompts, frontend, Git ou fichier de configuration versionné.
- Capteurs toujours volontaires ; caméra coupée en quittant/masquant le parcours et jamais
  réactivée par une préférence enregistrée. Aucun enregistrement biométrique.
- Préserver le Core, les modules, le router et le Tool Gateway. Les agents sont des capacités
  déclarées, non des processus autonomes. Une décision architecturale majeure attend validation.

## Références de l’inventaire actuel

- Chat : `apps/web/src/LocalDialogue.tsx`, `apps/api/src/cloud-chat.ts`.
- Voix : `apps/web/src/VoiceControls.tsx`, `docs/VOICE_REFERENCE_20260919.md`.
- Gestes : `apps/web/src/CameraPreview.tsx`, `apps/web/src/GestureDebugPanel.tsx`, `docs/GESTURE_RUNTIME.md`.
- Agents : `packages/domain/src/agent-registry.ts`, `apps/web/src/care-labs.ts`.
- Envoi email non livré : `apps/api/src/mcp-workspace-tools.ts`, `docs/ICLOUD_MAIL_CONNECTION.md`.
- Réseau/HA : `docs/PRIVATE_WEB_ACCESS.md`, `docs/SMART_HOME.md`.

Les preuves caméra simulée/Playwright ne remplacent pas l’image de la vraie webcam ni
la reconnaissance des gestes de l’utilisateur. Ne pas inscrire cette recette comme réussie
avant son retour explicite.

**Retour utilisateur reçu : image de la webcam visible, le 23 septembre 2026.**
Cela valide l’aperçu physique, pas encore le tracking ni des actions par geste.
