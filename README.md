# IDA — Intelligent Digital Assistant

IDA est un AI Command Center personnel centré sur l'écosystème musical : catalogue, contenus, projets artistiques, calendrier, campagnes, réseaux sociaux et mémoire créative. À terme, il pourra accueillir des domaines personnels supplémentaires sans créer un second assistant ni une seconde base de données.

## État du projet

La **Phase 0 — architecture et fondations** est terminée. Les premières tranches de **Phase 1** sont en place : un Command Center responsive, une API modulaire locale, des contrats partagés, un résumé d’accueil factuel calculé dans le fuseau du workspace, une commande « aujourd’hui/demain » reliée au calendrier interne, un Artist Brain réellement éditable, un Music Brain avec Release Registry, ajout local contrôlé de morceaux et liaison explicite à une release compatible, une Content Library avec import privé contrôlé, rattachement explicite à une release et/ou un morceau compatible, recherche filtrée par métadonnées et contexte musical et aperçu local autorisé, une rotation de contenus factuelle sans score ni action, un registre de briefs de campagne internes avec liens optionnels de release et morceau contrôlés par une version commune, un centre de mémoire consentie, un Task Center actionnable, un Approval Center à décision humaine, un calendrier éditorial, une timeline d’activité sûre en lecture seule, une matrice Social déclarative lue par l’API, un registre d’agents versionné et verrouillé, ainsi que des commandes IDA déterministes en lecture seule avec historique privé borné lorsque l'identité possède `WRITE`.

Cette tranche ne contient volontairement ni identité réseau ou multi-appareils, ni données utilisateur réelles, ni upload cloud, ni OAuth social, ni publication, ni scheduler, ni paiement. Le mode par défaut `LOCAL_DEMO` conserve un contexte technique sans preuve humaine. Un mode `LOCAL_LOCK`, activable explicitement avec `IDA_IDENTITY_MODE=LOCAL_LOCK`, ajoute sur la seule machine hôte un setup de passphrase et une session opaque par cookie ; il fournit un premier écran de configuration/déverrouillage, sans compte distant, passkey ou Device Linking et n’autorise aucune exposition réseau. Le résumé d’accueil distingue les snapshots de planification internes de toute livraison sociale et affiche une indisponibilité si l’API manque, sans valeur fictive. Un aperçu de média reste une route locale privée et autorisée : elle n’expose pas de clé ou URL de stockage, ne concerne que les images, audios et vidéos réellement importés et ne vaut ni partage, ni publication. Le Release Registry crée seulement une fiche de sortie locale, sans relier automatiquement tracks, médias, liens externes ou publication ; la création ultérieure d’un morceau peut toutefois choisir une release existante du même workspace et projet artistique, vérifiée par le serveur et une garde SQL. À l’import, un média peut aussi être rattaché explicitement à une release et/ou un morceau de ce même scope ; les médias déjà présents restent inchangés. La matrice Social est seulement déclarative : elle ne représente ni compte, ni token, ni connexion réelle, ni autorisation d’action externe. Le registre d’agents expose seulement deux manifestes `PLANNED` — `Memory Manager` et `Music Librarian` — sans prompt, secret, exécution ou accès implicite ; aucun agent ne tourne dans ce runtime. Le registre de campagnes crée des briefs `DRAFT` locaux et peut les rattacher explicitement à une release et un morceau du même workspace et projet, avec contrôle de version ; aucune date, pilier, contenu ou action sociale n’en découle. L’Approval Center valide seulement une version exacte d’une proposition. Le calendrier peut ensuite créer une planification interne immuable de cette version ou l’annuler explicitement de façon idempotente, mais ne programme aucune plateforme et ne publie rien. Les modules affichés dans l’interface préparent le même cœur partagé sans prétendre que les intégrations sont déjà actives.

Une propriété fail-safe complète ce fonctionnement : dès que le credential local a été initialisé, sa présence force `LOCAL_LOCK` à chaque redémarrage. Retirer la variable d’environnement ou la repasser à `LOCAL_DEMO` ne restaure jamais silencieusement la session technique. Le premier écran est livré avec des tests de cycle d’accès ; sa recette navigateur et la récupération restent à terminer. Ce mode reste réservé à l’évaluation locale sans données réelles.

## Principes directeurs

