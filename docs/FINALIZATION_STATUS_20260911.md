# IDA — état de finalisation au 11 septembre 2026

## Périmètre et vérité de cette session

Reprise de l'existant, nouvelles références Home desktop/mobile intégrées, finalisation Travel, voix cliente locale et branchement Core du pilote domotique READ. Aucun token Home Assistant n'existe à ce stade, conformément à la précision utilisateur : **prochaine session seulement**. Aucune connexion à une maison réelle, publication, commande physique, ouverture réseau ou session d'utilisateur créée par l'agent.

Le tableau distingue un parcours logiciel utilisable, un fournisseur réellement présent, un branchement préparé et une maquette. Un bouton visible n'est jamais une preuve de connexion. Les constats anciens des autres comptes rendus restent historiques ; celui-ci décrit la clôture de cette reprise.

## REAL ACTIVE

| Partie | Ce qui existe réellement | Limite |
|---|---|---|
| Core, API et identité | Monolithe partagé, permissions serveur, isolation workspace, audit, sessions locales verrouillables/révocables | Pas une identité distante prête pour téléphone |
| Tâches et mémoire | Tâches persistées par l'API ; mémoire explicite PENDING / CONFIRMED / REJECTED | Une conversation ne devient pas une mémoire automatique |
| Nouvelle interface Home | Maison holographique illustrée, pièces cliquables, recherche, thèmes, ambiances de l'écran, orbe, adaptation mobile | Pas de plan 3D réel ni état de capteurs inventé |
| Frigo | Écran indépendant, inventaire manuel et liste à racheter, parcours Classic/Sci-fi conservés | Brouillon temporaire ; pas de base d'inventaire durable |
| Travel | Menu pays animé/dépliant/filtrable ; étapes, dates, budget, checklist, export texte | Suggestions éditoriales ; pas de réservation ni vols live |
| Carnets Travel | Sauvegarde dans les tâches du Core, réouverture, copie modifiable, protection contre doubles clics et réponse incertaine | Pas de nouveau stockage parallèle ; ancien texte conservé |
| Research | Bibliothèque du Core, liens de recherche, notes et carte d'idées manuelle, briefs | Pas de recherche scientifique automatiquement vérifiée ni de RAG |
| Music Studio | Bibliothèque privée, import authentifié disponible, lecteur, boucle, EQ et compression d'écoute | Pas un DAW, pas de fichier master exporté par ces effets |
| La Fabrique | Templates, briefs exportables et tâches/projets de préparation | Aucun agent, application ou workflow réellement déployé par un brief |
| Calendrier éditorial | Calendrier interne et programmation interne avec validations | Pas de compte Google Calendar connecté ni publication externe automatique |

Navigation Home : [fonctions, design, asset et prompt](HOME_COCKPIT.md). Travel : [contrat du carnet](TRAVEL_NOTEBOOK.md).

## CONNECTED

- **Cerveau local** : composition existante UI → API Core → Registry → Router → adapter Ollama/Qwen conservée. API relancée avec le dialogue local activé, même base et même verrou. L'inventaire local expose le modèle épinglé `qwen3:4b-instruct-2507-q4_K_M` et son digest attendu. Deux réponses réelles synthétiques ont été reçues directement du moteur local, sans données utilisateur : 90,6 s au premier essai ; 0,3 s au second, modèle déjà chargé. Cela ne constitue ni un benchmark ni une qualification du dialogue authentifié de bout en bout. Pas d'outils exécutés par ses réponses.
- **Météo** : intégration Open-Meteo déjà branchée par la tranche précédente ; affichage via l'API partagée et consentement explicite au chargement. Pas de nouvelle mesure météo réelle demandée durant cette reprise.
- **UI et Core** : les accès Home aux tâches, à Ma journée, aux bibliothèques, à Travel, au frigo et à Music réutilisent les chemins existants. Aucun second Core.

## PREPARED

| Capacité | Livré | Activation / vérification encore requise |
|---|---|---|
| Dictée locale | Détection explicite des packs français, `processLocally=true`, capture bornée, arrêt, relecture puis ajout au brouillon | Navigateur compatible et pack local, permission micro donnée au clic ; recette matérielle non faite |
| Lecture vocale | Sélection d'une voix française déclarée locale, lecture volontaire de la réponse réussie, arrêt à la fermeture/masquage | Voix OS locale disponible ; recette haut-parleur non faite |
| Robot Immersive | Dialogue local dans la scène et indicateurs écoute/parole | Vidéo décorative, pas de lèvres synchronisées, gestes ni caméra |
| Home Assistant READ | Statut authentifié, consentement explicite, binding fixe d'une lampe au workspace, transport HTTPS borné, contrôle de révocation et audit | HTTPS, lampe, secret et coffre opérationnel manquants |
| Coffre Windows | Helpers de saisie masquée et DPAPI CurrentUser, secret absent du frontend/arguments/logs | Exécution du helper refusée par la politique Windows actuelle |
| Providers cloud | Contrats/adapters et routage existants | Transport/credentials/policy/consentement/coûts à activer explicitement ; aucun Astra activé |

