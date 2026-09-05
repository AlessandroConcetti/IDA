# ADR 0004 — Verrou local propriétaire et session opaque

## Statut

Décision **implémentée côté backend en mode opt-in**. `LOCAL_DEMO` reste le profil par défaut ; l’activation produit et le parcours UI de setup/unlock ne sont pas encore livrés.

## Contexte

Le runtime `LOCAL_DEMO` possède un contexte Identity persistant et des autorisations par requête, mais aucune preuve humaine : son sélecteur de session reste compilé côté serveur. Ajouter directement passkeys, e-mail, cloud et association multi-appareils créerait une surface trop large avant que la démo française et le Core local soient stabilisés.

Un verrou local intermédiaire est donc utile sur le PC hôte. La tranche backend protège l’accès à l’API et prépare le futur écran de verrouillage sans prétendre être l'authentification multi-appareils finale. Elle n'autorise aucune exposition LAN ou Internet.

## Décision

Le mode `LOCAL_LOCK`, activé explicitement avec `IDA_IDENTITY_MODE=LOCAL_LOCK`, livre le parcours backend `setup → locked → unlock → lock/logout` pour un unique propriétaire local. Ses points d’entrée sont `GET /v1/auth/status`, `POST /v1/auth/setup`, `POST /v1/auth/unlock` et `POST /v1/auth/lock` :

- une passphrase choisie par l'utilisateur est dérivée avec `scrypt`, un sel aléatoire propre au credential et des paramètres versionnés ; aucune passphrase brute ou réversible n'est stockée ;
- le profil initial utilise `N=2^17`, `r=8`, `p=1`, une clé de 32 octets et une limite mémoire explicite de 256 Mio ; les paramètres sont versionnés afin de préparer une évolution contrôlée ;
- la comparaison du résultat dérivé utilise une primitive à temps constant ; les erreurs ne révèlent ni existence du compte, ni état du credential ;
- après déverrouillage, le serveur génère un identifiant de session opaque avec au moins 256 bits aléatoires ; seul son digest est persisté côté serveur ;
- le navigateur reçoit uniquement un cookie de session `HttpOnly` et `SameSite=Strict`, jamais un JWT, refresh token ou secret dans `localStorage`/`sessionStorage` ; le profil local HTTP utilise `ida_local_session` ;
- en HTTPS, le cookie est `Secure`, sans attribut `Domain`, avec le préfixe `__Host-`; le profil HTTP de développement reste strictement lié à la boucle locale et ne peut pas être exposé sur le réseau ;
- les mutations contrôlent aussi l'origine et les métadonnées Fetch/CSRF ; `SameSite` reste une défense supplémentaire, pas l'unique barrière ;
- une nouvelle session est créée après setup ou unlock et les sessions locales antérieures de l’instance sont révoquées ; la session possède une expiration absolue de huit heures, une expiration d’inactivité glissante de trente minutes et peut être révoquée immédiatement par verrouillage ; consulter simplement `status` ne renouvelle pas l'inactivité ;
- les tentatives d'unlock sont limitées et temporisées côté serveur, sans verrouillage permanent exploitable pour provoquer un déni de service ;
- les opérations coûteuses de setup/unlock sont sérialisées dans l’unique runtime local ; l’émission de session vérifie transactionnellement que compte, instance, membership et grant sont toujours actifs, sinon elle échoue sans fournir de cookie ;
- les logs ne contiennent ni passphrase, dérivé, sel complet, cookie, identifiant brut de session ou contenu de formulaire sensible.

Le `Identity Session Gateway` remplace alors le sélecteur compilé, résout la session opaque et attache le même `RequestIdentityContext`. Les routes métier, l'IDA Core, les scopes et le Tool Gateway ne changent pas de modèle d'autorisation.

`status`, `setup` et `unlock` sont les seules routes bootstrap sans session. `lock` est un nettoyage idempotent : sous contrôle Host/origine, il révoque une session encore valide et efface le cookie même s’il est absent, expiré ou déjà révoqué. Toutes les routes métier `/v1` exigent une session valide et repassent par la politique Identity. Le serveur refuse de démarrer sur un hôte autre que `127.0.0.1`, `localhost` ou `::1`; les mutations rejettent les origines étrangères et les requêtes signalées `cross-site`. L’interface de setup/unlock, la récupération et l’activation par défaut restent hors de cette tranche.

Une fois le credential initialisé, sa présence force `LOCAL_LOCK` au démarrage. Une variable absente ou une configuration repassée à `LOCAL_DEMO` ne peut donc pas restaurer silencieusement la session technique.

## Limites assumées

- Ce verrou protège surtout contre l'accès opportuniste via l'interface ; il ne protège pas les données contre un attaquant qui contrôle déjà le compte Windows, le processus IDA ou le disque déchiffré.
- Une passphrase n'est pas résistante au phishing et ne devient pas le credential de liaison d'un iPhone, d'un Mac, d'Android ou du Web distant.
- Aucune récupération par la seule adresse e-mail n'est admise. Avant données réelles, le parcours de récupération et la sauvegarde chiffrée doivent être décidés et testés séparément.
- Aucun « se souvenir de moi » durable, biométrie maison, question secrète, secret codé en dur ou contournement de support n'est ajouté.
- Le runtime reste limité à la boucle locale (`127.0.0.1`, `localhost` ou `::1`) jusqu'au jalon réseau de `SECURITY.md`.
- Le cookie HTTP est réduit à `Path=/v1`, mais un cookie navigateur n’est pas isolé par port. Une origine dédiée ou intégrée et HTTPS restent obligatoires avant données réelles ; le profil loopback n’est pas une frontière contre un autre processus local.

## Évolution multi-appareils

Les passkeys/WebAuthn restent la cible privilégiée pour les clients Web/PWA et natifs, car une authentification cryptographique liée au vérificateur peut résister au phishing. Chaque navigateur ou application conserve néanmoins sa propre `ClientInstance`, sa propre session et son grant révocable. Le verrou local ne remplace ni le Device Linking, ni le step-up lié à une action sensible.

## Vérification de la tranche backend

Les tests automatisés livrés couvrent le setup unique, le refus d’une passphrase invalide, la temporisation des échecs, l’unlock, la rotation et le digest des sessions, les attributs du cookie, le verrouillage et la révocation, les expirations, la fixation de session, les cookies ambigus, les requêtes cross-site, l’hôte étranger, la réduction des permissions et la révocation d’une instance. Ils vérifient également que le profil local refuse une écoute hors boucle locale.

Avant activation par défaut ou utilisation avec des données personnelles réelles, il reste à livrer et vérifier le parcours UI accessible, la récupération, le benchmark sur les machines cibles, la migration/rehash des paramètres, les protections de distribution desktop et une revue de sécurité proportionnelle au risque. Ce jalon ne vaut pas autorisation d’exposition réseau.

## Références de sécurité

- [OWASP — Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [NIST SP 800-63B-4 — Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
