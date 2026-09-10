# 0006 — Météo dans IDA Home, lecture explicite

Statut : tranche locale personnelle, 2026-09-10.

## Décision

La référence `INTERFACE METEO.png` devient une section d’IDA Home, pas un nouveau monde ni un second accueil. Le décor est illustratif. Les chiffres viennent uniquement d’un bulletin chargé explicitement, jamais de la maquette ou d’une IA.

- Le module HOME existant porte l’outil `read_home_weather`, READ, derrière Identity et Tool Gateway. Aucun nouvel agent LLM ni modèle météorologique IDA.
- Contrat commun versionné : catalogue fermé de villes publiques, bulletin normalisé et erreurs bornées. Aucun champ URL, latitude libre, workspace ou secret accepté du client.
- L’adapter Open-Meteo utilise exclusivement les API HTTPS officielles de prévision et de qualité de l’air, sans redirection ni cookie, avec délai, taille, concurrence et quota bornés. Pas de fallback vers un autre fournisseur.
- Activation explicite du serveur local personnel ; désactivé par défaut dans `createApp`. Le client doit transmettre son accord pour chaque chargement. Le statut et l’ouverture de l’écran ne déclenchent aucune sortie réseau vers le fournisseur.
- Un contrôle READ valide la session, l’utilisateur, l’instance et le workspace avant la requête et à nouveau avant de restituer le résultat.
- Audit par ajout uniquement dans le stockage existant, limité au workspace/acteur, identifiants de session/instance, outil et résultat. Le code n'efface/modifie aucun événement ; la table activity_logs existante n'a toutefois pas de verrou SQL d'immutabilité. Aucune ville choisie, adresse, réponse brute ni donnée météo personnelle dans les logs ou les prompts. Ces nouveaux événements restent internes, hors de la projection fermée de la timeline actuelle.

## Données et conservation

Les coordonnées du centre des villes du catalogue et les prévisions sont publiques. Le choix temporaire d’une ville reste en mémoire de l’écran ; il ne crée pas une adresse personnelle ou une mémoire confirmée. Le bulletin est conservé au plus dix minutes en mémoire du service, jamais en base. Les erreurs ne servent pas de bulletin périmé de remplacement. Les audits suivent la rétention existante ; aucune table métier supplémentaire.

Le fournisseur reçoit les coordonnées publiques de la ville et l’adresse IP sortante du serveur. L’UI l’annonce avant le premier chargement. Pas de géolocalisation navigateur, caméra, microphone, iframe ou tuile distante chargée implicitement.

## Limites, sécurité et repli

- Prévisions de modèles, pas relevés de capteurs de l’utilisateur. Les horaires et fuseaux restent explicites.
- Qualité de l’air indépendante : une indisponibilité n’est ni un indice zéro ni « bonne ».
- Aucune vigilance officielle intégrée, alerte push ou conseil médical. Les boutons correspondants donnent accès aux sources officielles, ouvertes uniquement au clic. Les conditions d’activité sensibles restent à confirmer humainement.
- Le propriétaire du workspace supervise cette lecture. IDA ne se substitue pas aux services météorologiques officiels ou à la protection civile ; aucun agent ne certifie un risque.
- Repli : interface accessible sans connexion, valeurs inconnues `—`, message d’erreur actionnable, nouvelle tentative volontaire et liens aux services officiels.
- API gratuite uniquement pour cette utilisation personnelle non commerciale. Une exploitation commerciale nécessite une décision de licence distincte ; aucune clé n’est intégrée ici.
- Rollback : désactiver `weatherEnabled` et conserver le parcours Home / liens externes. Aucun changement de réseau entrant, pare-feu ou authentification.

## Sources officielles

[Prévisions Open-Meteo](https://open-meteo.com/en/docs), [qualité de l’air et attribution CAMS](https://open-meteo.com/en/docs/air-quality-api), [conditions d’utilisation](https://open-meteo.com/en/terms), consultées le 10 septembre 2026.

Vérification prévue : contrats et transformation du bulletin, sorties réseau bornées, autorisation/revalidation, absence d’appel implicite, échecs/quota/audit. L’intégration ne vaut pas validation sur téléphone physique ou exposition réseau.
