# IDA — Identity, sessions et Device Linking

## Statut

Cette architecture est **validée**. Les contrats, la politique d'accès et la première persistance locale des utilisateurs, memberships, instances, sessions et grants sont livrés. Le verrou transitoire du propriétaire est également disponible côté backend et avec un premier écran dans le mode explicitement opt-in `LOCAL_LOCK`. Il ne constitue pas encore l’identité réseau ou multi-appareils cible : aucun compte distant, passkey, association d’instance, récupération distante ou service cloud n’est activé, et le parcours setup/unlock/lock doit encore passer une recette navigateur.

## État actuel

Le runtime local possède deux profils. `LOCAL_DEMO`, utilisé par défaut, conserve un sélecteur technique fixé côté serveur. `LOCAL_LOCK`, activable avec `IDA_IDENTITY_MODE=LOCAL_LOCK`, remplace ce sélecteur par une passphrase locale dérivée et une session opaque. Dans les deux cas, la session d’identité est représentée par `client_instances`, `identity_sessions` et `client_workspace_grants`, reliés structurellement au compte, à la membership et au workspace. Un résolveur relit ces données avant chaque requête métier `/v1` et échoue avec une erreur publique générique si le compte, la membership, l'instance, le grant ou la session n'est plus valide. Le résultat est profondément gelé puis conservé dans une `WeakMap` privée non réassignable : routes, réponses, audits et IDA Core en tirent leur acteur et leur workspace au lieu de consulter `demoContext`. `/v1/me` relit en plus le profil par cette paire user/workspace et projette rôle, grant client et permissions effectives sans exposer la preuve de session.

En `LOCAL_DEMO`, cette session technique ne contient aucun token ni authenticator et son identifiant n'est accepté depuis aucun header, cookie, body ou query. En `LOCAL_LOCK`, le serveur ne persiste que le digest du jeton opaque et le navigateur reçoit un cookie `HttpOnly`, `SameSite=Strict`, sans secret dans le stockage JavaScript. Les endpoints bootstrap exacts sont `GET /v1/auth/status`, `POST /v1/auth/setup` et `POST /v1/auth/unlock`; `POST /v1/auth/lock` est un nettoyage idempotent qui révoque la session si elle existe et efface toujours le cookie sous contrôle Host/origine. Les permissions sont toujours recalculées pour chaque action à partir du rôle, du grant de l'instance et du niveau demandé par l'outil. Ce verrou reste local et transitoire : le serveur refuse une écoute hors boucle locale, et IDA ne doit toujours pas être exposée sur le LAN ou Internet avec ce profil.

## Position dans le Kernel

```text
Client Windows / macOS / Web-PWA desktop ou mobile / iOS / Android / TV
                              │
                  preuve de session d'instance
                              ↓
                    Identity Session Gateway
                              ↓
 RequestContext(user, workspace, membership, clientInstance, session)
                              ↓
             API → IDA Core → Tool Gateway → Modules
```

L'Identity Session Gateway authentifie la session et construit un `RequestContext` serveur immuable. Le Core, les routes et les outils ne reçoivent jamais un `userId`, `workspaceId`, rôle ou `deviceId` choisi dans le corps ou la query du client.

L'ordre de contrôle cible est :

1. session valide et non expirée ;
2. instance cliente active et non révoquée ;
3. utilisateur actif ;
4. membership actif dans le workspace ;
5. restrictions propres à l'instance cliente ;
6. permission de l'outil et scope de la ressource ;
7. réauthentification renforcée et approbation si requises.

Une authentification réussie n'élève donc jamais automatiquement un appareil à tous les privilèges du compte.

## Modèle de données minimal

La tranche locale livre uniquement les lignes marquées comme telles. Le credential `LOCAL_LOCK` est borné à l’hôte local ; les credentials et parcours de compte réseau restent futurs et feront l'objet de migrations de production versionnées.

