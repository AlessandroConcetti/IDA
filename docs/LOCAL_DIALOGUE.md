# Dialogue IA local — expérimental, 10 septembre 2026

## Branchement réel dans le code

`LocalDialogue` → API authentifiée → `DeterministicIdaCore.generateProposal` → `CoreIntelligence` → `ProviderRegistry` → `ProviderRouter` → `OllamaAdapter` → `OllamaLoopbackTransport` → modèle local épinglé `qwen3:4b-instruct-2507-q4_K_M`.

Ce chemin est explicite et séparé des commandes déterministes existantes. Il n'active aucun agent métier PLANNED et n'attribue aucun accès aux fichiers ou à la mémoire. Le modèle reste expérimental : les qualifications musicales antérieures ont échoué, et le démarrage à froid peut être lent. Le code n'est pas une qualification métier.

## Contrat HTTP local

Toutes les routes héritent du hook d'identité et des protections Host/origin existants. Pas d'exposition LAN.

- `GET /v1/intelligence/local/status` : READ authentifié ; enveloppe `data` avec `state` (`DISABLED`, `READY`, `BUSY`, `MODEL_MISSING`, `UNAVAILABLE`), `model`, `locality: LOCAL`, `experimental: true`. Un statut READY vérifie l'inventaire et le digest, pas la qualité d'inférence. Aucun prompt ni chargement de modèle.
- `POST /v1/intelligence/local/reply` : READ, LOCAL_LOCK initialisé et session active obligatoires. Body JSON strict `{ "prompt": "..." }`, 1–3 000 caractères, corps limité à 16 Kio. Réutilise le schéma d'intelligence existant pour le champ prompt. Refus de motifs de secrets évidents ; ce filtre heuristique n'est pas une classification exhaustive.
- Réponse : `{ data: { text, provider: "ollama", model, locality: "LOCAL", experimental: true } }`. Le texte est traité comme non fiable et rendu par React comme texte ; aucun HTML, action ou lien exécutable du modèle.
- Erreurs contrôlées : 400 `INVALID_REQUEST`/`SECRET_INPUT_REJECTED`, 429 `BUSY`/`RATE_LIMITED` avec Retry-After, 503 `LOCAL_AI_DISABLED`/`LOCAL_AI_UNAVAILABLE`. Le hook global retourne 401 sans session.

Une seule inférence simultanée, pas de file de prompts ; 30 demandes maximum par heure et processus, reset au redémarrage (pas une limite anti-abus de production). Enveloppe 512 tokens, délai serveur 110 s, délai client 120 s. Annulation côté client, fermeture de connexion ou arrêt serveur : signal propagé au transport. Une réponse partielle/tronquée refusée par l'adapter existant n'est pas affichée comme complète.

## Confidentialité et autorité

- Provider et modèle fixes côté serveur ; aucun endpoint, identifiant utilisateur, workspace, policy, classe ou préférence cloud accepté dans le body.
- Classification conservatrice `SENSITIVE_PERSONAL`, stockage local uniquement, coût API zéro, une seule tentative, zéro consentement cloud et zéro fallback cloud.
- Scope dérivé de la session HTTP, relecture de l'autorité via `LocalIntelligenceAccess` pendant le routage et avant livraison. Tool Gateway limité à la proposition READ. Le Core existant est réutilisé, pas remplacé.
- Audit via `createPersistentIntelligenceAudit` et les tables existantes : métadonnées autorisées seulement, pas de prompt/réponse, secret ou trace fournisseur brute. Échec d'audit = pas de livraison.
- Pas de conversation persistante, fichiers, profil Care, inventaire, microphone ou mémoire automatique. Chaque demande contient seulement le texte saisi et une instruction serveur bornée. Aucun résultat n'effectue une écriture.
- Aucun secret serveur n'est lu par ce module. Les identifiants ne doivent jamais être placés dans une demande.

## Activation et arrêt

