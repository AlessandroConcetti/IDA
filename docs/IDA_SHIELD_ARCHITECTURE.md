# IDA Shield — surcouche de sécurité pour les sites IDA Studio

**Statut : conception et plan de déploiement — non activé en production.**

## Objectif

IDA Shield est la couche de sécurité opérée par IDA au-dessus de l'hébergement Render. Elle doit fournir des politiques cohérentes, de la visibilité et une réponse aux abus pour les sites IDA Studio et les API clientes, sans confondre protection applicative et capacité d'absorption réseau.

## Architecture cible

Internet
  |
Protection réseau / edge anti-DDoS (Render et/ou fournisseur edge)
  |
IDA Shield Edge Gateway (service indépendant, multi-site)
  - routage par hostname vers une liste d'origines autorisées
  - WAF géré par règles versionnées
  - rate limits par route, IP et identité authentifiée
  - limites de taille / méthode / temps de requête
  - détection de bots et challenges graduels quand pris en charge
  - journal d'incidents minimisé, métriques et alertes
  |
Origines Render (sites et APIs)
  |
Middleware IDA Shield SDK pour les API compatibles
  - limites métier supplémentaires
  - idempotence et protection des opérations coûteuses
  - refus explicites et audit sans secrets ni corps sensibles

Le gateway est un service de reverse-proxy dédié, séparé des applications et sans accès aux secrets métier. Il ne doit pas être placé dans le processus de l'API IDA principale : une surcharge ou une panne de l'API ne doit pas arrêter la fonction de protection.

## Modèle de déploiement multi-sites

Un registre central versionné associe chaque hostname à une origine approuvée et à un profil de sécurité. Aucun hostname ni aucune URL d'origine fournis par un visiteur ne sont utilisés directement pour construire une requête upstream.

Chaque site dispose de :
- un identifiant stable et un propriétaire ;
- ses hostnames canoniques et aliases vérifiés ;
- son origine Render exacte ;
- un profil WAF et des limites spécifiques ;
- un état de rollout (observe, challenge, enforce) ;
- une procédure de rollback et un contact d'incident.

Ne pas faire basculer un domaine de production avant validation de l'origine, des certificats TLS, des formulaires, des parcours de conversion, du SEO, des callbacks et du rollback.

## Contrôles obligatoires

1. **Allowlist d'origines** : aucune résolution proxy vers une origine arbitraire (prévention SSRF).
2. **Confiance proxy** : n'utiliser les en-têtes IP transmis que si la requête provient d'un proxy de confiance configuré. Ne jamais faire confiance à X-Forwarded-For fourni par le client.
3. **Rate limiting distribué** : stockage partagé (par ex. Redis/Key Value) ; les compteurs en mémoire ne sont pas suffisants sur plusieurs instances.
4. **Règles par route** : seuils distincts pour navigation, recherche, connexion, formulaire, upload et API coûteuse.
5. **Limites de requêtes** : taille de corps, nombre de paramètres, méthodes, délais et concurrence.
6. **Protection applicative** : validation serveur, CSRF lorsque pertinent, quotas de compte, idempotence des mutations, CAPTCHA/challenge adaptatif si nécessaire.
7. **Journalisation** : horodatage, site, règle, décision, route normalisée et identifiant de requête ; ne pas enregistrer mots de passe, cookies, jetons, corps de formulaires ou données personnelles inutiles.
8. **Fail-safe** : politique explicite si le magasin de rate limits ou le gateway est indisponible ; pas de bascule silencieuse vers une origine publique non protégée.
9. **Administration** : authentification forte, moindre privilège, audit des changements, clés et secrets stockés uniquement dans le gestionnaire de secrets.
10. **Observabilité** : taux 403/429/5xx, latence edge, taux de challenge, erreurs upstream et alertes sur pics inhabituels.

## Limite importante : contournement de l'origine

Un reverse-proxy n'offre pas une protection complète si l'origine Render reste accessible directement par son URL onrender.com. Avant d'annoncer le mode enforcement, il faut prouver qu'un attaquant ne peut pas contourner IDA Shield :
- vérifier les options d'accès privé et de restriction réseau réellement disponibles pour chaque service Render ;
- sinon, mettre en place une méthode d'origine protégée supportée par la plateforme, ou documenter explicitement le risque résiduel ;
- ne pas prétendre qu'un simple secret partagé ou un header ajouté dans le navigateur sécurise une origine publique.

Les sites statiques sont servis directement par Render : le middleware d'API ne les protège pas. Pour eux, la protection complète exige que le domaine public passe par le gateway/edge et que le contournement de l'origine soit maîtrisé.

## Plan de livraison sans interruption

### Phase 0 — inventaire et mode observation
- Inventorier les services Render, domaines, DNS, formulaires, APIs et origines.
- Tester l'état actuel et enregistrer les résultats de référence.
- Déployer le gateway sur une URL de test distincte ; ne modifier aucun DNS de production.
- Vérifier TLS, routage, cache, redirections, en-têtes, uploads, formulaires et parcours mobiles.

### Phase 1 — règles et tests
- Ajouter des tests unitaires pour les limites, la normalisation des chemins, les hostnames inconnus, les en-têtes IP non fiables et les erreurs upstream.
- Tester en environnement de prévisualisation uniquement.
- Démarrer en mode observe, sans blocage utilisateur, et calibrer les seuils sur le trafic légitime.

### Phase 2 — bascule contrôlée
- Basculer un domaine de prévisualisation, puis un seul domaine de production avec fenêtre de surveillance.
- Vérifier disponibilité, formulaires, SEO, analytics, CSP, TLS et codes HTTP.
- Garder un rollback documenté et immédiat.
- Étendre aux autres sites uniquement après validation de la première vague.

### Phase 3 — enforcement et exploitation
- Activer les blocages progressifs pour les règles validées.
- Mettre en place alertes et revue périodique des faux positifs.
- Faire des tests de charge autorisés et non destructifs ; aucun test DDoS volumétrique sur les sites en production.

## Critères d'acceptation

- Aucun changement DNS en production pendant les phases 0 et 1.
- Hostnames inconnus refusés ; aucune origine upstream choisie par l'utilisateur.
- Les limites sont partagées entre instances et vérifiées par tests.
- Les adresses IP client ne sont fiables qu'avec une chaîne de proxy configurée.
- Les journaux n'exposent aucun secret ou contenu sensible.
- Les tests de régression des parcours critiques passent.
- Une procédure de rollback a été testée.
- Le rapport final distingue les protections Render natives, les protections IDA Shield actives et les risques résiduels.

## Ce que ce projet ne promet pas

IDA Shield ne remplace pas la capacité d'absorption d'un fournisseur réseau anti-DDoS. Une attaque volumétrique doit être absorbée en amont, avant que le trafic ne consomme la bande passante de l'origine. IDA Shield ajoute le contrôle applicatif, la limitation des abus, l'observabilité et une politique uniforme au-dessus de cette couche.