| Entité | Données minimales | Règles |
|---|---|---|
| `User` / `Membership` | identifiants, statut, rôle et workspace | **Livré localement :** statuts contrôlés ; une suspension est relue à la requête suivante |
| `UserEmail` | user, adresse normalisée, état de vérification | une adresse seule n'est jamais une preuve d'accès |
| `AuthIdentity` | user, type de credential, identifiant fournisseur | aucun secret brut ; fournisseur maintenu ou passkey privilégiée |
| `ClientInstance` | user, nom, surface, plateforme, état et révocation | **Livré localement sans clé :** principal d'une installation ou d'un profil client, distinct d'une session, du workspace et du matériel physique éventuel |
| `ClientLinkChallenge` | initiateur, code/nonce haché, expiration, état | usage unique, court, confirmé depuis une instance déjà autorisée |
| `Session` | user, client instance, expiration et révocation | **Livré localement :** scope relu à chaque `/v1`; `LOCAL_DEMO` reste sans token, tandis que `LOCAL_LOCK` ajoute une session opaque rotative dont seul le digest est persisté |
| `ClientWorkspaceGrant` | client instance, user, workspace, profil et état | **Livré localement :** FKs composées ; ne remplace pas la membership et peut seulement réduire les droits |
| `LocalOwnerCredential` | user, dérivé `scrypt`, sel, paramètres versionnés et temporisation | **Livré en `LOCAL_LOCK` :** aucune passphrase brute ou réversible ; un unique propriétaire local initialisable atomiquement |
| `LocalAuthSession` | session d’identité, digest du jeton, expirations et dernière activité | **Livré en `LOCAL_LOCK` :** jeton brut absent de la base et révocation immédiate au verrouillage ou à l’invalidation du contexte |
| `IdentitySecurityEvent` | événement borné, résultat et horodatage | **Livré en `LOCAL_LOCK` :** journal technique sans passphrase, cookie, jeton, IP, user-agent ou payload libre |
| `StepUpChallenge` | session, action sensible, expiration | lié à l'action et non réutilisable |
| `RecoveryMethod` | user, méthode, état, date | secrets de récupération hachés et affichés une seule fois |

Les jetons sociaux, bancaires et providers restent des credentials d'intégration séparés. Lier un appareil ne donne jamais accès à leurs secrets.

## Flux cibles

### Création et connexion

- L'utilisateur crée son compte via une adresse vérifiée et une passkey privilégiée comme preuve forte.
- Le serveur crée le compte, le premier workspace et la membership `OWNER` de façon atomique.
- La session est attachée à une instance cliente enregistrée et à une preuve cryptographique ; aucun token durable ne réside dans `localStorage`.
- Sur le Web/PWA, la session utilise une liaison serveur et des cookies protégés ; l'accès dans le navigateur mobile reste disponible en parallèle de l'application native.
- Sur client natif, le credential appareil réside dans Keychain/Keystore ou le coffre Windows/macOS.

### Accès parallèle sur téléphone

Le navigateur Web/PWA et l'application native iOS ou Android accèdent au même compte, au même workspace, aux mêmes conversations et au même état fourni par le Core. Ils restent toutefois deux instances clientes distinctes : chaque instance reçoit son propre credential ou mécanisme de liaison et ses propres sessions. Révoquer la session ou l'instance Web/PWA ne révoque pas automatiquement l'application native, et réciproquement.

Le matériel physique peut être regroupé pour l'affichage (« cet iPhone », par exemple), mais ce regroupement n'est jamais l'unique frontière d'autorisation. Les permissions restent évaluées pour l'instance, la session, la membership, le workspace et l'action demandée. Ni le navigateur ni l'application native ne peut transférer silencieusement ses privilèges à l'autre.

### Association d'un appareil

1. Une instance déjà autorisée demande un challenge court.
2. La nouvelle instance présente sa clé publique et scanne un QR code ou saisit le code temporaire.
3. L'instance existante affiche précisément nom, plateforme, moment et permissions proposées.
4. L'utilisateur confirme explicitement.
5. Le serveur consomme le challenge une seule fois et crée un grant minimal.
6. Le nouvel appareil reçoit sa propre session révocable, jamais une copie de la session existante.

Un e-mail peut notifier ou aider à la récupération, mais ne peut pas autoriser seul un appareil.

### Révocation

Révoquer une instance invalide immédiatement ses sessions, refresh tokens et challenges, sans supprimer le compte ni révoquer les autres instances. Les commandes hors ligne de cette instance sont refusées à leur retour. Une révocation globale reste disponible au propriétaire.

