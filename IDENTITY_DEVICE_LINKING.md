# IDA — Identity, sessions et Device Linking

## Statut

Ce document est une **analyse d'architecture à valider**. Aucun endpoint d'authentification, compte réel, session, appareil ou service cloud n'est activé par ce document.

## État actuel

Le runtime local possède déjà `users`, `workspaces` et `memberships`, mais chaque requête reçoit encore le même `demoContext` fixé côté serveur. `GET /v1/me` décrit ce profil `LOCAL_DEMO`; il n'existe ni adresse e-mail vérifiée, credential, session, device, association, révocation ou récupération de compte.

Cette base est utile pour les tests de scope, mais ne constitue pas une authentification et ne doit pas être exposée hors boucle locale avec des données réelles.

## Position dans le Kernel

```text
Client Windows / macOS / Web / PWA / iOS / Android / TV
                              │
                     preuve de session appareil
                              ↓
                    Identity Session Gateway
                              ↓
       RequestContext(user, workspace, membership, device, session)
                              ↓
             API → IDA Core → Tool Gateway → Modules
```

L'Identity Session Gateway authentifie la session et construit un `RequestContext` serveur immuable. Le Core, les routes et les outils ne reçoivent jamais un `userId`, `workspaceId`, rôle ou `deviceId` choisi dans le corps ou la query du client.

L'ordre de contrôle cible est :

1. session valide et non expirée ;
2. appareil actif et non révoqué ;
3. utilisateur actif ;
4. membership actif dans le workspace ;
5. restrictions propres à l'appareil ;
6. permission de l'outil et scope de la ressource ;
7. réauthentification renforcée et approbation si requises.

Une authentification réussie n'élève donc jamais automatiquement un appareil à tous les privilèges du compte.

## Modèle de données cible minimal

Les noms définitifs seront fixés dans une migration versionnée après validation.

| Entité | Données minimales | Règles |
|---|---|---|
| `UserEmail` | user, adresse normalisée, état de vérification | une adresse seule n'est jamais une preuve d'accès |
| `AuthIdentity` | user, type de credential, identifiant fournisseur | aucun secret brut ; fournisseur maintenu ou passkey privilégiée |
| `Device` | user, nom, plateforme, clé publique, état, dernière activité | identité distincte d'une session et d'un workspace |
| `DeviceLinkChallenge` | initiateur, code/nonce haché, expiration, état | usage unique, court, confirmé depuis un appareil déjà autorisé |
| `Session` | user, device, token haché, expiration, révocation | rotation, révocation immédiate, portée minimale |
| `DeviceWorkspaceGrant` | device, workspace, capacités limitées | ne remplace pas la membership ; peut seulement réduire les droits |
| `StepUpChallenge` | session, action sensible, expiration | lié à l'action et non réutilisable |
| `RecoveryMethod` | user, méthode, état, date | secrets de récupération hachés et affichés une seule fois |

Les jetons sociaux, bancaires et providers restent des credentials d'intégration séparés. Lier un appareil ne donne jamais accès à leurs secrets.

## Flux cibles

### Création et connexion

- L'utilisateur crée son compte via une adresse vérifiée et une méthode forte à choisir.
- Le serveur crée le compte, le premier workspace et la membership `OWNER` de façon atomique.
- La session est attachée à un appareil enregistré et à une preuve cryptographique ; aucun token durable ne réside dans `localStorage`.
- Sur client natif, le credential appareil réside dans Keychain/Keystore ou le coffre Windows/macOS.

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

Un service cloud n'est pas nécessaire pour le premier compte local. Les fonctions e-mail, récupération distante et accès hors domicile demanderont cependant un canal minimal ou un futur profil hébergé. Aucune synchronisation multi-writer n'est introduite : un workspace conserve un seul Core autoritaire.

## Surface API cible, non active

```text
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/logout
POST /v1/auth/step-up
GET  /v1/sessions
DELETE /v1/sessions/:sessionId

GET  /v1/devices
POST /v1/device-links
POST /v1/device-links/:challengeId/complete
POST /v1/device-links/:challengeId/confirm
DELETE /v1/devices/:deviceId
PATCH /v1/devices/:deviceId/grants
```

Les noms sont indicatifs. Chaque mutation aura un schéma strict, des limites de débit, une idempotence, une protection anti-rejeu et un audit redacted.

## Fichiers et composants concernés lors de l'implémentation

| Zone | Évolution future |
|---|---|
| `packages/contracts/src/identity/*` | DTO session/device/linking, erreurs et RequestContext public minimal |
| `packages/domain/src/identity/*` | politiques de session, appareil, membership, step-up et grants |
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
- nouveau device limité aux grants explicitement accordés ;
- révocation d'un device sans impact automatique sur les autres ;
- membership révoquée après connexion prise en compte à la requête suivante ;
- device authentifié incapable de contourner Tool Gateway, approbations ou scope ;
- step-up lié à un autre payload/workspace/device refusé ;
- secrets, codes et tokens absents des logs, erreurs et projections client ;
- cache ou commande hors ligne revalidé par le Core avant mutation.

## Décisions nécessaires avant toute modification structurelle

1. Première méthode de connexion : passkey recommandée, ou mot de passe maintenu par un fournisseur d'identité avec MFA.
2. Le premier compte doit-il fonctionner entièrement hors ligne, sans vérification e-mail immédiate ?
3. L'accès iPhone/Android hors du réseau local est-il requis dans la première bêta ?
4. Quel niveau de récupération est accepté si le PC principal et les appareils autorisés sont perdus ?
5. Les grants d'appareil seront-ils prédéfinis (`TRUSTED`, `LIMITED`, `VIEW_ONLY`) ou configurables capacité par capacité ?

Tant que ces décisions ne sont pas validées, `demoContext` reste limité à la démo locale et aucune table ou route Identity supplémentaire ne doit être créée.
