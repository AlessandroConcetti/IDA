# Domotique — compatibilité, limites et prochaines étapes

**Mise à jour du 12 septembre 2026 :** le pilote READ est enregistré dans le Core, avec statut authentifié, transport HTTPS épinglé, coffre Windows DPAPI et commande de lecture volontaire depuis IDA Home. L'installation réelle reste bloquée avant HTTPS vérifié, coffre utilisable, token enregistré et lampe désignée. Le statut expose désormais ces prérequis indépendamment, sans contacter Home Assistant. Voir [contrat et configuration livrés](VOICE_HOME_CONNECTIONS.md) et [OpenAPI du pilote](openapi/home-device-pilot.yaml). Aucun contrôle physique n'est activé.

Vérification documentaire : **9 septembre 2026**. L’utilisateur a fourni l’adresse exacte de son instance. Une requête GET sans credential à cette adresse a reçu **HTTP 200**, avec le titre « Home Assistant ». L’interface est joignable depuis le PC ; cela ne prouve pas l’accès authentifié à l’API ou la présence d’appareils. Aucun compte, état d’appareil ou service domotique n’a été consulté.

L’adresse fournie utilise HTTP. Aucun token n’a été envoyé. Avant une lecture réelle : définir un trajet protégé (HTTPS correctement vérifié ou tunnel chiffré), un credential serveur dédié et révocable, puis une lampe pilote autorisée. L’adresse privée reste dans la configuration locale et la conversation, pas dans le code versionné. Aucun changement réseau, certificat, permission ou association d’appareil n’a été effectué.

## Ce qui est livré maintenant

Dans l’environnement IDA Home existant, la section Domotique consulte les prérequis locaux du Core. « Lire l'état de ma lampe » effectue uniquement une lecture autorisée après préparation complète ; pas de bouton de connexion fictif ni de champ de credential dans le navigateur.

`apps/api/src/smart-home-read.ts` définit `SmartHomeReadProvider` et un adaptateur Home Assistant : cible lampe unique, GET ciblé, validation de l’identité de la réponse et de son horodatage, projection bornée, erreurs génériques sans données brutes. `home-device.ts` le raccorde au Tool Gateway `HOME / READ`, à l'audit et à la revalidation de session/workspace. `home-assistant-transport.ts` porte le transport HTTPS privé épinglé ; le credential est résolu uniquement côté serveur au clic autorisé. Routes : `GET /v1/home/device/status` et `POST /v1/home/device/read`. Aucun agent autonome, inventaire global ou contrôle physique.

### Diagnostic local indépendant

Préparation opérateur complémentaire : [accès privé hors domicile](PRIVATE_WEB_ACCESS.md) et `scripts/check-private-access.ts`. Le trajet téléphone–IDA et le trajet IDA–Home Assistant ont des prérequis séparés ; un VPN sur le téléphone ne sécurise pas à lui seul le second trajet. Aucun port, proxy ou changement HA n'est activé. Présence de coffre, déchiffrement possible et token accepté restent trois preuves distinctes.

Le champ `state` conserve son comportement historique. `prerequisites`, facultatif dans le contrat pour accepter un ancien serveur, est fourni par le serveur mis à jour :

| Champ | Valeurs | Ce qui est réellement vérifié |
|---|---|---|
| `configuration` | `CONFIGURED`, `REQUIRED`, `INVALID` | Présence et forme de l'origine/adresse privée épinglée ; pas sa joignabilité. |
| `tls` | `CONFIGURED`, `REQUIRED` | HTTPS demandé et vérification des certificats non désactivée ; aucun handshake lors du statut. |
| `target` | `CONFIGURED`, `REQUIRED` | Identifiant de lampe syntaxiquement accepté ; pas l'existence de la lampe. |
| `credential` | `STORED`, `MISSING`, `UNAVAILABLE`, `NOT_CHECKED` | Métadonnées du fichier chiffré seulement. Jamais le token ou sa validité. |
| `verification` | `NOT_PERFORMED` | Le statut ne contacte jamais Home Assistant. |

Les trois manques TLS/cible/credential peuvent être affichés ensemble. Le mode désactivé ou non verrouillé et l'absence de binding ne consultent pas le coffre (`NOT_CHECKED`). Un autre workspace est refusé avant cette inspection. Une révocation pendant le diagnostic empêche la livraison de la checklist. Aucun chemin, origine, identifiant HA ou secret ne figure dans ce résultat.

**Limite du coffre :** `STORED` ne qualifie ni le déchiffrement ni le helper PowerShell. La politique `Restricted` constatée sur le poste empêche actuellement l'exécution des helpers `.ps1`. Cette tranche ne modifie aucune politique et ne la contourne pas. Un mécanisme autorisé doit être qualifié avant connexion réelle. Le nom donné à un token dans Home Assistant n'est pas sa valeur et ne signifie pas que le coffre IDA le contient.

Tests : états ON/OFF/UNKNOWN/UNAVAILABLE distincts, requête ciblée, réponses invalides et mauvaise cible, champs sensibles omis, HTTP/redirections refusés, binding capturé, audit/permissions/révocation, panne sans cache ni retry implicite, quotas/concurrence et annulation réseau. Diagnostic : prérequis indépendants, credential absent/indisponible, mode fermé, révocation pendant inspection et absence de secret/réseau. Les fixtures sont synthétiques ; ces vérifications ne prouvent pas une connexion à la maison réelle.

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

## Extension future au-delà du pilote

Les routes du pilote sont publiées dans son OpenAPI. Restent à concevoir : liste des seuls appareils autorisés et lecture d'un appareil IDA opaque. Aucune route de proxy libre, URI de hub ou `entity_id` accepté depuis une commande IA. Une éventuelle découverte globale exige un consentement distinct et une projection bornée : l'appel REST HA `/api/states` retourne tous les états, pas seulement les lampes. La sélection manuelle d'une lampe reste le chemin minimal.

Le serveur résout déjà connexion/secret/cible depuis le workspace et exécute `read_home_device` via le Gateway. Le port de protocole ne fait pas lui-même l'authentification : son contrôleur `home-device.ts` assure les barrières avant/après lecture. Les données, rétention, exclusions et responsabilités futures du `Home Safety Steward` sont définies dans l’ADR ; aucun nouvel agent n’est enregistré.

La section précédente sur les dates de release reste en pause. Musique, Social Hub et les autres modules sont préservés ; cette préparation ne retarde pas leur utilisation.
