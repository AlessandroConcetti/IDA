# ADR 0003 — Tentacular Core et clients multiplateformes

- Statut : accepté comme architecture cible
- Date : 2026-09-03
- Portée : évolution progressive ; le runtime local de Phase 1 reste inchangé

## Contexte

IDA doit évoluer d'un hub musical local vers un assistant personnel extensible, utilisable depuis Windows, macOS, le Web, une PWA, iOS, Android et, plus tard, des clients TV. Sur téléphone, le navigateur Web/PWA doit rester disponible en parallèle de l'application native. Cette extension ne doit créer ni deuxième cerveau, ni logique métier divergente dans les clients, ni accès implicite d'un modèle aux données ou aux actions.

L'utilisateur doit pouvoir conserver un déploiement local-first, y compris un espace de travail transportable sur SSD, tout en gardant la possibilité d'utiliser plus tard un hébergement central. Les fournisseurs IA, stockage, identité, notifications et intégrations externes doivent pouvoir évoluer sans contaminer les modules métier.

## Décision

L'architecture cible prend le nom **Tentacular** : un petit IDA Core stable fournit les invariants communs, tandis que des modules métier indépendants et des providers interchangeables étendent ses capacités. Les « tentacules » sont des capacités bornées ; elles ne deviennent jamais des autorités autonomes.

### Une seule autorité par workspace

- Un workspace possède un seul Core logique et un seul writer autoritaire à un instant donné.
- Tous les clients consomment la même API versionnée et les mêmes contrats.
- Windows et macOS peuvent héberger le profil local du Core. Le Web, la PWA, iOS et Android restent des clients ; ils ne réimplémentent ni orchestration, mémoire, permissions ou règles métier.
- Le navigateur Web/PWA et l'application native installés sur un même téléphone sont des instances clientes distinctes du même compte et du même Core ; leurs credentials et sessions sont révocables séparément.
- Un futur profil hébergé exécute le même Core et les mêmes modules. Une migration entre profils transfère explicitement l'autorité ; elle ne crée pas deux sources de vérité actives.
- Les caches clients sont bornés et révocables. Une commande préparée hors ligne est revalidée par le Core avant toute mutation.

### Profils de déploiement

| Profil | Autorité | Accès des clients | État cible |
|---|---|---|---|
| `LOCAL_OWNER` | Core sur un hôte Windows ou macOS approuvé | boucle locale, réseau privé ou tunnel authentifié | cible prioritaire local-first |
| `HOSTED_OWNER` | même Core sur une infrastructure gérée | HTTPS authentifié | option future |

Un workspace n'utilise jamais simultanément les deux profils comme writers. La réplication, si elle est introduite, reste subordonnée à un mécanisme explicite de transfert d'autorité et de prévention du split-brain.

### Clients supportés

| Client | Rôle | Contraintes |
|---|---|---|
| Windows | interface desktop ; peut lancer ou rejoindre un Core local | secrets dans le coffre OS ; aucune règle métier propre |
| macOS | interface desktop ; peut lancer ou rejoindre un Core local | mêmes contrats et mêmes garanties que Windows |
| Web | interface navigateur desktop ou mobile vers le Core configuré | aucun secret provider ni accès direct au volume de données |
| PWA | client Web installable sur ordinateur ou téléphone avec cache borné | cache non autoritaire ; aucune action différée sans revalidation serveur |
| iOS | client natif fin | credential appareil dans le Keychain ; pas de token provider |
| Android | client natif fin | credential appareil dans le Keystore ; pas de token provider |
| TV / autre terminal | client fin futur et limité | capacités déclarées ; aucune autorité ni règle métier locale |

Les différences de plateforme restent limitées aux capacités d'interface : notifications, partage de fichier, biométrie, microphone et intégration au système. Elles passent par des contrats de capacité et ne changent pas le métier. Une instance Web/PWA ne partage jamais silencieusement son credential ou sa session avec l'application native ; leur éventuel regroupement sous un même appareil physique est seulement une présentation.

Les thèmes visuels, l'introduction cinématique, le futur mode d'ambiance desktop et les gestes optionnels sont eux aussi des capacités clientes. Ils ne changent ni le Core, ni les données, ni les permissions. La caméra reste fermée tant qu'une action explicite de l'utilisateur n'a pas demandé son usage dans le parcours courant.

### Modes `NORMAL` et `AI`

- `NORMAL` exécute uniquement des parcours déterministes : consultation, saisie, règles métier, recherche structurée et outils explicitement autorisés. Il ne déclenche aucun modèle IA.
- `AI` autorise des capacités de raisonnement ou de génération via le Provider Registry. Il reste soumis aux mêmes schémas, permissions, approbations et audits que `NORMAL`.
- Activer `AI` n'accorde aucun nouvel outil, aucune donnée supplémentaire et aucun niveau de permission supérieur.
- L'absence ou la panne d'un provider IA provoque un retour explicite vers une capacité `NORMAL` lorsque celle-ci existe ; aucun fournisseur cloud de secours n'est appelé silencieusement.
- Le mode effectif est visible et journalisé pour chaque commande ayant un effet ou utilisant un provider externe.

