# Domotique — compatibilité, limites et prochaines étapes

**Mise à jour du 10–11 septembre 2026 :** le pilote READ est désormais enregistré dans le Core, avec statut authentifié, transport HTTPS épinglé, coffre Windows DPAPI et commande de lecture volontaire depuis IDA Home. L'installation réelle reste bloquée avant HTTPS vérifié, token et lampe désignée. Voir [contrat et configuration livrés](VOICE_HOME_CONNECTIONS.md) et [OpenAPI du pilote](openapi/home-device-pilot.yaml). Les paragraphes « non enregistré » ci-dessous décrivent la préparation antérieure, désormais remplacée par ce pilote ; aucun contrôle physique n'est activé.

Vérification documentaire : **9 septembre 2026**. L’utilisateur a fourni l’adresse exacte de son instance. Une requête GET sans credential à cette adresse a reçu **HTTP 200**, avec le titre « Home Assistant ». L’interface est joignable depuis le PC ; cela ne prouve pas l’accès authentifié à l’API ou la présence d’appareils. Aucun compte, état d’appareil ou service domotique n’a été consulté.

L’adresse fournie utilise HTTP. Aucun token n’a été envoyé. Avant une lecture réelle : définir un trajet protégé (HTTPS correctement vérifié ou tunnel chiffré), un credential serveur dédié et révocable, puis une lampe pilote autorisée. L’adresse privée reste dans la configuration locale et la conversation, pas dans le code versionné. Aucun changement réseau, certificat, permission ou association d’appareil n’a été effectué.

## Ce qui est livré maintenant

Dans l’environnement IDA Home existant, une section **Domotique — Non connectée** permet de préciser temporairement son type d’installation et de voir la prochaine étape adaptée. Ce choix ne persiste pas, ne contacte personne et ne représente pas une autorisation. Pas de bouton de connexion fictif ni de champ de credential.

`apps/api/src/smart-home-read.ts` définit `SmartHomeReadProvider` et un adaptateur Home Assistant testable hors ligne : cible lampe unique, chemin GET ciblé, validation de l’identité de la réponse et de son horodatage, projection bornée, erreurs génériques sans données brutes. Ce code n’est **pas enregistré dans l’API ou le Tool Gateway**. Il ne contient ni transport HTTP, ni configuration, ni token. Il ne peut donc pas encore lire la maison réelle. Aucun endpoint ou agent actif n’a été ajouté.

Tests : états ON/OFF/UNKNOWN/UNAVAILABLE distincts, requête ciblée sans appel à la construction, réponses invalides et mauvaise cible, champs sensibles omis, entrées dangereuses refusées, binding capturé, panne sans cache ni retry implicite, annulation avant/pendant lecture, résultat tardif ignoré, guide client sans accès réseau/capteur au rendu. `AbortSignal` prépare l’abandon d’une lecture ; le futur transport devra aussi interrompre ses ressources réseau. Ce ne sont pas des tests de connexion ou de sécurité multi-workspace d’une intégration active.

## Possibilités officielles

| Option | Possibilité documentée | Conséquence pour IDA |
|---|---|---|
| Alexa Smart Home | Un service expose ses propres appareils à Alexa et reçoit ses directives. | Ce n’est pas un accès universel aux appareils de toutes les autres skills du compte. Ne pas promettre « Connecter Alexa et tout récupérer ». |
| Google Home APIs | Accès autorisé aux appareils compatibles, dont tiers ; SDK Kotlin/Android et Swift/iOS. | Piste pour clients natifs futurs. Aucun SDK Web/Node général équivalent identifié dans les docs consultées ; ne pas déduire un backend REST prêt à brancher. |
| Home Assistant | API REST authentifiée, lecture ciblée des états. | Passerelle envisageable pour le Core si une instance et des appareils compatibles existent. Ce n’est pas un import universel des comptes Alexa/Google. |
| API officielle fabricant | Dépend de la marque, du modèle, du protocole et des droits disponibles. | Alternative après identification d’une lampe pilote ; vérifier local/cloud, restrictions, coût et révocation avant choix. |

