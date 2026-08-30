# IDA — Intelligent Digital Assistant

IDA est un AI Command Center personnel centré sur l'écosystème musical : catalogue, contenus, projets artistiques, calendrier, campagnes, réseaux sociaux et mémoire créative. À terme, il pourra accueillir des domaines personnels supplémentaires sans créer un second assistant ni une seconde base de données.

## État du projet

Le projet est en **Phase 0 — architecture et fondations**. Aucune fonctionnalité produit ni intégration externe n'est encore implémentée.

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
- [Roadmap](ROADMAP.md)
- [Sécurité](SECURITY.md)
- [APIs sociales](SOCIAL_APIS.md)
- [Règles de développement](AGENTS.md)
- [Décision de fondation](docs/adr/0001-platform-foundation.md)

## Prochain jalon

Phase 1 construira un premier flux utile : authentification, Artist Brain, Music Brain, Content Library, recherche et conversation IDA synchronisée.