Contrats, routes et limites : [Voix / Home Assistant](VOICE_HOME_CONNECTIONS.md), [OpenAPI additionnel](openapi/home-device-pilot.yaml).

## DEMO / MOCK

- Le bâtiment et ses pièces sont une illustration éditoriale. Aucun relevé du domicile, caméra, thermostat, alarme ou compteur n'est connecté. Les ambiances changent uniquement l'écran, sans fausse scène domestique active.
- Care / onboarding : formulaire de démonstration personnalisable et consentement UI ; les données corporelles ne sont pas encore persistées dans un domaine Care sécurisé. Pas de scan, diagnostic ou équipe médicale active.
- Idées/recettes du frigo : contenu préparé et saisie manuelle, pas d'OCR validé ni inventaire détecté.
- Suggestions de pays : éditoriales, pas issues d'un agent de recommandations en production.
- Certaines surfaces historiques System/Social contiennent encore des indicateurs de démonstration. « AI online » ou une carte d'intégration ne prouve pas une connexion fournisseur. Seules les réponses runtime et les limites documentées font foi.

## BLOCKED

1. **Home Assistant** : token non créé (attendu à la prochaine session), adresse fournie en HTTP seulement, aucune entité `light.*` réelle désignée. La configuration privée conserve l'adresse fournie mais refuse l'egress tant que HTTPS n'est pas vérifiable. Aucun port ni certificat supposé.
2. **Coffre Windows** : politique `Restricted`, helper `.ps1` refusé. Le chiffrement d'une valeur factice fonctionne ; le déchiffrement via le helper n'est pas qualifié. Aucun contournement de politique effectué.
3. **Téléphone** : layout responsive livré, mais Vite/API sont toujours sur `127.0.0.1`. Depuis un téléphone, cette adresse désigne le téléphone. Le jalon HTTPS + identité appareil + sessions révocables + protections réseau n'est pas livré ; aucun tunnel ni pare-feu ouvert.
4. **Astra** : aucune clé API serveur ni activation cloud. Aucun credential ChatGPT/Codex détourné.
5. **Import des gros masters** : limite privée 25 Mio et réconciliation transactionnelle des versions non finalisées. Le plan historique sélectionnait 109 titres parmi 275 exports nommés Astromer/MARLA, dont 90 trop volumineux. Aucun nouveau morceau n'a été importé durant cette session et aucun original n'a été modifié/supprimé.
6. **Recette authentifiée** : le navigateur observé affiche le verrou d'IDA. L'agent ne l'a pas franchi ni utilisé la phrase de passe transmise dans l'historique.

## PLANNED

- Persistance sécurisée du domaine Care et de l'inventaire frigo, avec durée de rétention, consentements, contrats, suppression et gouvernance adaptée.
- Téléphone sécurisé et appairage, puis voix réelle qualifiée sur cet appareil.
- Import des masters volumineux avec unicité/versions réconciliées côté serveur ; production audio avancée distincte des effets d'écoute.
- Documents : extraction isolée, recherche indexée et citations ; ResearchNetwork transversal et sources séparées des hypothèses.
- Automatisations/scheduler, notifications, assistants métier et gouvernance : manifests, outils autorisés, évaluations et approbations avant activation.
- Caméra, motion tracking, MetaHuman/lip-sync et présence avancée : gestes explicites, traitement local par défaut, arrêt et budgets de ressources.
- Intégrations de comptes externes et publication réelle : credentials, scopes, modes de repli et confirmation humaine finale.

## ACTIONS REQUIRED FROM USER

- **Maintenant, pour utiliser ce qui est prêt** : ouvrir IDA sur ce PC, déverrouiller avec la phrase de passe habituelle, puis roue → IDA Home. L'orbe ouvre le dialogue ; micro et lecture audio nécessitent leurs propres clics.
- **Prochaine session Home Assistant** : un token dédié/révocable à saisir uniquement dans un parcours local sécurisé une fois le coffre qualifié, l'adresse HTTPS vérifiable du hub et une seule lampe pilote. Ne pas coller le token dans la conversation.
- Le choix d'une solution HTTPS et d'appairage pour le téléphone devra être finalisé lors de sa tranche de sécurité ; l'appareil ne se connectera pas en ouvrant l'URL loopback actuelle.
- La voie Astra nécessitera un credential API serveur et un budget/consentement adaptés. Aucune souscription, achat ou activation facturable n'a été faite.

## TESTS