Sources des trois premières lignes : [architecture Amazon](https://developer.amazon.com/docs/alexaplus/smarthome/connect-your-cloud-with-addons.html), [Home APIs Google](https://developers.home.google.com/apis), [API REST Home Assistant](https://developers.home-assistant.io/docs/api/rest/).

Google demande un consentement par logement ; les permissions et le périmètre d’appareils doivent être gérés explicitement. La page consultée indique des applications non vérifiées limitées à 100 utilisateurs de test et une inscription Home Developer Console pas encore disponible : revalider l’état au démarrage du chantier natif, sans promettre une publication immédiate. [Permissions officielles](https://developers.home.google.com/apis/android/permissions).

Les intégrations Home Assistant pour [Alexa](https://www.home-assistant.io/integrations/alexa.smart_home/) et [Google Assistant](https://www.home-assistant.io/integrations/google_assistant/) exposent des entités Home Assistant vers ces assistants. Leur existence ne garantit pas le chemin inverse. Aucun abonnement cloud, changement d’association ou accès distant n’est décidé ici.

## Roadmap domotique, sans date artificielle

1. **Inventaire utilisateur** — marque/modèle d’une lampe, applications utilisées et présence éventuelle de Home Assistant. Aucune adresse privée, capture de QR d’association, identifiant de compte ou secret nécessaire à cette première décision.
2. **Home Assistant retenu** — installation en cours côté utilisateur. Vérifier ensuite cette lampe dans Home Assistant ; si elle n’est pas accessible, étudier son intégration officielle avant d’envisager une API fabricant. Aucun achat ni changement de ses associations existantes n’est autorisé implicitement.
3. **Connexion READ pilote** — hôte approuvé, credential serveur protégé, identité non-démo, autorisations d’appareil et workspace, Tool Gateway, audit borné, timeout, protection SSRF et révocation. Commencer par une seule lampe et uniquement lire son état. Les critères complets sont dans [ADR 0005](adr/0005-smart-home-read-pilot.md).
4. **Première commande explicite** — seulement après réussite du pilote, ajouter une commande lumineuse précise avec cible, effet et confirmation humaine. Tester refus, anti-rejeu, timeout incertain et résultat. Aucun contrôle de prise inconnue, serrure, caméra, chauffage ou routine globale.
5. **Autres appareils et clients** — étudier un à un les domaines, risques et protocoles ; mêmes règles serveur pour navigateur mobile et natifs. Google Home natif attend une conception d’exécution liée au Core, pas un second centre de commande. Alexa comme interface vocale serait une intégration distincte.

## Après l’installation de Home Assistant

Informations utiles : méthode d’installation (machine virtuelle, Container, boîtier ou autre), adresse exacte utilisée pour ouvrir l’interface, marque/modèle d’une lampe qui y apparaît. Fournir l’adresse sans identifiant, token, query string ou QR d’association. Aucun token n’est nécessaire à cette étape.

Le port dépend de la méthode/version/configuration : ne pas supposer `8123`. Le trajet réseau et la protection TLS seront examinés avant transmission d’un credential. Ne pas ouvrir de port de box, activer CORS pour IDA ou désactiver la vérification des certificats pour cette préparation. Une adresse loopback désigne la machine du Core, pas automatiquement la VM Home Assistant ; elle ne garantit pas non plus le chiffrement. [Configuration HTTP officielle](https://www.home-assistant.io/integrations/http/).

L’authentification Home Assistant est liée à un utilisateur ; un token longue durée peut avoir des pouvoirs dépassant ce pilote. Sa création et sa saisie sécurisée feront l’objet d’un parcours distinct, avec intervention humaine, stockage serveur et révocation. Ne pas copier le token dans ce chat, dans le frontend ou dans un fichier public. [Authentification officielle](https://developers.home-assistant.io/docs/auth_api/).

## Contrats futurs, non publiés

Routes candidates : lecture de l’état de connexion, liste des seuls appareils autorisés, lecture d’un appareil IDA opaque. Aucune route de proxy libre, URI de hub ou `entity_id` accepté depuis une commande IA. Ces routes ne sont pas ajoutées à l’OpenAPI tant que l’activation et le modèle de droits ne sont pas validés.

Le serveur résoudra connexion/secret/cible depuis le workspace et exécutera `read_home_device` via le Gateway. Le port actuel fait une traduction de protocole, **pas** l’authentification, l’audit ou le filtrage inter-workspaces : il ne faut pas le brancher directement à un contrôleur HTTP. Les futures données, rétention, exclusions et responsabilités du `Home Safety Steward` sont définies dans l’ADR ; aucun nouvel agent n’est enregistré.

La section précédente sur les dates de release reste en pause. Musique, Social Hub et les autres modules sont préservés ; cette préparation ne retarde pas leur utilisation.
