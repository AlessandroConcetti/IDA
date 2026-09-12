# IDA — accès privé hors domicile

Date : 12 septembre 2026. **Proposition et préparation uniquement ; accès distant non activé, essai extérieur non effectué.**

## Avancement après autorisation d'authentifier le téléphone

L'utilisateur confirme Tailscale installé et connecté sur l'iPhone. Tailscale **1.102.4** a ensuite été installé sur le PC avec autorisation explicite et validation de la signature Authenticode du paquet officiel. Windows Installer a terminé avec le code `0` ; le binaire est présent et le service est `Running`. Le premier relevé indiquait `NeedsLogin`. Après la réponse utilisateur « connecté », les lectures du service Windows indiquent **`NoState`**, sans nœud local en ligne, sans nom DNS privé et sans pair iOS visible. Cela ne prouve pas un échec de la connexion sur l'iPhone : la connexion du **PC** reste non confirmée. Aucun inventaire brut de pairs, identifiant de compte ou lien d'authentification n'est journalisé par ces vérifications.

Aucun `up`, `login`, Serve, Funnel, certificat HTTPS, routage de sous-réseau ou exit node n'a été configuré par l'agent. Aucune règle de box ni configuration Home Assistant n'a été modifiée. L'installation a ajouté le client, son service et ses composants Windows ; elle ne constitue ni un appairage IDA ni une preuve d'accès distant.

Étape utilisateur immédiate : vérifier le menu de l'icône Tailscale **sur Windows**, puis **Log in / Connect** si proposé, avec le même compte que sur l'iPhone. Ne transmettre aucun mot de passe ou code au chat. La vérification cryptographique des passkeys IDA est maintenant implémentée dans un [adaptateur serveur dédié](PASSKEY_ADAPTER.md), mais la persistance des défis, l'appairage confirmé, les sessions et leurs endpoints restent à intégrer. Le profil `LOCAL_LOCK` reste fermé au réseau. Le QR WebAuthn utilisé depuis le PC ne devra pas être confondu avec une session Safari ouverte sur le téléphone.

La préparation initiale ci-dessous est conservée comme historique et décision de sécurité ; son constat d'absence du binaire précède cette installation.

## Périmètre de la préparation initiale

Demande applicable : IDA dans Safari/Chrome, à domicile et hors domicile, sans publication d'application IDA. Analyser les solutions gratuites et préparer l'intégration **sans modifier Home Assistant ni ouvrir de port**. Cette tranche n'installe aucun VPN, ne configure aucun compte, certificat, proxy, pare-feu ou routeur et ne transmet aucun token.

## Choix recommandé

| Solution | Coût / contrôle | Adéquation au besoin actuel |
|---|---|---|
| **Tailscale Personal + Serve privé** | Offre personnelle non commerciale gratuite ; service de coordination externe | Recommandation : trajet privé et HTTPS navigateur, normalement sans redirection manuelle de port. Ne pas utiliser Funnel. |
| **WireGuard auto-hébergé** | Logiciel libre ; clés et exploitation à gérer | Alternative autonome si un point d'entrée joignable existe déjà. Sans serveur/relais existant, la contrainte de ne pas ouvrir de port complique cette voie. |
| **Headscale** | Serveur de contrôle libre auto-hébergé pour les clients Tailscale | Davantage de contrôle, mais un service de coordination à héberger, sécuriser et maintenir. Pas de garantie d'hébergement gratuit ni de parité avec Serve. |

L'offre Tailscale consultée inclut jusqu'à six utilisateurs et des appareils utilisateurs illimités ; elle ne couvre pas un déploiement commercial d'IDA. Revalider les conditions avant activation. [Tarifs officiels](https://tailscale.com/pricing).