Vérifications ciblées exécutées, pas une campagne exhaustive de toute la roadmap :

- **107 tests / 11 fichiers passent** : Home (8 cas, dont rendu passif Classic/Sci-fi et destinations), voix locale, rendu voix, HomeConnections, destinations, contrat Travel, config HA, transport HTTPS, routes HA, provider READ et dialogue local.
- **2 tests coffre passent séparément** sous le compte Windows. Le cas `Restricted` attend un refus fermé du helper : ce succès de test ne signifie pas que le coffre est opérationnel.
- **Total : 109 tests / 12 fichiers.** Commande : Vitest existant, `run` sur les fichiers ci-dessus, `--maxWorkers=2 --testTimeout=15000` ; fixture coffre séparée pour l'accès DPAPI du compte Windows, uniquement avec une valeur synthétique.
- Types Web et API sans erreur ; contrats et build API (`tsconfig.build.json`) compilés. Build Vite réussi, entrée JS réduite de 549,58 à 457,89 kB après retrait de l'ancien chemin Home devenu inaccessible ; aucun avertissement de chunk >500 kB dans le build final.
- Biome sur les **30 fichiers TS/TSX/JSON concernés : sans diagnostic**. Les 5 CSS se vérifient sans erreur mais conservent 30 avertissements de style, principalement les priorités `!important` et sélecteurs de compatibilité. Ce n'est pas un lint global du worktree.
- `git diff --check` sans erreur d'espaces ; avertissements Git CRLF de l'installation Windows uniquement.
- Après rechargement, `/health` : **200**, `LOCAL_LOCK`, base prête ; `/v1/auth/status` : **200 / LOCKED**. Statut domotique, lecture domotique et statut cerveau refusent **401 sans session**. Aucun test sur une vraie lampe.
- Nouveau décor servi par Vite en **HTTP 200**. Navigateur consulté : écran de déverrouillage, sans saisie. Recette visuelle authentifiée, responsive sur téléphone physique, microphone et haut-parleur **non réalisés**.
- Sonde directe Ollama sans donnée utilisateur : réponses exactes aux deux consignes simples ; premier essai 90,6 s, second 0,3 s (chargement 0,00 s, prétraitement 0,16 s, génération 0,04 s / 3 tokens au second). Aucun benchmark de qualité revendiqué.

## RISKS

- Le démarrage du modèle peut être très long malgré une réponse rapide une fois chargé ; une salutation réussie ne qualifie pas les demandes complexes. Les échecs de qualification métier antérieurs ne sont pas effacés par ces deux sondes.
- Une voix locale dépend du support et des déclarations du navigateur/OS. Aucun fallback cloud silencieux ; absence de support = clavier.
- Les brouillons Care/frigo et conversations temporaires peuvent être perdus à la sortie. Ne pas les présenter comme synchronisés ou durables.
- Le token HA peut disposer de pouvoirs plus larges que le pilote IDA READ : secret côté serveur, cible fixe et refus par défaut restent indispensables. Le contrôle `CONFIGURED` ne prouve pas la validité du token ni l'autorisation d'exécuter le helper.
- Les limitations mémoire/quotas par processus et le coffre privé actuel sont un pilote local, pas une infrastructure de production ni une autorisation d'exposition LAN/Internet.
- Les médias privés/generated restent volontairement hors Git ; ils devront accompagner l'installation locale ou un futur déploiement autorisé.
- Les modifications préexistantes liées notamment aux dates de sorties, App/API et leur documentation sont préservées hors des commits de cette reprise.

## NEXT PRIORITY

1. Recette utilisateur du Home et du dialogue/voix, puis stabilisation du démarrage modèle sans chargement implicite permanent.
2. Qualifier un coffre Windows autorisé, puis **une lampe HA en lecture seule** après réception des paramètres sécurisés. Ne pas élargir d'abord à toute la maison.
3. Tranche téléphone sécurisée de bout en bout ; pas de simple ouverture du serveur de développement.
4. Masters privés volumineux et réconciliation des versions, puis persistance frigo/Care et outils documentaires.

## Exploitation et reprise

API relancée seule avec `apps/api/src/local-preview.ts`, `IDA_LOCAL_DIALOGUE=1`, `OLLAMA_NO_CLOUD=1`. Données réutilisées dans `tmp/ida-preview-relative-dates/data` et `media`, `seed=false`, écoute locale `127.0.0.1:8787`. Vite reste sur `127.0.0.1:5173`. Aucun changement de phrase de passe, import automatique, token, capteur ou permission réseau.

Pour reprendre : partir des blocages ci-dessus et des contrats, sans reconstruire les interfaces ni repartir du prompt entier. Les ajouts de cette session se répartissent en deux unités logiques : Travel/carnet, puis Home/voix/pilote READ et bilan.
