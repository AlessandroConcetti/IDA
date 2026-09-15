# Chat local : échanges persistants — 15 septembre 2026

## Tranche livrée

`LocalDialogue` → session locale → Tool Gateway → Core / Provider Router → Ollama épinglé → validation → transaction historique + audit → interface.

Un échange complet contient une question et une réponse. Les textes sont enregistrés uniquement après une génération complète et une nouvelle vérification des droits WRITE. Un échec du modèle ou de la sauvegarde ne crée pas de faux échange réussi. Le chemin historique READ reste disponible lorsque le modèle est désactivé.

La base privée existante reçoit une table additive `local_chat_exchanges`, isolée par `(workspace_id, user_id)`. L’identité vient de la session, jamais du corps HTTP. Le modèle ne reçoit ni accès SQL ni outil de sauvegarde ; c’est le serveur qui conserve la réponse validée. L’audit append-only contient seulement l’identifiant d’échange et l’action `chat.exchange.saved`, sans texte.

## Contrat API

- `GET /v1/intelligence/local/history` : READ + `read_local_chat_history`, session valide ; `{data:{items:ChatExchange[],retentionDays:30}}`, au plus 100 échanges, du plus récent au plus ancien. `Cache-Control: no-store`.
- `POST /v1/intelligence/local/reply` : `{prompt,requestId?}` strict ; prompt trim 1–3 000 caractères, requestId UUID canonique. Avec requestId : WRITE + `save_local_chat_exchange`, revalidé avant inférence et dans la transaction de sauvegarde.
- Réponse persistante : `{data:{text,provider:"ollama",model,locality:"LOCAL",experimental:true,exchange:{id,prompt,answer,provider,model,createdAt}}}`. Les champs texte/modèle/provider de l’enveloppe et de l’échange doivent correspondre.
- Sans requestId : compatibilité des anciens clients, réponse temporaire READ, **aucun enregistrement**. L’interface principale envoie toujours requestId.
- Même propriétaire, même UUID et même prompt : réponse enregistrée renvoyée sans nouvelle inférence. UUID déjà utilisé avec un autre prompt : 409 `LOCAL_CHAT_CONFLICT`. Cette idempotence vaut tant que l’échange est conservé.
- Stockage indisponible avant génération : 503 `LOCAL_CHAT_STORE_UNAVAILABLE`, aucun appel modèle. Échec de sauvegarde après réponse : 503 `LOCAL_CHAT_NOT_SAVED`, aucun texte annoncé comme enregistré.
- Droits WRITE retirés après inférence : refus 401/403 avant sauvegarde. Une révocation complète détectée à l’intérieur du Core peut encore donner le 503 générique du dialogue, sans livraison du texte.
- Erreurs modèle, limites, protections Host/Origin, corps 16 Kio, timeout et refus heuristique de secrets : règles préexistantes inchangées.

## Rétention et limites exactes

- Seuls les 100 derniers échanges de moins de 30 jours sont consultables. Purge physique au démarrage et lors d’une sauvegarde, **pas de tâche de purge permanente** : des lignes plus anciennes peuvent rester sur disque entre ces événements, mais les lectures les excluent.
- Cette rétention ne purge pas les anciennes sauvegardes. La base elle-même n’est pas chiffrée par cette tranche ; le mécanisme de sauvegarde Windows existant produit une archive chiffrée DPAPI. Les protections du disque et du compte Windows restent nécessaires.
- L’historique n’est ni une préférence consentie du Memory Manager ni une mémoire permanente. **Il n’est pas encore réinjecté comme contexte au modèle** : chaque réponse traite le seul message courant.
- Aucun échange dans localStorage/sessionStorage. Le navigateur garde les données nécessaires à l’affichage en mémoire jusqu’à fermeture du composant. L’identifiant de relance incertaine est conservé seulement tant que l’écran reste monté ; après rechargement, consulter l’historique avant de renvoyer une question.
- Les brouillons restent dans le champ après échec. Une réponse temporaire ou non conforme n’est jamais présentée comme sauvegardée. Aucun capteur ou fournisseur cloud activé implicitement.
- Pas d’export/suppression individuels ni de classement en conversations dans cette première tranche.

## Astra — demandé, non connecté

L’adapter OpenAI Responses existe déjà, mais le Chat de cette tranche appelle exclusivement Ollama. Le panneau Astra annonce la connexion requise, pas une disponibilité fictive.

