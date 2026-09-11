# Voix, cerveau local et Home Assistant — 10 septembre 2026

## Ce qui change

Le dialogue local existant est utilisable directement depuis le robot Immersive, sans quitter sa scène. `LocalDialogue` ajoute la même commande vocale partout où il est utilisé (IDA, Research, Travel, Music, Immersive). Les chemins texte restent complets. Aucun deuxième Core, fournisseur implicite, agent autonome ou nouvelle dépendance.

La section Domotique de l'environnement IDA Home consomme désormais les routes authentifiées du Core. Elle distingue configuration prête et lecture réellement reçue ; aucun état fictif, polling, scan, inventaire complet ou commande d'appareil.

## Voix : activation, données, arrêt

1. « Vérifier la dictée locale » inspecte la capacité française du navigateur, sans microphone et sans téléchargement.
2. « Parler à IDA » est le seul geste ouvrant le micro. Il exige `SpeechRecognition.available({langs:["fr-FR"], processLocally:true})` disponible et `processLocally=true` vérifié avant `start()`. Aucun moteur distant de secours. API expérimentale : tous les navigateurs ne la proposent pas.
3. Une capture dure au plus 25 secondes. Résultat final affiché pour relecture ; « Ajouter cette dictée » ajoute au brouillon sans écraser ni tronquer un texte existant. L'envoi à l'IA reste un clic distinct.
4. « Écouter la réponse » lit uniquement une réponse réussie, avec une voix française déclarée `localService=true`. Aucun démarrage automatique, aucune voix distante de secours. L'absence de pack ou voix locale est affichée.
5. Arrêt explicite, fermeture, démontage/verrouillage, page masquée ou navigation de page arrêtent capture/lecture. La capture ne redémarre pas. Une erreur d'arrêt moteur ne casse pas le nettoyage.

Pas d'enregistrement audio par IDA, stockage local/session, mémoire durable, audio dans les prompts ou logs, caméra, mot de réveil, analyse biométrique ou motion tracking. Le transcript ne quitte l'appareil qu'après l'envoi explicite au serveur IDA local. Les garanties `processLocally` et `localService` reposent sur le contrat du navigateur/OS ; elles ne sont pas une attestation d'egress du système. Le robot est toujours une vidéo décorative, sans synchronisation des lèvres.