Serve partage un service dans le réseau privé Tailscale et applique ses règles d'accès ; Funnel le rend public et est exclu de cette proposition. L'activation future devra contrôler les consentements et la configuration effective, sans se fier aux valeurs par défaut. [Serve](https://tailscale.com/docs/features/tailscale-serve). Tailscale évite généralement les ouvertures manuelles grâce à la traversée NAT ; le succès sur ce réseau reste à vérifier. [Pare-feu](https://tailscale.com/docs/reference/faq/firewall-ports).

WireGuard demande des pairs, clés et endpoints configurés, avec gestion de la persistance NAT. L'appréciation ci-dessus est une déduction de déploiement, pas une impossibilité technique absolue. [Documentation WireGuard](https://www.wireguard.com/quickstart/). Headscale remplace le serveur de contrôle, pas l'exploitation complète du service. [Projet officiel](https://headscale.net/stable/).

IDA restera un site ouvert dans Safari. **Le client VPN Tailscale devra être installé sur l'iPhone** si cette option est retenue : il ne s'agit pas d'une application IDA à publier. [Installation iOS](https://tailscale.com/docs/install/ios). Tailscale n'est pas une solution entièrement locale : sa coordination est hébergée. HTTPS publie le nom DNS du nœud dans les journaux de certificats ; choisir un nom neutre, sans identité personnelle. Cela ne publie pas les données IDA. [HTTPS et confidentialité des noms](https://tailscale.com/docs/how-to/set-up-https-certificates).

## Deux liaisons indépendantes

1. **Téléphone → IDA sur le PC** : futur VPN privé + HTTPS + identité applicative propre au navigateur.
2. **IDA sur le PC → Home Assistant** : trajet chiffré jusqu'à HA ou jusqu'à un composant adjacent approuvé, cible allowlistée et secret serveur.

Installer un VPN uniquement sur le PC et le téléphone ne chiffre pas la liaison LAN HTTP du PC vers HA. Un proxy TLS sur le PC qui transmet ensuite le token en HTTP sur le LAN ne résout pas ce problème. Aucune commande HA ne sera activée par ce simple changement de transport.

Le transport HA actuel exige HTTPS vérifié, une IPv4 privée RFC1918 épinglée et une seule entité `light`. Il refuse actuellement les adresses Tailscale CGNAT. Un futur transport de pair VPN devra être conçu et évalué explicitement, sans autoriser globalement cette plage ni désactiver TLS. La topologie réelle de l'installation HA doit être connue avant de choisir ce trajet ; aucune modification HA n'est décidée ici.

## Blocages logiciels constatés

- `runtime-config.ts` et `app.ts` limitent le runtime à la boucle locale et aux origines HTTP locales exactes.
- `LocalAuthService` et `LocalLockIdentityContextResolver` utilisent une instance Windows locale fixe. Partager ce verrou avec le téléphone causerait notamment des révocations croisées ; ce n'est pas un appairage.
- Les tables `client_instances`, `client_workspace_grants` et `identity_sessions` existent et doivent être réutilisées. Les endpoints d'appairage et l'identité distante restent à livrer.
- Le statut de coffre `STORED` indiquerait uniquement la présence d'un fichier protégé, pas la validité du token. Le helper Windows PowerShell 5.1 a été constaté bloqué par la stratégie `Restricted` ; cette tranche ne change ni cette stratégie ni l'interpréteur pour la contourner. La saisie locale masquée reste à débloquer explicitement.

**Ne pas placer Serve devant le port 8787 actuel en réécrivant Host/Origin pour contourner LOCAL_LOCK.** Voir [sécurité](../SECURITY.md), [identité et appareils](../IDENTITY_DEVICE_LINKING.md) et [livraison locale existante](PHONE_READINESS_20260911.md).

## Préparation livrée : diagnostic sans effet

`scripts/check-private-access.ts` inspecte uniquement la configuration locale bornée, les métadonnées du coffre du workspace fixé côté serveur et deux emplacements Windows standards du binaire Tailscale. Aucun déchiffrement, sous-processus, appel réseau, inventaire de pairs ou écriture. Aucun chemin, adresse, nom d'appareil, entité, workspace ou secret n'est imprimé.

Depuis la racine du dépôt, avec le Node du projet et le chargeur déjà présent dans le lockfile :

```powershell
node --import ./node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/loader.mjs scripts/check-private-access.ts
```

Le chemin de ce chargeur doit suivre le lockfile si celui-ci change ; aucune dépendance n'a été ajoutée. Le diagnostic résout `.data` depuis son propre fichier, pas depuis le répertoire courant.

Interprétation :

- `LOCAL_ONLY` / `NOT_IMPLEMENTED` décrivent le profil logiciel livré, pas un scan des services du PC.
- `executable: MISSING` signifie absent des **deux emplacements contrôlés**, pas une preuve d'absence sur tout le disque. `PRESENT` ne signifie ni installé correctement, ni connecté.
- `CONFIGURED` pour TLS signifie seulement une configuration compatible, sans essai de certificat. `STORED` ne prouve pas que le helper peut lire le secret, ni que HA l'accepte.
- `UNKNOWN` et `INVALID_OR_UNREADABLE` restent non concluants ; aucun échec de lecture n'est transformé en succès.
- `outsideTest` et `homeAssistant.verification` restent `NOT_PERFORMED`. Ce diagnostic ne peut jamais activer ou valider l'accès distant.

Exécution locale du 12 septembre : configuration HA présente et activée dans le fichier opérateur, TLS requis, cible requise, credential absent. Binaire Tailscale absent des deux emplacements standards contrôlés. Profil `LOCAL_ONLY`, jalon réseau non implémenté, connexions et essai extérieur non vérifiés. Le chargeur Node a échoué dans la sandbox avant le diagnostic ; la même commande a ensuite réussi avec l'autorisation explicite d'exécution hors sandbox. Aucun secret n'a été déchiffré et aucune requête réseau n'a été effectuée.

Vérifications : 36 tests ciblés réussis (diagnostic, chargement de configuration et transport HA), vérification TypeScript API et lint des trois nouveaux fichiers réussis. Revue indépendante des frontières sans blocage. Ces contrôles ne remplacent aucun essai réseau ou téléphone physique.

## Ordre de réalisation après cette préparation

1. Livrer une identité distante maintenue (OIDC/passkeys ou équivalent revu), un appairage court confirmé sur PC, un grant minimal et une révocation indépendante. Ne pas étendre le mot de passe local en authentification réseau maison.
2. Préparer une frontière proxy dédiée : origine HTTPS exacte, backend loopback, identité externe contrôlée et session navigateur distincte. Les headers utilisateur Tailscale ne constituent pas seuls une preuve d'instance navigateur. Aucun accès implicite pour les autres membres ou appareils partagés.
3. Vérifier cookies `__Host-`, Secure/HttpOnly/SameSite, CSRF, quotas, refus/rejeu/isolation/révocation, sauvegarde-restauration, dépendances et supervision. Les capteurs restent activés uniquement par geste explicite.
4. Avec autorisation d'installation/configuration : connecter les deux appareils, limiter les accès au service IDA, activer HTTPS privé et vérifier l'absence de Funnel. Pas d'exit node ni de routage du sous-réseau HA. Le PC et le Core devront rester allumés et accessibles.
5. Traiter séparément le trajet sécurisé HA, le coffre et une lampe pilote en lecture seule. Les commandes physiques nécessiteront leur propre tranche, autorisation et recette.

## Recette obligatoire depuis l'extérieur

- Sur le téléphone : couper le Wi-Fi, utiliser réellement la 4G/5G, connecter le VPN puis ouvrir l'origine HTTPS privée dans Safari.
- Vérifier authentification, consultation d'une ressource autorisée, maintien de la session PC, arrière-plan/retour, clavier et lecture audio.
- Révoquer l'instance téléphone depuis le PC ; ses requêtes suivantes doivent être refusées. Un autre appareil non appairé doit également être refusé. Refaire un appairage pour retrouver l'accès.
- Vérifier séparément, uniquement après préparation HA, une lecture explicite de la lampe. Aucun test de serrure, alarme, chauffage ou caméra.
- Noter date UTC, navigateur, réseau cellulaire et résultats bornés, sans token, contenu privé, IP ou identifiant de compte. Une simulation desktop, un ping VPN ou une page chargée depuis le PC ne vaut pas cette recette.

Tant que cette recette n'a pas réussi, afficher **accès distant non vérifié**, jamais « opérationnel ». En cas d'échec après activation future : retirer le partage Serve et révoquer l'instance téléphone ; ne pas ouvrir le pare-feu ou relâcher l'identité pour contourner l'échec. La configuration HA existante doit rester intacte.
