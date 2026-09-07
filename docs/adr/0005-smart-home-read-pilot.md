# ADR 0005 — Préparer la domotique en lecture seule

- Date : 7 septembre 2026.
- Statut : Home Assistant retenu par l’utilisateur, installation en cours ; préparation technique livrée, activation réelle encore à valider.
- Portée : IDA Home existant, aucun nouveau Core ni accueil.

## Décision

La demande de connexion Alexa/Google Home autorise une étude des APIs officielles et une préparation bornée. Elle ne permet pas de déduire les appareils, de scanner le réseau, d’installer un hub, d’associer un compte ou d’actionner un équipement.

Préparer un port serveur `SmartHomeReadProvider` et un adaptateur de lecture Home Assistant, **non enregistré dans le runtime**. Son transport est injecté, sans implémentation HTTP, URL, token ou mécanisme d’authentification dans cette tranche. Il se teste hors ligne sur réponses fictives. Le pilote est limité à l’état d’une lampe explicitement désignée, pas à un inventaire global. L’adaptateur n’est pas une barrière d’authentification et n’est accessible depuis aucune route ou commande IDA.

Home Assistant est retenu à la suite de la confirmation utilisateur. L’installation est effectuée de son côté, sans action de cet agent. Les appareils devront y être exposés par une intégration compatible. Alexa/Google peuvent rester utilisables en parallèle si cette intégration le permet. Aucun import automatique de leurs comptes n’est promis. Voir [sources officielles et jalons](../SMART_HOME.md).

## Données, rétention et outils

- Données futures possédées par le module : connexion associée au workspace, référence de secret serveur, appareil explicitement autorisé et état observé. Identifiants de logement, noms de pièces, présence et historique domestique sont sensibles : pas de collecte générale.
- Projection pilote : état ON/OFF/UNKNOWN/UNAVAILABLE et horodatage fournisseur. Ne pas publier les attributs bruts, noms libres, URLs, contexte, géolocalisation, tokens ou identifiants techniques dans les cartes/logs/prompts.
- Aucun état conservé entre appels dans cette tranche ; aucune base ou mémoire permanente ajoutée. Avant connexion : décider TTL des états, purge à déconnexion et rétention bornée des audits. Les audits ne contiennent pas l’état de la maison.
- Futur outil `read_home_device` : READ, liste blanche par appareil et workspace, contrôles Identity et Tool Gateway obligatoires. Aucun outil enregistré maintenant.
- Aucun `turn_on`, `turn_off`, appel arbitraire de service, scène, routine ou automatisation. Serrures, alarmes, caméras, micros, portes/garages, chauffage et appareils à risque exclus de ce pilote. Une prise n’est pas assimilée à une lampe : son appareil branché peut être dangereux.
- Repli : continuer d’utiliser les applications Alexa/Google/fabricant ; une panne ou absence de capacité n’est jamais assimilée à OFF.

## Barrières avant connexion réelle

1. Identifier modèle, intégration disponible et une lampe pilote. Valider avec l’utilisateur le fournisseur, les données lues et l’hôte précis ; ne demander aucun secret dans la conversation.
2. Ajouter la configuration serveur et le coffre, la rotation/révocation du credential et une identité réelle. `LOCAL_DEMO` ne peut pas donner accès à la maison. Un token de hub peut être plus puissant que les appels READ d’IDA : le documenter, limiter les droits fournisseur quand possible, ne pas prétendre le rendre read-only par son nom.
3. Transport serveur borné : hôte explicitement autorisé, TLS vérifié (pas de contournement), pas d’URL utilisateur libre, redirections refusées, politique DNS/SSRF, timeout/annulation, limites taille/concurrence et erreurs génériques. Aucun scan ou accès aux métadonnées/réseaux voisins. Même une lecture nécessite une autorisation de connexion distincte.
4. Lier chaque ressource au workspace ; recalculer session, instance, membership, grant, permission READ et autorisation de l’appareil à chaque appel. Ne jamais utiliser un singleton de credentials multi-workspace. Annuler/ignorer les réponses si l’accès est révoqué pendant la lecture.
5. Ajouter route, outil déclaré, audit minimal et tests HTTP : mauvais utilisateur/workspace, appareil non autorisé, révocation avant/pendant lecture, absence de secret client, refus des opérations d’écriture, timeout, réponse mal formée et redirection hostile. Ne pas activer sans ces tests.
6. Vérifier une lecture réelle sur l’appareil choisi. Un statut du hub est une observation datée, pas la preuve que la lampe est joignable à cet instant. Aucun essai physique d’écriture durant cette étape.

## Évolution et gouvernance

Les futurs clients Web mobile, Windows, macOS, iOS et Android utilisent le même Core. Un SDK Google Home natif ne doit pas court-circuiter le Tool Gateway : concevoir et valider un exécuteur client lié, avec commandes autorisées, expirantes et non rejouables, avant son utilisation. Aucun SDK ou cloud de commande parallèle ajouté maintenant.

Le futur `Home Safety Steward` observera les refus déterministes, erreurs et dérives de permissions, sans contrôle permanent par modèle, collecte de présence ou pouvoirs d’écriture. Escalade vers le propriétaire pour tout consentement et vers un professionnel qualifié pour les équipements électriques/chauffage/sécurité. Manifeste, contexte borné, évaluations et désactivation sont requis avant enregistrement ; il ne certifie pas une installation.

La commande d’une lampe sera une tranche distincte : action structurée exacte, cible autorisée, confirmation humaine ponctuelle, anti-rejeu, journal et vérification du résultat. Aucun « toggle », commande différée après panne ou routine générale par défaut.