La [documentation d’authentification API](https://developers.openai.com/api/reference/overview) exige un credential serveur autorisé. Une adresse e-mail n’est pas ce credential. L’[authentification ChatGPT/Codex](https://learn.chatgpt.com/docs/auth) distingue l’accès par abonnement des appels API ; aucun cookie ou fichier de connexion Codex n’est prélevé. La [fiche GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), consultée le 15 septembre 2026, indique que le palier API gratuit n’est pas pris en charge.

Activation **BLOCKED / NEEDS REVIEW** : accès API confirmé par l’utilisateur, saisie sécurisée du secret côté serveur, budget explicitement approuvé, consentement des messages transmis au cloud, transport officiel borné et tests d’autorisation/coût. Aucun débit, changement d’abonnement, achat de crédit ou nouvelle exposition réseau effectué. OpenAI Docs a guidé cette vérification.

## Vérification

Tests ciblés : contrats stricts, isolation utilisateur et workspace, revalidation avant/après transaction, audit sans contenu, rétention, fermeture/réouverture d’une base de test sur disque, idempotence, sauvegarde atomique, erreurs réelles et droits HTTP. Les tests HTTP simulent le modèle uniquement ; ils ne sont pas une preuve d’inférence réelle ni de recette iPhone.

Résultats de cette session : 60 tests ciblés passent (53 historique/contrats/UI/composition, 7 statut existant). Types API et Web, Biome des 12 fichiers code/contrats de la tranche et build Web passent ; le build conserve un avertissement de bundle principal supérieur à 500 Ko.

Une inférence **réelle**, via le script synthétique isolé `run-local-dialogue.ts`, a pris 13,796 s : authentification, refus anonyme, réponse locale, sauvegarde, lecture historique, rejeu du même UUID sans nouvel échange et révocation finale vérifiés. `expectedMarkerMatched:false` : le modèle n’a pas respecté exactement le marqueur demandé, donc le script sort en échec de qualification de format. Ce résultat n’est pas transformé en succès sémantique ; seul le chemin technique est validé. Aucun texte personnel, base utilisateur ou service cloud utilisé dans ce contrôle. La réouverture après arrêt est couverte par une base de test persistante sur disque, pas encore par le navigateur utilisateur.

Le runtime utilisateur, constaté arrêté, a été relancé après sauvegarde fermée chiffrée DPAPI (1 176 fichiers, intégrité vérifiée ; archive `tmp/private-access-backups/ida-before-browser-ac0e5839df324a458c4f482d5da55eb1.dpapi`). API PID 22720 sur `127.0.0.1:8787`, Ollama PID 23464 sur `127.0.0.1:11434`, digest épinglé vérifié et cloud désactivé au lancement. Ces PID sont un constat de session, pas des identifiants réutilisables pour arrêter un processus sans nouveau contrôle.

Recette dans le vrai navigateur, après déverrouillage par l’utilisateur : Music Studio → Assistant créatif → demande synthétique de titre instrumental nocturne → réponse du modèle affichée → paire retrouvée dans « Vos échanges avec IDA » avec confirmation « Enregistré sur ce PC ». Le brouillon a été vidé après confirmation. Aucun micro, cloud ou fichier personnel utilisé. Un échange synthétique reste dans l’historique de l’utilisateur ; il expirera selon la rétention annoncée.

Le rechargement a été lancé, mais le contrôle a ensuite été interrompu et les deux processus locaux ont été constatés arrêtés. Les journaux consultés ne montraient pas d’erreur applicative ; la cause de cet arrêt n’est pas établie. Le lanceur a rétabli API PID 33692 et Ollama PID 33424, avec les mêmes ports loopback et contrôles. Le navigateur affiche à nouveau le verrou. **La vérification visuelle de l’ancien échange après cette relance reste en attente du déverrouillage utilisateur** ; ne pas confondre le succès navigateur d’envoi/sauvegarde avec un test navigateur de reprise terminé. Les tests de persistance sur disque et de rejeu API, eux, passent.

Estimation de complétude du premier Chat local : **85 %**, pas un taux de fiabilité mesuré. Restent notamment le contexte entre messages, l’ergonomie de conversations et la recette de reprise utilisateur. Astra n’est pas connecté. Le téléphone/Tailscale et la domotique restent hors de cette tranche.