- Un Core central et une API versionnée pour le Web/PWA sur ordinateur ou navigateur mobile et les futurs clients Windows, macOS, iOS, Android et TV. Sur téléphone, l'accès Web/PWA restera disponible en parallèle de l'application native, sans créer un second Core.
- Un monolithe modulaire avant toute extraction de service.
- L'IA propose des plans structurés ; le serveur contrôle les permissions, validations et effets externes.
- Toute publication publique exige une validation humaine explicite dans le MVP.
- La mémoire durable exige un consentement explicite.
- Les données artistiques, financières et personnelles sont privées par défaut.

## Documentation

- [Guide de démonstration locale](docs/DEMO_GUIDE.md)
- [Architecture](ARCHITECTURE.md)
- [Base de données](DATABASE.md)
- [API](API.md)
- [OpenAPI — runtime local Phase 1](docs/openapi/phase1-local.yaml)
- [Roadmap](ROADMAP.md)
- [Sécurité](SECURITY.md)
- [APIs sociales](SOCIAL_APIS.md)
- [Règles de développement](AGENTS.md)
- [Module Registry v2](MODULES.md)
- [Provider Registry et modes IA](AI_PROVIDERS.md)
- [Vie privée et local-first](PRIVACY.md)
- [Identity et Device Linking](IDENTITY_DEVICE_LINKING.md)
- [Design personnalisable](DESIGN_SYSTEM.md)
- [Input Providers et gestes](INPUT_PROVIDERS.md)
- [Décision de fondation](docs/adr/0001-platform-foundation.md)
- [Décision du runtime local](docs/adr/0002-local-runtime-and-pglite.md)
- [Décision Tentacular et clients multiplateformes](docs/adr/0003-tentacular-core-and-cross-platform-clients.md)
- [Décision du verrou local propriétaire](docs/adr/0004-local-owner-lock-and-session.md)

## Démarrer en local

```bash
pnpm install
pnpm dev
```

Le web est alors disponible sur `http://127.0.0.1:5173` et l’API locale sur `http://127.0.0.1:8787`; le proxy Vite les relie automatiquement en développement. `.env.example` liste les variables disponibles : le verrou exige la même origine et le proxy Vite, donc laisse `VITE_IDA_API_URL` vide pour cette démo. Aucun secret ne doit être commité.

Le verrou local peut être évalué explicitement avec `IDA_IDENTITY_MODE=LOCAL_LOCK`. Il expose alors `GET /v1/auth/status`, `POST /v1/auth/setup`, `POST /v1/auth/unlock` et `POST /v1/auth/lock`, puis protège les autres routes `/v1` par un cookie de session opaque `HttpOnly` et `SameSite=Strict`. Après `setup`, le verrou devient persistant et ne peut pas être rétrogradé par configuration. Ce mode reste strictement lié à la boucle locale ; le premier parcours UI de setup/unlock/lock est livré, mais sa recette navigateur et la récupération restent à terminer, et ce mécanisme ne doit pas servir à protéger des données réelles ni à exposer IDA sur le LAN ou Internet.

## Prochain jalon

L’accueil Aurora reprend maintenant les références lumineuses desktop/mobile : cinq cartes fonctionnelles, commande vers le même Core, navigation classique, palette claire partagée et contraste de transparence temporaire. Le décor est une ressource locale non versionnée : [fichier et provenance](docs/AURORA_ASSET.md). Aucun agent, thème cinématique ou capteur n’est activé par cet accueil. La recette visuelle responsive ne vaut pas validation sur appareils physiques ni achèvement du parcours métier complet.

Les décisions d'Identity/Device Linking sont validées. Contrats, politique d'accès, tables locales additives et résolution fail-closed de la session avant chaque route `/v1` sont livrés. Le contexte profondément gelé, conservé hors de l'objet Fastify, est désormais l'unique source de l'acteur, du workspace, du rôle et du grant dans les routes et IDA Core ; les permissions sont recoupées avant chaque outil et `/v1/me` expose les capacités effectives sans exposer la preuve de session. Le verrou transitoire défini par l’ADR 0004 est livré avec un premier écran en mode `LOCAL_LOCK` opt-in ; `LOCAL_DEMO` reste le défaut tant que son expérience de setup/unlock, sa récupération et sa revue produit ne sont pas consolidées. Aucun compte réseau, passkey, association d’appareil ou accès multi-appareils réel n’est actif, et le runtime ne doit pas être exposé hors boucle locale. La démo reste française ; l'anglais est différé après sa consolidation. Les connexions sociales restent une Phase 3 contrôlée par `SOCIAL_APIS.md`, tandis que thèmes cinématiques, gestes et agents de gouvernance futurs ne retardent pas ce jalon.
