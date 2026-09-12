# Passkeys IDA — vérification serveur

État : adaptateur implémenté, **non activé dans le runtime HTTP**. Ce composant ne crée aucune session et ne rend pas le téléphone utilisable à lui seul.

## Dépendance et responsabilité

`apps/api/src/passkey-adapter.ts` délègue la vérification WebAuthn à `@simplewebauthn/server` **14.0.1**, version exacte dans le manifeste et le lockfile. Cette dépendance répond au besoin immédiat d'authentification forte du navigateur distant : aucune cryptographie d'authentification réseau n'est réinventée. Les autres versions du lockfile sont conservées.

[Documentation du fournisseur](https://simplewebauthn.dev/docs/packages/server).

## Contrat interne

Construction : `new PasskeyAdapter({ origin, rpId })`. L'origine doit être une origine HTTPS canonique exacte, sans chemin, query, fragment ou identifiants. Son hostname doit être exactement le RP ID configuré ; les IP, jokers et noms mono-label sont refusés.

- `registrationOptions({ challenge, userHandle })` : options d'enregistrement avec clé résidente et vérification utilisateur obligatoires, attestation `none`, nom d'utilisateur opaque sans email.
- `verifyRegistration({ response, challenge })` : retourne uniquement l'identifiant de credential, la clé publique, le compteur et les transports contrôlés.
- `authenticationOptions({ challenge, credential })` : limite la demande au credential sélectionné côté serveur, avec vérification utilisateur obligatoire.
- `verifyAuthentication({ response, challenge, credential })` : vérifie la signature et retourne le nouveau compteur, sans émettre de cookie ou de permission.

`challenge` et `userHandle` sont chacun 32 octets aléatoires fournis par le serveur sous forme base64url canonique sans padding. Ne pas utiliser email, identifiant de workspace ou valeur saisie par le client comme `userHandle`. La durée de 120 secondes envoyée au navigateur n'est qu'une indication : **le serveur appelant doit gérer expiration et consommation atomique**.

Les réponses sont bornées à 64 Kio, les champs binaires et transports validés, les cérémonies cross-origin et les attestations autres que `none` refusées avant vérification. Les branches d'attestation certificats/MDS ne sont pas utilisées. Les erreurs sont génériques et ne reflètent ni réponse ni configuration. Le composant ne lit aucun environnement, ne persiste rien, n'active aucun réseau, ne produit aucun log et ne demande aucun capteur.

## Intégration obligatoire avant exposition

1. Défi court lié au type de cérémonie et à la pré-session du navigateur, stocké côté serveur ; consommation unique atomique même en cas de concurrence.
2. Appairage limité dans le temps, accepté explicitement depuis une instance PC autorisée ; aucun accès accordé par le seul réseau Tailscale.
3. Vérification des états utilisateur, membership, workspace, instance et grant à l'émission puis à chaque utilisation de session.
4. Enregistrement atomique du compteur avec consommation du défi ; cookies HTTPS sécurisés, origine/CSRF, quotas et audit sans données de cérémonie.
5. Révocation indépendante des sessions du téléphone, y compris lors des suspensions puis réactivations. Les triggers historiques visant `local_auth_sessions` ne suffisent pas pour des sessions passkey.
6. Frontière HTTPS dédiée, essais de refus/rejeu/isolation, sauvegarde-restauration et test réel Safari en 4G/5G avant toute annonce d'accès distant opérationnel.

Une passkey peut être synchronisée : sa vérification ne certifie pas un iPhone physique. Elle n'accorde jamais à elle seule un scope ou une commande Home Assistant. Aucun schéma de base, route API ou comportement de `LOCAL_LOCK` n'est modifié dans cette tranche.

## Vérification

Les 39 tests voisins vérifient la configuration, les options réelles du fournisseur, les paramètres transmis au vérificateur, les réponses malformées, les refus cross-origin et les erreurs génériques. Une clé ES256 éphémère produite en mémoire permet une inscription et une authentification réellement vérifiées, puis des refus pour challenge/origine/RP incorrects, présence ou vérification utilisateur absentes, signature altérée, autre clé et compteur rejoué. Ces cas synthétiques ne constituent pas une recette sur un téléphone réel.

Validation du 12 septembre 2026 : 39 tests passkey et 14 tests de non-régression de l'identité/verrou local réussis sous Vitest 4.1.11 ; vérification TypeScript API et Biome ciblé réussis. `pnpm audit --prod --audit-level=high` ne signale aucune vulnérabilité connue lors de cette exécution ; ce résultat ponctuel ne garantit pas une absence de risque. Installation finale depuis le lockfile gelé, hors ligne et sans scripts ; aucune autre dépendance existante n'a été actualisée.

Suivi de déploiement : [accès privé](PRIVATE_WEB_ACCESS.md). La connexion Tailscale du PC et l'essai extérieur restent non confirmés ; Home Assistant est inchangé.
