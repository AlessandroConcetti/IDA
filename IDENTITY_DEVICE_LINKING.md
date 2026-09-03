# IDA — Identity, sessions et Device Linking

## Statut

Cette architecture est **validée**. Sa première tranche de contrats, politique d'accès et tests d'architecture est livrée ; aucun endpoint d'authentification, compte réel, session persistée, association d'instance ou service cloud n'est encore activé.

## État actuel

Le runtime local possède déjà `users`, `workspaces` et `memberships`, mais chaque requête reçoit encore le même `demoContext` fixé côté serveur. `GET /v1/me` décrit ce profil `LOCAL_DEMO`; il n'existe ni adresse e-mail vérifiée, credential, session, device, association, révocation ou récupération de compte.

Cette base est utile pour les tests de scope, mais ne constitue pas une authentification et ne doit pas être exposée hors boucle locale avec des données réelles.

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

## Modèle de données cible minimal

Les noms définitifs seront fixés seulement lors d'une future tranche de migration versionnée ; la validation actuelle n'autorise encore aucune table.

| Entité | Données minimales | Règles |
|---|---|---|
| `UserEmail` | user, adresse normalisée, état de vérification | une adresse seule n'est jamais une preuve d'accès |
| `AuthIdentity` | user, type de credential, identifiant fournisseur | aucun secret brut ; fournisseur maintenu ou passkey privilégiée |
| `ClientInstance` | user, nom, surface, plateforme, clé publique, état, dernière activité | principal d'une installation ou d'un profil client, distinct d'une session, du workspace et du matériel physique éventuel |
| `ClientLinkChallenge` | initiateur, code/nonce haché, expiration, état | usage unique, court, confirmé depuis une instance déjà autorisée |
| `Session` | user, client instance, token haché, expiration, révocation | rotation, révocation immédiate, portée minimale |
| `ClientWorkspaceGrant` | client instance, workspace, capacités limitées | ne remplace pas la membership ; peut seulement réduire les droits |
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

1. Un appareil déjà autorisé demande un challenge court.
2. Le nouvel appareil présente sa clé publique et scanne un QR code ou saisit le code temporaire.
3. L'appareil existant affiche précisément nom, plateforme, moment et permissions proposées.
4. L'utilisateur confirme explicitement.
5. Le serveur consomme le challenge une seule fois et crée un grant minimal.
6. Le nouvel appareil reçoit sa propre session révocable, jamais une copie de la session existante.

Un e-mail peut notifier ou aider à la récupération, mais ne peut pas autoriser seul un appareil.

### Révocation

Révoquer un appareil invalide immédiatement ses sessions, refresh tokens et challenges, sans supprimer le compte ni révoquer les autres appareils. Les commandes hors ligne de cet appareil sont refusées à leur retour. Une révocation globale reste disponible au propriétaire.

### Action sensible

Finance, publication, changement de sécurité, export complet, connexion sociale ou contrôle physique pourront imposer une réauthentification récente. Cette preuve est liée à l'action exacte, à l'appareil, au workspace et à une expiration courte ; elle ne remplace ni le Tool Gateway ni l'approbation métier.

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
| `apps/api/src/plugins/identity-context.ts` | authentification avant les routes et construction du contexte serveur |
| `apps/api/src/modules/identity/*` | cas d'usage, repositories, routes et audit |
| `apps/api/src/ida-core.ts` | recevoir un port `RequestContext`, jamais `demoContext` |
| `apps/api/src/app.ts` | composer le plugin ; aucune logique de credential dans les routes métier |
| `apps/api/src/database.ts` | migration transitoire seulement, puis repository Identity dédié |
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

Cette validation a autorisé les contrats, politiques et tests d'architecture désormais livrés. Elle n'active ni migration, endpoint, compte, session, liaison d'instance ou service cloud réel ; `demoContext` reste limité à la démo locale jusqu'à leur livraison par tranches vérifiées.
