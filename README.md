# IDA — Intelligent Digital Assistant

IDA est un AI Command Center personnel centré sur l'écosystème musical : catalogue, contenus, projets artistiques, calendrier, campagnes, réseaux sociaux et mémoire créative. À terme, il pourra accueillir des domaines personnels supplémentaires sans créer un second assistant ni une seconde base de données.

## État du projet

La **Phase 0 — architecture et fondations** est terminée. Les premières tranches de **Phase 1** sont en place : un Command Center responsive, une API modulaire locale, des contrats partagés, un Artist Brain réellement éditable, un Music Brain avec ajout local contrôlé de morceaux, une Content Library avec import privé contrôlé et recherche filtrée, un registre de briefs de campagne internes, un centre de mémoire consentie, un Task Center actionnable, un Approval Center à décision humaine, un calendrier éditorial et des commandes IDA déterministes en lecture seule.

Cette tranche ne contient volontairement ni authentification réelle, ni données utilisateur réelles, ni upload cloud, ni OAuth social, ni publication, ni scheduler, ni paiement. Le registre de campagnes crée seulement des briefs `DRAFT` locaux : aucun lien de release, date, pilier, contenu ou action sociale n’en découle. L’Approval Center valide seulement une version exacte d’une proposition. Le calendrier peut ensuite créer une planification interne immuable de cette version, mais ne programme aucune plateforme et ne publie rien. Les modules affichés dans l’interface préparent le même cœur partagé sans prétendre que les intégrations sont déjà actives.

## Principes directeurs

- Un backend central et une API versionnée pour le web, le mobile et de futurs clients natifs.
- Un monolithe modulaire avant toute extraction de service.
- L'IA propose des plans structurés ; le serveur contrôle les permissions, validations et effets externes.
- Toute publication publique exige une validation humaine explicite dans le MVP.
- La mémoire durable exige un consentement explicite.
- Les données artistiques, financières et personnelles sont privées par défaut.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Base de données](DATABASE.md)
- [API](API.md)
- [OpenAPI — runtime local Phase 1](docs/openapi/phase1-local.yaml)
- [Roadmap](ROADMAP.md)
- [Sécurité](SECURITY.md)
- [APIs sociales](SOCIAL_APIS.md)
- [Règles de développement](AGENTS.md)
- [Décision de fondation](docs/adr/0001-platform-foundation.md)
- [Décision du runtime local](docs/adr/0002-local-runtime-and-pglite.md)

## Démarrer en local

```bash
pnpm install
pnpm dev
```

Le web est alors disponible sur `http://127.0.0.1:5173` et l’API locale sur `http://127.0.0.1:8787`; le proxy Vite les relie automatiquement en développement. `.env.example` liste les variables disponibles : un éventuel `VITE_IDA_API_URL` séparé se place dans `apps/web/.env.local`. Aucun secret ne doit être commité.

## Prochain jalon

Terminer Phase 1 avec l’authentification, les vraies données par workspace, les prévisualisations et traitements sécurisés, l’historique de commandes et la consultation du journal d’activité. Les connexions sociales restent une Phase 3 contrôlée par les capacités documentées dans `SOCIAL_APIS.md`.
