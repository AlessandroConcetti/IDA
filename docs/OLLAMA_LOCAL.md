# IDA — Premier transport Ollama local

Tranche du 8 septembre 2026. Le transport est réel ; la démo reste déterministe. Depuis la tranche suivante, un modèle est installé pour une évaluation synthétique explicite, sans activation d'agent : [modèle pilote et résultats](LOCAL_MODEL_EVALUATION.md). Installation du runtime et évaluation distinctes de l'activation en production.

Nouvelle recette du classement via la composition serveur complète : [MUSIC_PROPOSAL_EVALUATION.md](MUSIC_PROPOSAL_EVALUATION.md), **1/3** classements corrects, références préservées. Trois appels supplémentaires sur données fictives, sans téléchargement ou changement de configuration permanente. Le daemon temporaire a été arrêté après la recette ; le modèle reste un candidat non qualifié, pas le cerveau actif du chat.

## Réutilisation

`OllamaLoopbackTransport` implémente le `JsonInferenceTransport` existant. `OllamaAdapter`, `IntelligencePort`, Provider Registry/Router, profils d'environnement, Identity et Tool Gateway sont conservés. Aucun endpoint client, migration, secret, nouvelle dépendance, second Core ou second registre n'est ajouté. Le code n'est pas importé par la composition de la démo.

Le transport ne remplace pas une autorisation : la future composition doit conserver l'identité fraîche, les permissions et l'audit de `CoreIntelligence` / `EnvironmentIntelligence`. Les agents ne doivent jamais construire ce transport directement. L'inventaire est une méthode interne serveur, pas une route publique.

## Garde-fous effectifs

- Configuration serveur stricte, désactivée par défaut. `enabled` et `localOnlyDeploymentApproved` sont tous deux requis, y compris pour l'inventaire. La seconde valeur représente une revue du déploiement, pas une attestation fournie par le navigateur ou une preuve technique du daemon.
- HTTP Node natif avec `hostname:127.0.0.1`, IPv4 et `agent:false` ; port fixé côté serveur (11434 par défaut). Ni URL cliente, DNS, global agent, proxy d'environnement, redirection, cookie ni Authorization. Aucun appel `pull`, `create`, `delete`, processus ou accès caméra.
- Seulement `GET /api/tags` pour l'inventaire et `POST /api/chat`. L'inventaire seul ne charge ni n'approuve de modèle. Projection limitée à nom, empreinte et taille ; pas de publication automatique de cet inventaire dans l'interface ou les logs.
- Au maximum 16 modèles explicitement épinglés, nom avec tag obligatoire, empreinte SHA-256 complète. Noms distants/cloud/URL non pris en charge. Inventaire relu avant chaque prompt ; modèle absent, empreinte modifiée, doublon ou métadonnée distante : refus. Une origine Hugging Face ne donne pas une exemption : importer plus tard un artefact revu sous un alias local épinglé, après licence et évaluation.
- Copie du prompt et des pins avant tout await. Un seul message utilisateur texte (32 000 caractères maximum), aucune image, outil, option libre ou streaming ; sortie demandée bornée à 8 192 tokens, `keep_alive:0`. Le transport impose `num_ctx` depuis `contextTokens` serveur : 4 096 par défaut, de 512 à 8 192 ; l'appelant ne peut pas fournir cette option. Un nombre de caractères ne garantit pas que tous les tokens entrent dans le contexte : les prompts longs doivent être bornés par le futur Context Broker.
- Corps émis ≤192 Kio, reçu ≤512 Kio comptés pendant lecture, en-têtes ≤8 Kio, JSON UTF-8 strict, pas de compression. Un inventaire contient au maximum 128 entrées. Les corps d'erreur et en-têtes distants ne sont jamais exposés.
- Une opération à la fois par instance (inventaire compris), refus immédiat sans file de prompts. Délai global inventaire + génération de 30 s par défaut, configurable jusqu'à 120 s. Annulation, délai ou `dispose()` ferment requête/réponse ; le slot et les listeners sont libérés. `dispose()` interdit tout nouvel appel de cette instance.

L'adaptateur existant masque les erreurs de transport sous `INVALID_RESPONSE`, sauf annulation de son signal externe ; seuls les statuts HTTP explicitement reconnus conservent leur traduction actuelle. Ne pas annoncer un fallback local automatique après une erreur ambiguë, une empreinte modifiée ou un timeout. Les erreurs directes d'inventaire restent typées et expurgées.

## Limites de confiance

Une socket loopback, un nom sans « cloud » et un digest d'inventaire ne prouvent **pas** l'absence d'envoi externe du daemon. Son mode cloud doit être désactivé avant lancement, sa provenance vérifiée et son exposition réseau contrôlée. Le transport ne configure pas le pare-feu et ne constitue pas un bac à sable OS.

L'empreinte vient de l'inventaire du daemon, pas d'un calcul IDA de ses poids ; un administrateur peut aussi remplacer un tag entre l'inventaire et le chat. Cette fenêtre n'est pas résolue par le protocole utilisé ici. Contrôler le runtime et ses écritures, ne pas changer les modèles pendant les appels ; pour des données sensibles, ajouter une isolation d'egress proportionnelle au risque avant activation. Un OS ou daemon compromis reste hors garantie.

