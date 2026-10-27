# Revue préventive CEPD — IDA (octobre 2026)

**Statut :** préparation documentaire uniquement. Ce document ne constitue ni une certification de conformité ni une validation des systèmes de production. Les projets de lignes directrices ci-dessous sont en consultation publique.

## Sources officielles et échéance

- CEPD, [Guidelines 02/2026 on Anonymisation](https://www.edpb.europa.eu/public-consultations/guidelines-022026-on-anonymisation_en) — consultation du 8 juillet au 30 octobre 2026, 23:59 CET.
- CEPD, [Guidelines 03/2026 on web scraping in the context of generative AI](https://www.edpb.europa.eu/public-consultations/guidelines-032026-on-web-scraping-in-the-context-of-generative-ai_en) — consultation du 8 juillet au 30 octobre 2026, 23:59 CET.

Vérifier les pages officielles avant toute décision ou contribution. Les projets ne sont pas des règles définitives nouvelles.

## Plan de travail — à vérifier sur le système réel

### A. Données, prompts, mémoire et journaux
- [ ] Inventorier les données traitées dans le CRM, les prompts et sorties IA, la mémoire des agents, les traces, les erreurs, les exports et les sauvegardes.
- [ ] Cartographier les flux vers les fournisseurs de modèles et outils tiers, leurs rôles, contrats, lieux de traitement et paramètres de conservation.
- [ ] Supprimer ou masquer les identifiants directs et les champs personnels qui ne sont pas nécessaires avant transmission.
- [ ] Définir des durées de conservation par catégorie et tester la purge effective.
- [ ] Tester les droits d'accès, de rectification, d'effacement, d'opposition et d'export lorsque applicables.

### B. Anonymisation
- [ ] Ne pas considérer une donnée comme anonyme parce que le nom a été supprimé ou remplacé par un identifiant.
- [ ] Évaluer et documenter les risques d'individualisation, de liaison entre jeux de données et d'inférence.
- [ ] Tester les possibilités de réidentification par rapprochement avec le CRM, les historiques et les données accessibles publiquement.
- [ ] Restreindre les accès aux données pseudonymisées et conserver séparément les éléments de correspondance.

### C. Collecte web et prospection par agents
- [ ] Documenter la finalité, la base légale, la nécessité et la proportionnalité de chaque collecte.
- [ ] Enregistrer la provenance (URL), la date de collecte, les champs collectés et la source.
- [ ] Limiter la collecte aux champs strictement nécessaires et filtrer les données sensibles.
- [ ] Vérifier les exigences d'information et les droits des personnes, y compris les oppositions pertinentes.
- [ ] Ne pas déclencher automatiquement une conservation durable, une création de profil ou une action commerciale à partir d'une recherche exploratoire.
- [ ] Examiner les conditions des sources et les règles d'accès ; le respect de robots.txt ne remplace pas l'analyse de la base légale RGPD.

### D. Tests et gouvernance
- [ ] Ajouter des tests avec des données synthétiques pour détecter les identifiants dans les prompts/logs, la collecte excessive, les risques de rapprochement et les défauts de purge.
- [ ] Déterminer si une AIPD/DPIA est nécessaire pour les traitements effectivement déployés.
- [ ] Consigner les résultats, les responsables, les risques résiduels et les mesures correctives.
- [ ] Faire valider les traitements réels par la personne responsable de la protection des données ou un conseil compétent si nécessaire.

## Critère de clôture

Ne pas déclarer IDA « conforme RGPD » sur la seule base de cette checklist. Clôturer uniquement après inspection du code et des configurations de production, tests exécutés, vérification des flux réels et validation des mesures adaptées. Aucune modification de code, de configuration de production, de collecte ou de conservation n'est effectuée par ce document.