Le runtime standard reste inchangé. `local-preview.ts` réutilise exclusivement `tmp/ida-preview-relative-dates/data` et `media`, sans seed, avec LOCAL_LOCK et écoute `127.0.0.1:8787`. Activation explicite : variables serveur `IDA_LOCAL_DIALOGUE=1` et `OLLAMA_NO_CLOUD=1`. Le daemon doit être lancé lui-même avec `OLLAMA_NO_CLOUD=1` et `OLLAMA_HOST=127.0.0.1:11434` ; le transport ne démarre aucun processus et ne télécharge rien. Cette attestation d'exploitation ne remplace pas une future restriction d'egress réseau.

Reprendre les commandes de lancement locales habituelles ou lancer le fichier TS avec le runtime tsx déjà installé. Ne jamais pointer sur une nouvelle base pour contourner le verrou. Désactiver en retirant `IDA_LOCAL_DIALOGUE` puis redémarrant cette API ; arrêter la demande avec le bouton Arrêter ou fermer le dialogue.

Au constat de cette livraison : services Vite/API/Ollama relancés, cloud Ollama désactivé et modèle présent. `/v1/auth/status` retourne `LOCAL_LOCK / UNINITIALIZED`. Une phrase de passe doit être créée **par l'utilisateur**, depuis l'écran existant. Aucune phrase inventée, aucun credential prélevé, aucune réponse authentifiée de bout en bout revendiquée. La route protégée refuse bien les requêtes sans session (401).

## Astra et téléphone

L'adapter OpenAI Responses existant est conservé mais non activé. Il faut une clé API côté serveur, le transport HTTPS officiel, une policy de consentement par scope/finalité et une enveloppe de coût. La session ChatGPT/Codex et son abonnement ne sont pas des credentials pour cette API. Références officielles consultées : [quickstart API](https://developers.openai.com/api/docs/quickstart), [modèle Astra](https://developers.openai.com/api/docs/models/gpt-6-astra). Aucune clé n'est demandée dans le chat ni stockée côté client.

Téléphone : `127.0.0.1` désigne le téléphone, pas ce PC. Vite, l'API et LOCAL_LOCK sont délibérément limités au loopback. Pas de changement en `0.0.0.0`, règle pare-feu, tunnel ou proxy masquant cette frontière. La prochaine tranche mobile doit couvrir le jalon SECURITY.md : HTTPS, identité/session/clientInstance propres au téléphone, révocation et protections réseau. Pas de disponibilité mobile annoncée avant ce jalon.

## Vérification de cette tranche

### Reprise du 10 septembre — statut concurrent

Le statut dispose désormais de son propre transport d'inventaire ; les demandes simultanées partagent une seule vérification en vol, sans cache permanent. L'inférence conserve son transport exclusif et vérifie toujours le digest avant l'appel. Ainsi, ouvrir deux dialogues ne produit plus un faux état hors ligne et la lecture du statut ne peut plus consommer un essai de génération. Les deux transports sont fermés à l'arrêt serveur. Le client affiche les messages d'erreur contrôlés du serveur (quota, saisie refusée, modèle indisponible).

Vérification complémentaire : 7 tests de composition de statut, 78 tests existants du transport et 9 tests Frigo passent (94 au total). Types Web et API vérifiés, lint des fichiers de cette tranche propre. Les tests de statut utilisent des transports simulés et ne prouvent ni l'authentification de bout en bout ni une réponse réelle du modèle. La saisie et la confirmation du premier verrou restent une action de l'utilisateur dans IDA ; aucune phrase reçue dans la conversation n'est enregistrée dans le projet.

Lors de la livraison initiale : revue ciblée des flux et du scope, démarrage runtime, chargement des modules frontend et refus HTTP sans authentification. Aucun test/lint/typecheck/build ou recette navigateur n'avait alors été exécuté, conformément à la pause demandée. Les vérifications complémentaires de la reprise sont indiquées ci-dessus. Les chemins authentifiés, annulations réelles, expiration de session, rendu mobile et traitement audio devront être recettés avant une qualification plus large.
