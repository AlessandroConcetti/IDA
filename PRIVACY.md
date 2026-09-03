# IDA — Vie privée, local-first et contrôle utilisateur

## Statut

Ce document fixe les invariants de vie privée de l'architecture cible. Le runtime de démonstration n'est pas encore autorisé à conserver des données personnelles réelles.

## Invariants

- collecte minimale et finalité explicite ;
- données privées locales lorsque la fonction peut être réalisée localement ;
- aucun envoi cloud silencieux ;
- séparation par utilisateur, workspace, module et classification ;
- contexte minimal remis à chaque agent ou outil ;
- mémoire permanente uniquement après consentement ;
- export, correction, suppression et rétention contrôlables ;
- aucune caméra ou microphone sans action explicite ;
- aucune donnée importée traitée comme une instruction fiable.

## Classes de données

| Classe | Exemples | Règle |
|---|---|---|
| `SECRET` | tokens, clés, credentials | coffre serveur uniquement ; jamais dans l'IA ou les logs |
| `SENSITIVE_PERSONAL` | banque, santé, domicile, identité | module isolé, consentement et rétention dédiés |
| `PRIVATE_CREATIVE` | démos, stems, stratégie, médias non publiés | stockage privé, accès workspace et egress explicite |
| `INTERNAL` | tâches, campagnes, brouillons | permissions et audit selon l'effet |
| `PUBLIC` | contenu réellement publié | provenance et historique d'approbation conservés |

La classification est portée par les données et les outils ; elle ne dépend pas du thème, du client ou du modèle choisi.

## Context Broker

Le Context Broker construit une vue minimale à partir de l'intention, du module, de l'agent, de l'utilisateur, du workspace, de l'appareil et des consentements. Il refuse les croisements de domaines non déclarés. Un agent Social n'obtient pas les transactions bancaires ; un agent Finance n'obtient pas les stems ou messages privés sans une nouvelle finalité explicite.

## Egress Policy

Avant toute sortie vers un provider externe, IDA vérifie :

1. demande et finalité ;
2. classes de données ;
3. provider et destination ;
4. minimisation ou pseudonymisation ;
5. consentement et configuration du workspace ;
6. rétention contractuelle connue ;
7. audit redacted.

Une impossibilité de vérification bloque l'envoi. Le mode `NORMAL` garantit qu'aucun modèle IA n'est appelé.

## Caméra, microphone et gestes

Une permission accordée par l'OS ne constitue pas une demande. Caméra et microphone restent fermés jusqu'à une action explicite dans le parcours courant, affichent un indicateur pendant leur usage et s'arrêtent immédiatement sur demande. Agents et automatisations ne peuvent pas les activer. Les détails du contrôle gestuel futur figurent dans `INPUT_PROVIDERS.md`.

## Identité et appareils

Chaque appareil possède sa propre session révocable et peut recevoir des droits plus faibles que le compte. Une adresse e-mail seule ne donne jamais accès à un workspace. Les caches clients sont bornés, chiffrés lorsque l'OS le permet et supprimables à la révocation. Voir `IDENTITY_DEVICE_LINKING.md`.

## Workspace local et SSD

La racine de données pourra être configurable pour un disque interne ou un SSD externe. Le vault sera chiffré, verrouillé par un seul Core autoritaire, portable entre hôtes approuvés et indépendant des lettres de lecteur. La clé ne sera pas conservée en clair sur le SSD. Le volume portable ne remplace jamais une sauvegarde séparée et testée.

## Droits et cycle de vie

Avant toute bêta réelle, l'utilisateur doit pouvoir :

- connaître les données détenues et leur finalité ;
- exporter ses données dans un format documenté ;
- corriger ou supprimer une mémoire et les données éligibles ;
- révoquer appareil, session, provider et consentement ;
- voir les délais de conservation ;
- distinguer suppression logique, purge définitive et obligations de conservation.

Les audits peuvent nécessiter une rétention distincte, mais ne doivent pas conserver de texte libre ou secret inutile.

## Domaines sensibles futurs

Finance/Banque reste en lecture seule ; Santé n'effectue aucune décision clinique ; Maison ne commande aucun équipement critique sans conception dédiée ; Legal ne garantit aucun conseil professionnel. Chaque domaine reçoit un consentement, une clé, une rétention, une projection d'audit et des tests négatifs propres avant activation.

## Privacy Stewards par domaine — futur

Après consolidation de la démo, chaque domaine traitant des données personnelles devra déclarer son propre `Privacy Steward Agent` logique. Une implémentation et des règles communes pourront être réutilisées, mais chaque manifeste conservera un scope, des finalités, une rétention, des destinataires, des exports et une escalade séparés. Le steward Music ne peut donc pas inspecter Finance, et réciproquement.

La « vérification constante » repose sur deux mécanismes complémentaires : des policies déterministes contrôlent chaque collecte, lecture, export, transmission, conservation et suppression ; des audits planifiés recherchent ensuite les écarts. L'agent reçoit seulement les constats minimaux et redacted pour les expliquer, proposer une correction ou alerter l'utilisateur. Il ne surveille pas librement toutes les données, ne décide pas seul de la conformité RGPD et ne remplace ni le responsable de traitement ni, lorsqu'il est requis, un DPO ou un conseil juridique.