### Action sensible

Finance, publication, changement de sécurité, export complet, connexion sociale ou contrôle physique pourront imposer une réauthentification récente. Cette preuve est liée au hash de l'action exacte, à la session, à l'instance, au workspace et à une expiration courte ; elle ne remplace ni le Tool Gateway ni l'approbation métier.

## Local-first et multi-appareils

Le premier profil recommandé reste `LOCAL_OWNER` : un Core autoritaire tourne sur un PC Windows ou un Mac approuvé. Les autres appareils rejoignent ce Core par boucle locale, réseau privé ou tunnel authentifié. Ils ne lisent jamais directement PGlite ou un SSD.

Un service cloud n'est pas nécessaire pour le premier compte local. Les fonctions e-mail, récupération distante et accès hors domicile demanderont cependant un canal minimal ou un futur profil hébergé. Aucune synchronisation multi-writer n'est introduite : un workspace conserve un seul Core autoritaire. Le navigateur mobile et l'application native ne synchronisent donc pas directement leurs bases ou mémoires ; ils retrouvent le même état en interrogeant ce Core.

L'accès depuis le navigateur d'un téléphone exige une origine HTTPS stable et authentifiée, y compris sur le réseau local ou via un tunnel privé. L'adresse de développement `http://127.0.0.1` reste limitée à la machine hôte : exposer simplement `http://<ip-du-pc>` ne fournit ni la frontière de sécurité, ni le contexte sécurisé nécessaire aux passkeys, à la PWA et aux permissions navigateur. Le déploiement Web/PWA privilégiera une origine commune avec l'API afin de garder cookies et protection CSRF simples et vérifiables.

Une fois initialisé, ce verrou est persistant : la présence du credential force le mode `LOCAL_LOCK` à chaque démarrage, même si sa variable d’activation est ensuite absente ou repassée à `LOCAL_DEMO`. Ce comportement fail-safe évite de réactiver silencieusement la session technique. La route de statut reste passive et ne renouvelle pas à elle seule le délai d’inactivité.

## Surface API locale active en `LOCAL_LOCK`

```text
GET  /v1/auth/status
POST /v1/auth/setup
POST /v1/auth/unlock
POST /v1/auth/lock
```

`status`, `setup` et `unlock` sont les seuls points bootstrap sans session dans ce mode. `lock` reste volontairement idempotent afin d’effacer un cookie absent, expiré ou déjà révoqué ; il conserve les contrôles Host/origine mais n’accorde aucun accès. Toutes les routes métier exigent le cookie de session valide, puis les contrôles de membership, instance, grant, ressource et outil. Cette surface est un contrat local provisoire, pas une API de compte distante ; le premier écran `LocalAccessGate` la consomme sans monter les vues métier avant confirmation serveur.

## Surface API multi-appareils cible, non active

```text
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/logout
POST /v1/auth/step-up
GET  /v1/sessions
DELETE /v1/sessions/:sessionId

GET  /v1/client-instances
POST /v1/client-links
POST /v1/client-links/:challengeId/complete
POST /v1/client-links/:challengeId/confirm
DELETE /v1/client-instances/:clientInstanceId
PATCH /v1/client-instances/:clientInstanceId/grants
```

Les noms sont indicatifs. L'interface pourra regrouper plusieurs instances sous un appareil lisible, mais l'API autorisera toujours chaque instance séparément. Chaque mutation aura un schéma strict, des limites de débit, une idempotence, une protection anti-rejeu et un audit redacted.

## Fichiers et composants concernés lors de l'implémentation

