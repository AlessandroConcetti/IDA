# ADR 0004 — Verrou local propriétaire et session opaque

## Statut

Décision validée pour la prochaine tranche Identity, **non implémentée** dans le runtime actuel.

## Contexte

Le runtime `LOCAL_DEMO` possède désormais un contexte Identity persistant et des autorisations par requête, mais aucune preuve humaine : son sélecteur de session est encore compilé côté serveur. Ajouter directement passkeys, e-mail, cloud et association multi-appareils créerait une surface trop large avant que la démo française et le Core local soient stabilisés.

Un verrou local intermédiaire est donc utile sur le PC hôte. Il protège l'ouverture de l'interface et prépare le contrat de session sans prétendre être l'authentification multi-appareils finale. Il n'autorise aucune exposition LAN ou Internet.

## Décision

La prochaine tranche Identity pourra livrer un parcours `setup → locked → unlock → lock/logout` pour un unique propriétaire local :

- une passphrase choisie par l'utilisateur est dérivée avec `scrypt`, un sel aléatoire propre au credential et des paramètres versionnés ; aucune passphrase brute ou réversible n'est stockée ;
- le profil initial cible `N=2^17`, `r=8`, `p=1`, sous réserve d'un benchmark local et d'une limite mémoire explicite avant activation ; toute évolution de paramètres permet un rehash après déverrouillage réussi ;
- la comparaison du résultat dérivé utilise une primitive à temps constant ; les erreurs ne révèlent ni existence du compte, ni état du credential ;
- après déverrouillage, le serveur génère un identifiant de session opaque avec au moins 256 bits aléatoires ; seul son digest est persisté côté serveur ;
- le navigateur reçoit uniquement un cookie de session `HttpOnly` et `SameSite=Strict`, jamais un JWT, refresh token ou secret dans `localStorage`/`sessionStorage` ;
- en HTTPS, le cookie est `Secure`, sans attribut `Domain`, avec le préfixe `__Host-`; le profil HTTP de développement reste strictement lié à la boucle locale et ne peut pas être exposé sur le réseau ;
- les mutations contrôlent aussi l'origine et les métadonnées Fetch/CSRF ; `SameSite` reste une défense supplémentaire, pas l'unique barrière ;
- l'identifiant de session est renouvelé après authentification ou changement de privilège, possède expirations absolue et d'inactivité, et peut être révoqué immédiatement par verrouillage ;
- les tentatives d'unlock sont limitées et temporisées côté serveur, sans verrouillage permanent exploitable pour provoquer un déni de service ;
- les logs ne contiennent ni passphrase, dérivé, sel complet, cookie, identifiant brut de session ou contenu de formulaire sensible.

Le `Identity Session Gateway` remplace alors le sélecteur compilé, résout la session opaque et attache le même `RequestIdentityContext`. Les routes métier, l'IDA Core, les scopes et le Tool Gateway ne changent pas de modèle d'autorisation.

## Limites assumées

- Ce verrou protège surtout contre l'accès opportuniste via l'interface ; il ne protège pas les données contre un attaquant qui contrôle déjà le compte Windows, le processus IDA ou le disque déchiffré.
- Une passphrase n'est pas résistante au phishing et ne devient pas le credential de liaison d'un iPhone, d'un Mac, d'Android ou du Web distant.
- Aucune récupération par la seule adresse e-mail n'est admise. Avant données réelles, le parcours de récupération et la sauvegarde chiffrée doivent être décidés et testés séparément.
- Aucun « se souvenir de moi » durable, biométrie maison, question secrète, secret codé en dur ou contournement de support n'est ajouté.
- Le runtime reste limité à `127.0.0.1` jusqu'au jalon réseau de `SECURITY.md`.

## Évolution multi-appareils

Les passkeys/WebAuthn restent la cible privilégiée pour les clients Web/PWA et natifs, car une authentification cryptographique liée au vérificateur peut résister au phishing. Chaque navigateur ou application conserve néanmoins sa propre `ClientInstance`, sa propre session et son grant révocable. Le verrou local ne remplace ni le Device Linking, ni le step-up lié à une action sensible.

## Tests requis avant activation

- setup atomique, dérivé absent des réponses/logs et refus d'une seconde initialisation ;
- bonne/mauvaise passphrase, format corrompu et migration de paramètres ;
- égalité temporelle utilisée et limites de taille d'entrée ;
- limitation des tentatives sans fuite de compte ;
- session opaque absente, inconnue, expirée, révoquée ou rejouée refusée ;
- rotation après unlock, fixation de session impossible et logout réellement invalidant ;
- cookie absent des stockages JavaScript, attributs adaptés au profil HTTP local ou HTTPS ;
- requêtes cross-origin et faux preflights refusés ;
- contexte, membership, grant et Tool Gateway encore évalués après unlock ;
- serveur incapable de démarrer en écoute réseau avec le profil local non durci.

## Références de sécurité

- [OWASP — Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [NIST SP 800-63B-4 — Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)

