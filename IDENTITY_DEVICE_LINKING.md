# IDA — Identity, sessions et Device Linking

## Statut

Cette architecture est **validée**. Les contrats, la politique d'accès et la première persistance locale des utilisateurs, memberships, instances, sessions et grants sont livrés. Aucun endpoint de login, credential, cookie, passkey, association d'instance ou service cloud n'est encore activé.

## État actuel

Le runtime local conserve un sélecteur technique fixé côté serveur. Sa session est représentée par `client_instances`, `identity_sessions` et `client_workspace_grants`, reliés structurellement au compte, à la membership et au workspace. Un résolveur relit ces données avant chaque requête `/v1` et échoue avec une erreur publique générique si le compte, la membership, l'instance, le grant ou la session n'est plus valide. Le résultat est profondément gelé puis associé à l'objet de requête dans une `WeakMap` privée non réassignable : routes, réponses, audits et IDA Core en tirent désormais leur acteur et leur workspace au lieu de consulter `demoContext`. `/v1/me` relit en plus le profil par cette paire user/workspace et projette rôle, grant client et permissions effectives sans exposer la preuve de session.

Cette session locale ne contient aucun token ni authenticator et son identifiant n'est accepté depuis aucun header, cookie, body ou query. Les permissions sont recalculées pour chaque action à partir du rôle, du grant de l'instance et du niveau demandé par l'outil. Elle constitue une garde de migration et de scope, pas une authentification humaine ; IDA ne doit toujours pas être exposée hors boucle locale avec des données réelles.

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

La tranche locale livre uniquement les lignes marquées comme telles. Les credentials et parcours de compte restent futurs et feront l'objet de migrations de production versionnées.

| Entité | Données minimales | Règles |
|---|---|---|
| `User` / `Membership` | identifiants, statut, rôle et workspace | **Livré localement :** statuts contrôlés ; une suspension est relue à la requête suivante |
| `UserEmail` | user, adresse normalisée, état de vérification | une adresse seule n'est jamais une preuve d'accès |
| `AuthIdentity` | user, type de credential, identifiant fournisseur | aucun secret brut ; fournisseur maintenu ou passkey privilégiée |
| `ClientInstance` | user, nom, surface, plateforme, état et révocation | **Livré localement sans clé :** principal d'une installation ou d'un profil client, distinct d'une session, du workspace et du matériel physique éventuel |
| `ClientLinkChallenge` | initiateur, code/nonce haché, expiration, état | usage unique, court, confirmé depuis une instance déjà autorisée |
| `Session` | user, client instance, expiration et révocation | **Livré localement sans token :** scope relu à chaque `/v1`; une vraie session ajoutera rotation et preuve hachée |
| `ClientWorkspaceGrant` | client instance, user, workspace, profil et état | **Livré localement :** FKs composées ; ne remplace pas la membership et peut seulement réduire les droits |
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

## Surface API cible, non active

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
| `packages/contracts/src/identity.ts` | **Livré :** schémas stricts d'instance, grant, session, step-up et contexte serveur |
| `packages/domain/src/identity-access-policy.ts` | **Livré :** intersection session, membership, instance, grant, permission et step-up ; le Tool Gateway reste obligatoire |
| `apps/api/src/identity-context.ts` | **Livré localement :** résolution fail-closed du contexte technique, gel et attachement par requête ; aucune preuve client |
| `apps/api/src/modules/identity/*` | cas d'usage, repositories, routes et audit |
| `apps/api/src/ida-core.ts` | **Livré localement :** reçoit le `RequestIdentityContext`, dérive acteur/workspace et recoupe chaque permission avant son Tool Gateway |
| `apps/api/src/app.ts` | **Livré localement :** hook global, contexte attaché, scopes issus de la requête et permissions par action ; futur plugin sans logique de credential dans les routes métier |
| `apps/api/src/database.ts` | **Livré localement :** tables additives et jointure de contexte ; futur repository Identity dédié |
| `apps/web/src/api.ts` | client de session sans token persistant dans le stockage Web |
| `apps/web/src/App.tsx` | écran compte/appareils, révocation et association explicite |
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
8. Avant les passkeys et le Device Linking, le PC hôte peut recevoir le verrou local transitoire défini par `docs/adr/0004-local-owner-lock-and-session.md` : passphrase dérivée, session opaque et aucune exposition réseau.

Cette validation a autorisé les contrats, politiques, tables locales, résolveur, contexte par requête et tests désormais livrés. Elle n'active ni login, credential, endpoint de compte, cookie, passkey, liaison d'instance ou service cloud réel ; le sélecteur `demoContext` reste uniquement une donnée technique de seed/mode locale jusqu'à leur livraison par tranches vérifiées.