| Zone | Évolution future |
|---|---|
| `packages/contracts/src/identity.ts` | **Livré :** schémas stricts d'instance, grant, session, step-up, contexte serveur et verrou local |
| `packages/domain/src/identity-access-policy.ts` | **Livré :** intersection session, membership, instance, grant, permission et step-up ; le Tool Gateway reste obligatoire |
| `apps/api/src/identity-context.ts` | **Livré localement :** résolution fail-closed du contexte technique ou de la session opaque `LOCAL_LOCK`, gel et attachement par requête |
| `apps/api/src/local-auth.ts` | **Livré en mode opt-in :** dérivation du credential, setup/unlock/lock, session opaque, cookie et expirations |
| `apps/api/src/modules/identity/*` | cas d'usage, repositories, routes et audit |
| `apps/api/src/ida-core.ts` | **Livré localement :** reçoit le `RequestIdentityContext`, dérive acteur/workspace et recoupe chaque permission avant son Tool Gateway |
| `apps/api/src/app.ts` | **Livré localement :** hook global, endpoints bootstrap bornés, contexte attaché, contrôles Host/Origin et permissions par action ; aucune logique de credential dans les routes métier |
| `apps/api/src/database.ts` | **Livré localement :** tables additives, credential local, digest de session, événements de sécurité et jointure de contexte ; futur repository Identity dédié |
| `apps/api/src/runtime-config.ts` / `server.ts` | **Livré :** mode explicite et refus de démarrer en écoute hors boucle locale |
| `apps/web/src/api.ts` | futur client de session sans token persistant dans le stockage Web |
| `apps/web/src/App.tsx` | futurs écrans setup/unlock, puis compte/appareils, révocation et association explicite |
| `SECURITY.md` | threat model, cookies/CSRF, stockage natif, récupération et incidents |
| `docs/openapi/*` | contrats uniquement lors de leur livraison réelle |

Ce découpage est cible : il ne justifie pas une réécriture massive des fichiers actuels.

## Tests d'architecture obligatoires

- utilisateur A incapable de lire ou modifier les workspaces de B ;
- session absente, invalide, expirée, révoquée ou rejouée refusée ;
- appareil inconnu ou révoqué refusé immédiatement ;
- challenge expiré, déjà consommé, deviné ou confirmé par le mauvais compte refusé ;
- nouvelle instance limitée aux grants explicitement accordés ;
- navigateur Web/PWA et application native du même téléphone possédant des sessions distinctes et révocables indépendamment ;
- révocation d'une instance sans impact automatique sur les autres ;
- membership révoquée après connexion prise en compte à la requête suivante ;
- instance authentifiée incapable de contourner Tool Gateway, approbations ou scope ;
- step-up lié à un autre payload/workspace/session/instance refusé ;
- secrets, codes et tokens absents des logs, erreurs et projections client ;
- cache ou commande hors ligne revalidé par le Core avant mutation.

## Décisions validées pour la première tranche

1. Le compte utilise une adresse e-mail vérifiée et privilégie une passkey comme preuve forte ; une adresse seule n'autorise jamais l'accès.
2. L'association initiale d'une nouvelle instance utilise un QR code ou code temporaire, puis une confirmation explicite depuis une instance déjà autorisée.
3. Le premier accès multi-appareil passe par un réseau privé ou tunnel authentifié, sans imposer une synchronisation cloud complexe.
4. La récupération cible combine des codes hors ligne et une autre instance autorisée, sans porte dérobée fondée sur la seule adresse e-mail.
5. Les grants initiaux sont les profils bornés `TRUSTED`, `LIMITED` et `VIEW_ONLY` ; ils peuvent uniquement réduire les permissions de la membership.
6. Windows est le premier hôte `LOCAL_OWNER`; le même profil doit être déployable sur macOS sans dupliquer le Core.
7. Sur téléphone, le Web/PWA et l'application native iOS ou Android restent disponibles en parallèle avec des sessions révocables séparément.
8. Avant les passkeys et le Device Linking, le PC hôte dispose en mode opt-in du verrou local transitoire défini par `docs/adr/0004-local-owner-lock-and-session.md` : passphrase dérivée, session opaque et aucune exposition réseau.

Cette validation a autorisé les contrats, politiques, tables locales, résolveurs, contexte par requête et tests désormais livrés. Le mode opt-in `LOCAL_LOCK` active uniquement le credential propriétaire local, les quatre endpoints de verrou, le cookie de session associé et leur premier parcours UI ; `LOCAL_DEMO` reste le défaut. Elle n'active ni compte réseau, passkey, liaison d'instance, récupération distante, service cloud réel ou exposition multi-appareils. Le prochain incrément Identity doit vérifier et polir le parcours UI local dans le navigateur avant toute activation par défaut ; les passkeys/WebAuthn et le Device Linking restent des tranches futures soumises au jalon réseau de `SECURITY.md`.