### Module Registry v2

Le Module Registry v2 enregistre des modules métier revus au build. Chaque manifeste déclare au minimum : identité et version, contrats compatibles, données possédées, outils, permissions, événements, dépendances, providers requis, modes supportés, politiques de rétention, migrations, agents facultatifs et état d'activation.

Le registre valide les doublons, dépendances, versions et références d'outils/providers au démarrage. Un module désactivé ne peut ni enregistrer de route, recevoir du contexte, exécuter un outil ou lancer une migration. Aucun code de module n'est chargé depuis la base, un document importé ou le SSD portable.

### Provider Registry

Les modules dépendent de capacités abstraites, jamais d'un SDK ou fournisseur concret. Le Provider Registry résout des implémentations revues pour l'IA, le stockage, l'identité, la parole, les notifications, le calendrier et les intégrations externes.

La sélection tient compte du mode, de la disponibilité locale, de la classification des données, du consentement, du besoin réseau et des contraintes du workspace. Les secrets sont résolus côté serveur au dernier moment et ne traversent ni le registre public, ni les modules, ni les clients.

### Espace de travail sur SSD portable

Un futur workspace portable est un **vault de données versionné**, pas une application autonome :

- base, médias et manifestes de sauvegarde sont chiffrés ; les clés ne sont pas conservées en clair sur le SSD ;
- le binaire du Core et le code des modules/providers sont installés et vérifiés sur l'hôte ; aucun exécutable ou plugin n'est lancé depuis le volume ;
- un verrou de writer empêche l'ouverture simultanée du vault par deux Core ;
- retrait, crash et reconnexion utilisent journalisation, écritures atomiques, contrôle d'intégrité et procédure de récupération ;
- les chemins stockés sont logiques et portables, jamais des chemins absolus dépendants de Windows ou macOS ;
- un SSD portable n'est pas une sauvegarde. Une copie chiffrée et une restauration testée restent nécessaires.

iOS, Android, le Web et la PWA n'accèdent jamais directement au SSD. Ils passent par le Core qui détient le verrou du workspace.

### Domaines futurs

Finance, Courses, Santé, Maison et Legal restent hors des phases actuellement engagées. Leur présence dans l'architecture signifie seulement que les frontières doivent les accueillir plus tard.

- **Finance** : lecture seule par défaut ; pas de paiement, transfert, trading ou identifiant bancaire.
- **Courses** : listes et préférences d'abord ; aucun achat sans décision produit et sécurité distincte.
- **Santé** : données hautement sensibles, consentement granulaire, aucune urgence, prescription ou décision clinique automatisée.
- **Maison** : séparation des données d'occupation et des équipements ; aucune serrure, alarme, caméra ou action physique critique sans conception dédiée.
- **Legal** : documents et échéances sous contrôle utilisateur ; aucune signature, soumission, représentation ou conseil présenté comme professionnel.

Chaque domaine obtient son propre modèle de données, ses outils, permissions, rétention, audit, providers et tests d'échec. Aucun agent généraliste n'y accède par défaut.

## Conséquences

- Le Core reste réduit aux contrats transverses, contexte, policies, registres, orchestration, audit et cycle de commande.
- Les modules évoluent dans le monolithe avant toute extraction réseau.
- La portabilité concerne le workspace et ses données, pas l'exécution de code non vérifié.
- Les clients natifs peuvent progresser indépendamment sans créer de logique métier parallèle.
- L'accès Web/PWA mobile peut être livré et maintenu indépendamment des applications natives, tout en utilisant le même Core et des sessions séparées.
- La sélection des providers devient explicable, contrôlable et testable.
- Les futurs domaines sensibles ne sont pas « débloqués » par cette décision ; chacun exige une décision et une tranche verticale propres.

## Non-objectifs immédiats

Cette ADR n'autorise ni application native, synchronisation cloud, endpoint Identity réel, provider IA réel, exécution depuis SSD, contrôle gestuel, caméra au démarrage, mode fond d'écran, module Finance/Courses/Santé/Maison/Legal, action domotique, acte juridique ou migration de la base locale. La validation Identity a autorisé uniquement la première tranche, désormais livrée, de contrats, politique d'accès et tests d'architecture. Cette ADR fixe les frontières à respecter lorsque les autres travaux seront explicitement planifiés.

## Documents associés

- [Architecture générale](../../ARCHITECTURE.md)
- [Module Registry v2](../../MODULES.md)
- [Provider Registry et modes IA](../../AI_PROVIDERS.md)
- [Vie privée et local-first](../../PRIVACY.md)
- [Identity et Device Linking](../../IDENTITY_DEVICE_LINKING.md)
- [Design personnalisable](../../DESIGN_SYSTEM.md)
- [Input Providers et gestes](../../INPUT_PROVIDERS.md)
- [Sécurité](../../SECURITY.md)
- [Roadmap](../../ROADMAP.md)