Sources : [dictée sur l'appareil](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally), [vérification des packs](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static), [voix locale](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService).

## Cerveau

Réutilisation exacte du chemin [LOCAL_DIALOGUE](LOCAL_DIALOGUE.md) : Core → Registry → Router → adapter Ollama → Qwen local. Dialogue temporaire, pas d'accès aux fichiers/Care/domotique, ni de commande exécutée par la réponse. Le volet robot ne court-circuite ni le verrou ni les permissions. Double soumission protégée par verrou synchrone ; annulation et erreurs distinctes de la réponse du modèle.

Le serveur actuel utilise LOCAL_LOCK ; le verrou a été initialisé côté utilisateur depuis la livraison précédente. Il faut déverrouiller normalement IDA. Aucun credential n'est récupéré dans la conversation, aucune session technique substituée.

## Home Assistant : contrat runtime

- `GET /v1/home/device/status` : `HOME / READ`, aucune requête vers le hub ni déchiffrement. États `DISABLED`, `CONNECTION_REQUIRED`, `TLS_REQUIRED`, `TARGET_REQUIRED`, `SECRET_REQUIRED`, `CONFIGURED`. Le dernier signifie « prérequis locaux présents », pas « token valide » ni « lampe connectée ».
- `POST /v1/home/device/read`, corps strict `{ "consent": true }`, limite 512 octets : une seule lampe liée côté serveur au workspace. Aucune URL, cible, credential ou workspace accepté du client.
- Résultat : `{state: ON|OFF|UNKNOWN|UNAVAILABLE, observedAt, providerUpdatedAt}`. Erreur de connexion ≠ OFF. L'horodatage HA est celui du dernier changement connu, pas une preuve de joignabilité actuelle.
- Identity, membership/session/instance, Gateway `read_home_device`, binding de workspace et revalidation après déchiffrement/lecture/audit. Audit préalable obligatoire, résultat livré après audit final et revalidation. Journaux : action, IDs techniques IDA, résultat du contrôle, jamais état domestique, URL, entité HA, attributs ou token.
- Aucun état serveur conservé ni cache ; résultat frontend purgé après 60 secondes, masquage, fermeture ou nouvelle lecture. Audit append-only selon le mécanisme existant du workspace ; sa rétention globale reste celle du journal existant (pas de purge silencieuse ajoutée).
- Maximum 30 tentatives horaires, une en vol. Timeout total 12 secondes, transport 10 secondes, déchiffrement 5 secondes ; abandon déconnexion client, aucun retry.

Le transport natif HTTPS n'utilise pas de proxy global, impose le certificat/hostname d'origine, épingle une IPv4 privée RFC1918 configurée côté serveur, ne résout pas le DNS et refuse les redirections, autres chemins/protocoles, credentials/query/fragment dans l'URL, réponses non JSON/incomplètes/>64 Kio. Il refuse aussi `NODE_TLS_REJECT_UNAUTHORIZED=0`. Pas de certificat ignoré, scan LAN, exposition Internet ou ouverture de pare-feu.

## Configuration locale, sans secret dans le chat

Le lanceur `apps/api/src/local-preview.ts` charge `.data/home-assistant.json` (ignoré par Git) et utilise le workspace du verrou existant. Fichier strict, maximal 4 Kio ; clés uniquement `enabled`, `origin`, `address`, `entityId`.

Exemple illustratif à adapter, **pas une adresse de production** :

```json
{
  "enabled": true,
  "origin": "https://home-assistant.example.invalid",
  "address": "192.168.200.10",
  "entityId": "light.lampe_pilote"
}
```

L'adresse HTTP réellement fournie a été préparée uniquement dans la configuration privée : le runtime affiche `TLS_REQUIRED` et ne récupère ni n'envoie de token. Ne pas remplacer silencieusement son protocole ou supposer un port. Il reste à configurer un certificat HTTPS vérifiable et à désigner une lampe réelle. [HTTP/TLS Home Assistant](https://www.home-assistant.io/integrations/http/).

Le parcours prévu pour enregistrer volontairement un token dédié/révocable est `scripts/set-home-assistant-secret.ps1 -WorkspaceId <workspace_IDA>`. La saisie est masquée. Le script crée `.data/connector-secrets/<workspace>.home-assistant.dpapi`, protégé DPAPI CurrentUser et ACL du compte courant. Le serveur doit fonctionner sous le même compte Windows. Le helper de lecture passe le secret uniquement par un pipe mémoire borné, pas en argument, environnement ou log. Aucun token utilisateur n'a été enregistré ni déchiffré dans cette livraison.

**Blocage constaté le 11 septembre :** la politique Windows PowerShell de ce poste est `Restricted` et refuse l'exécution du helper `.ps1`. Le chiffrement d'une fixture synthétique a fonctionné sous le compte Windows, mais sa relecture par le helper est bloquée. L'intégration coffre reste donc **PREPARED / BLOCKED**, pas opérationnelle. Aucun `ExecutionPolicy Bypass` ni changement de politique n'a été effectué. Avant le token de la prochaine session, il faudra un helper autorisé/signé ou un mécanisme de coffre approuvé, puis qualifier son déchiffrement. Le contrôle `CONFIGURED` ne vérifie que la présence du fichier : un helper refusé produira une erreur fermée au clic, jamais une transmission non sécurisée.

Le script refuse d'écraser un credential existant. Rotation : désactiver le binding et redémarrer IDA, révoquer l'ancien token dans Home Assistant, retirer explicitement son seul fichier chiffré puis relancer la saisie. Aucun script n'actionne d'appareil. Le token HA peut être plus puissant que ce pilote READ ; la restriction est celle d'IDA, pas une réduction magique de ses pouvoirs côté fournisseur. [REST HA](https://developers.home-assistant.io/docs/api/rest/), [authentification HA](https://developers.home-assistant.io/docs/auth_api/).

La commande physique, les scènes, Alexa/Google directs et l'inventaire global restent hors de cette tranche. Utiliser les applications habituelles en repli. Gouvernance inchangée : contrôles déterministes, escalade au propriétaire ; aucun Home Safety Steward activé sans manifeste/évaluations. Le téléphone reste derrière le jalon HTTPS + identité d'appareil décrit dans SECURITY.md, aucun réseau exposé ici.

## Vérifications et limites

Contrôles unitaires voix sans matériel ; transport HA simulé sans réseau ; routes Fastify avec audit/permission/révocation/quota ; intégration LOCAL_LOCK dans une base éphémère uniquement. La fixture DPAPI synthétique vérifie le refus fermé lorsque la politique interdit les scripts ; ce résultat n'est pas une qualification du déchiffrement. Types Web/API et compilation vérifiés. Ces contrôles ne remplacent pas une recette micro/haut-parleur sur le navigateur cible ni une connexion authentifiée à la maison réelle. Voir le bilan daté de finalisation pour les commandes et résultats courants.