`keep_alive:0` demande la libération du modèle après réponse ; fermeture d'une socket ou timeout ne garantit pas que le calcul natif soit immédiatement arrêté. Pas de garantie de qualité ou de VRAM par le seul nombre de tokens : un modèle et une fenêtre de contexte doivent être mesurés avant déclaration READY.

## Vérifications

73 nouveaux tests du transport, avec serveurs loopback éphémères et données synthétiques. Cas : fonctionnement via l'adaptateur existant, défaut désactivé, absence de socket avant autorisation, allowlists, pins et mutations concurrentes, inventaire sans approbation, redirections, variables proxy, codes HTTP expurgés, JSON/MIME/UTF-8/compression/taille, troncature et upgrade, annulation des deux phases, délai partagé, concurrence et arrêt définitif. Les tests proxy en cours de processus ne certifient pas à eux seuls toutes les configurations de proxy au démarrage de Node.

Suite complète : **515 tests / 33 fichiers réussis**, lint global, types et builds contracts/domain/API/web réussis. Aucun test d'inférence sur un vrai modèle à ce stade. Les changements de dates de release déjà en attente restent conservés hors de cette tranche.

## Activation suivante

1. Vérifier l'installation locale, le mode sans cloud, la version, l'interface d'écoute et l'inventaire vide avant tout téléchargement.
2. Choisir un seul modèle adapté au PC ; annoncer taille, licence et révision avant téléchargement. Un modèle local évite les frais d'API, pas le coût matériel ni les limites de capacité.
3. Évaluer en français sur données synthétiques, borner la fenêtre de contexte et la VRAM, enregistrer le nom/digest revus ; ne pas transformer une découverte en approbation.
4. Raccorder source d'autorité actuelle, Context Broker, prompts versionnés, audit append-only et arrêt utilisateur ; activer un seul agent pilote via le Core existant. Les autres profils restent PLANNED.

## Installation Windows vérifiée sur ce poste

L'archive CLI officielle **Ollama 0.33.3** a été installée dans `C:\Users\Aless\AppData\Local\Programs\Ollama`. Empreinte de l'archive vérifiée contre la publication officielle : `52cb36a62e7e501f61514f60212dec7117b6c098811357585e02fffe32d2fcd7`. Signature Authenticode de `ollama.exe` : `Valid`, organisation `Ollama Inc.`. Extraction d'environ 1,82 Gio ; pas d'application graphique, de service Windows, de tâche de démarrage ni de modification du PATH.

Une configuration nouvelle, sans écrasement d'un fichier existant, a été ajoutée dans `C:\Users\Aless\.ollama\server.json` avec `disable_ollama_cloud:true`. Pour la recette, le processus a aussi reçu `OLLAMA_NO_CLOUD=1` et `OLLAMA_HOST=127.0.0.1:11434` avant son lancement masqué. Ces variables n'ont pas été modifiées globalement.

Recette initiale réussie via le transport compilé d'IDA : inventaire **0 modèle** ; journal du daemon confirmant cloud désactivé et écoute sur **127.0.0.1:11434**, version **0.33.3**. Aucun prompt d'inférence à cette étape initiale. Le modèle téléchargé et les essais ultérieurs sont décrits séparément dans [LOCAL_MODEL_EVALUATION.md](LOCAL_MODEL_EVALUATION.md) ; ils ne rendent pas le provider READY dans la démo.

Matériel vérifié : RTX 3060 Laptop GPU, **6 144 Mio de VRAM** (5 838 Mio libres lors de la mesure). L'espace disque avant installation était d'environ 20,5 Gio : mesurer à nouveau avant de choisir les poids, ne pas lancer plusieurs téléchargements de modèles. L'archive d'installation vérifiée reste dans `tmp/ollama-install-v0.33.3`, ignorée par Git, et occupe environ 1,37 Gio.

Relance manuelle future dans un terminal local, avec `Ctrl+C` pour arrêter :

```powershell
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_HOST = '127.0.0.1:11434'
& 'C:\Users\Aless\AppData\Local\Programs\Ollama\ollama.exe' serve
```

Ne pas ajouter d'origine navigateur wildcard, de bind LAN, de tunnel ou de clé externe. L'API Ollama n'est pas le point d'entrée public d'IDA et ne remplace pas son Identity/Tool Gateway. La connexion du modèle pilote au chat reste à réaliser après les jalons de qualité et de sécurité.

## Sources officielles

Consultées le 8 septembre 2026 : [installation Windows et archive CLI](https://docs.ollama.com/windows), [inventaire](https://docs.ollama.com/api/tags), [chat](https://docs.ollama.com/api/chat), [mode sans cloud, écoute et contexte](https://docs.ollama.com/faq), [artefacts v0.33.3 et empreintes](https://github.com/ollama/ollama/releases/expanded_assets/v0.33.3). Aucun scraping d'interface utilisateur d'un fournisseur.
