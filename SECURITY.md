# SECURITY — principes de sécurité et d’exploitation

> **Statut :** architecture complétée et première tranche locale implémentée ; aucune donnée réelle ni intégration externe n’est active.
> **Dernière revue :** 30 août 2026.
> **Règle MVP :** aucune publication publique, aucun paiement et aucun transfert ne peuvent être déclenchés sans une validation humaine explicite — et les paiements/transferts ne font pas partie du périmètre MVP.

## 1. Objectif

IDA centralisera des actifs sensibles : morceaux non publiés, stems, stratégie artistique, mémoire, calendrier, comptes sociaux et, plus tard, éventuellement des données personnelles générales. La sécurité doit donc être une propriété du noyau et de l’API partagée par le desktop et le mobile, pas une fonction ajoutée dans les interfaces.

Le choix initial recommandé est un **monolithe modulaire avec des workers isolés**, et non des microservices prématurés. Les frontières de domaine, les permissions et les secrets doivent cependant être réels dès la Phase 1 afin de permettre une évolution sûre.

## 2. Actifs et classification

| Niveau | Données | Règle minimale |
|---|---|---|
| S0 — secret | clés de signature, clés de chiffrement, mots de passe, jetons OAuth, chaînes de connexion | Jamais dans le frontend, Git, les logs ou les prompts. Coffre à secrets et chiffrement applicatif. |
| S1 — privé sensible | démos, masters, stems, unreleased, mémoire artistique, calendrier, stratégie, conversations | Accès par workspace uniquement, stockage privé, URLs signées temporaires, journalisation d’accès sensible. |
| S2 — interne | brouillons, campagnes, tâches, règles éditoriales, statistiques non publiques | Autorisation serveur et conservation définie. |
| S3 — public | publications effectivement publiées, liens publics, métadonnées choisies | Toujours relié à sa source et à son historique d’approbation. |

Une donnée ne doit être envoyée à un modèle IA ou à un fournisseur externe que si elle est nécessaire à la demande, autorisée pour cet usage et jamais de niveau S0.

## 3. Frontières de confiance

```text
Desktop / Mobile
       │
API partagée — authentification, validation, limites de débit
       │
Couche de politique — autorisation, consentement, audit
       │
IDA Core — interprète et prépare une action structurée
       │
Tool Gateway — vérifie droit, schéma, état, idempotence
       ├── Base relationnelle et mémoire
       ├── Stockage média privé
       ├── Queue / workers isolés
       └── Adaptateurs OAuth et APIs externes
```

L’IA n’obtient ni accès direct à la base de données, ni clé de production, ni jeton social. Elle peut demander un outil via une sortie structurée ; le serveur décide ensuite de l’autoriser, de créer une proposition ou de la refuser.

### 3.1 Frontières temporaires du runtime local

- L’identité et le workspace de démonstration sont fixés uniquement côté serveur ; un header, un query string ou le corps d’une requête ne peut pas choisir un autre workspace.
- PGlite est conservé dans un dossier local ignoré par Git. Il ne contient que des données de démonstration, aucun secret, token, média privé ou identifiant bancaire.
- L’API locale n’accepte que l’origine du Command Center de développement et n’utilise pas de cookies de session tant que l’authentification réelle n’est pas livrée.
- Les outils réellement exposés dans cette tranche sont en lecture. Les chemins `WRITE`, `APPROVAL_REQUIRED`, `PUBLISH` et `SYSTEM` ne sont pas accessibles depuis la commande web.
- Ce runtime n’est pas éligible à une bêta avec données personnelles. Avant cela, les exigences de la section 12 restent obligatoires.

## 4. Identité, appareils et autorisation

### Multi-appareils

- Utiliser un fournisseur d’identité/OIDC géré ou une implémentation équivalente maintenue ; ne pas fabriquer un système de mots de passe maison.
- Centraliser les sessions côté backend. Pour le web, employer des cookies `HttpOnly`, `Secure` et adaptés à la protection CSRF ; pour une future application native, utiliser le stockage sécurisé de l’OS.
- Prévoir des sessions courtes, rotation des refresh tokens, liste des appareils, révocation par appareil et révocation globale.
- Exiger une authentification multifacteur du propriétaire avant la connexion d’un réseau social ou toute élévation de privilège.
- Appliquer des limites de tentative de connexion, la vérification d’e-mail et une notification de nouvel appareil.

Les jetons de session, JWT et refresh tokens ne doivent jamais être stockés dans `localStorage` ou `sessionStorage` : une vulnérabilité XSS suffirait à les exfiltrer.

### Isolation des données et RBAC

Même pour un seul propriétaire, créer dès le départ un `Workspace` et une `Membership`. `ArtistProject` appartient au workspace ; il ne le remplace pas. Chaque donnée métier persistante porte un `workspace_id` non nul, et les requêtes sont filtrées par cette clé côté service et, lorsque la base le permet, par Row Level Security.

Rôles initiaux :

- `OWNER` : propriétaire du workspace ; seul rôle exposé dans le premier MVP.
- `EDITOR` et `VIEWER` : prévus au modèle de permission, sans nécessairement être exposés dans l’interface initiale.
- `SYSTEM` : identité de service limitée à une fonction précise, jamais une session utilisateur déguisée.

Les niveaux fonctionnels demandés par IDA s’appliquent côté serveur :

| Niveau | Effet autorisé |
|---|---|
| `READ` | Consulter des données déjà autorisées dans le workspace. |
| `WRITE` | Créer ou modifier des données internes et des brouillons. |
| `APPROVAL_REQUIRED` | Créer une proposition ; aucune mutation publique externe. |
| `PUBLISH` | Exécuter une publication uniquement sur une approbation durable et explicite du propriétaire. |
| `SYSTEM` | Configurer une intégration ou un service ; réservé et audité. |

L’interface ne constitue jamais une preuve d’autorisation. Une URL, un ID ou un outil reçu du client doit être revérifié dans son workspace au moment de l’action.

## 5. Approval Center et sécurité des agents

Une action à effet externe suit l’état :

```text
DRAFT → PROPOSED → APPROVED → SCHEDULED → DISPATCHING → PUBLISHED | FAILED
```

- Une `Approval` référence le média, la caption, la plateforme, le compte, la date et la **version** exacte du post.
- Modifier un de ces éléments invalide l’approbation et renvoie le post à `PROPOSED`.
- Le worker vérifie de nouveau l’approbation, l’état du compte et la version juste avant l’envoi.
- Une clé d’idempotence et un verrou de job empêchent les doubles publications lors d’un retry.
- L’« AI reasoning » affiché à l’utilisateur est une justification courte et vérifiable, pas une chaîne de raisonnement interne ni un secret de système.

Les contenus importés, les commentaires sociaux et les pages web sont des **données non fiables**. Ils ne peuvent pas modifier les instructions système ni élargir les permissions d’un outil. Chaque appel d’outil doit passer par une liste blanche, un schéma de paramètres, une politique d’autorisation et un journal d’audit.

## 6. OAuth, secrets et connecteurs

- Séparer `SocialAccount` (identité et état public du compte) de `SocialCredential` (jetons chiffrés et métadonnées d’expiration).
- Employer Authorization Code + PKCE, `state` lié à la session, redirect URIs strictement enregistrées et scopes minimaux.
- Chiffrer les refresh tokens et autres secrets applicativement par enveloppe avec un KMS/coffre à secrets ; conserver le `key_id`, pas la clé elle-même.
- Ne déchiffrer un secret qu’au sein de l’adaptateur concerné, au dernier moment ; ne jamais le renvoyer au navigateur ni le copier dans une queue.
- Prévoir expiration, réauthentification, révocation, rotation et l’état `REAUTH_REQUIRED` d’un compte connecté.
- Les webhooks ultérieurs doivent vérifier signature, date/rejeu et source avant de créer un événement.

L’authentification d’IDA et l’autorisation d’un compte Instagram, TikTok, YouTube ou Facebook sont deux flux distincts. L’un ne doit jamais donner accès à l’autre.

## 7. Médias et bibliothèque de contenu

Le flux d’upload recommandé est :

```text
Demande d’upload autorisée → URL signée courte vers zone de quarantaine
→ contrôle taille/type/signature/hash → scan et traitement worker isolé
→ dérivés/aperçus → statut READY ou REJECTED
```

- Stocker les originaux dans un stockage objet privé, avec une clé générée côté serveur ; ne jamais employer le nom fourni comme chemin de stockage.
- Limiter strictement extensions, MIME réel, signature binaire, taille, durée et nombre de fichiers. Ne pas faire confiance au seul `Content-Type` envoyé par le navigateur.
- Ne jamais servir un fichier non contrôlé directement depuis le domaine applicatif. Générer des aperçus et transcodages dans un environnement isolé.
- Mettre en quarantaine et scanner les médias avant usage. Les archives et formats actifs ou exécutables ne sont pas nécessaires au MVP.
- Les URLs de lecture sont signées, courtes et liées à un objet autorisé. Les médias non publiés ne doivent pas être indexables ou publics.
- Le hash de déduplication est utile, mais son usage doit rester limité au workspace afin de ne pas révéler indirectement qu’un autre utilisateur possède le même fichier.
- Prévoir une option de suppression des métadonnées GPS/EXIF des dérivés destinés à la publication.

## 8. API, limites et traitements asynchrones

- Valider toutes les entrées avec des schémas partagés et des IDs non prédictibles. Ajouter pagination, limites de taille et contrôles de concurrence sur les écritures sensibles.
- Appliquer des limites de débit distribuées par IP, utilisateur, workspace et route ; protéger particulièrement login, upload, commandes IA, callbacks OAuth et endpoints de publication.
- Imposer des quotas de stockage, de transcodage et de consommation IA. Les erreurs de quota doivent être claires et ne jamais contourner la file d’approbation.
- Exécuter analyse de médias, imports, synchronisations et publications dans des workers séparés du serveur HTTP.
- Les jobs sont idempotents, bornés en retries, avec backoff, dead-letter queue et alertes. Le payload d’un job contient des IDs et des versions, pas des secrets ni un média complet.
- Les dates sont stockées en UTC avec le fuseau du workspace conservé explicitement ; le scheduler doit gérer le changement d’heure et les retries sans dupliquer un post.

## 9. Journalisation, mémoire et confidentialité

Conserver séparément :

- les logs opérationnels (erreurs, performance, corrélation) ;
- les `ActivityLog` d’audit (acteur humain, agent ou système ; action ; cible ; version ; résultat ; date) ;
- l’historique conversationnel et la mémoire, dont la rétention est contrôlée par l’utilisateur.

Journaliser notamment : connexion/révocation, changement de rôle, connexion sociale, upload/suppression, création/modification de mémoire, approbation/rejet, déclenchement/résultat de job et changement de configuration. Ne jamais journaliser secrets, mots de passe, cookies, jetons, clés, chaînes de connexion, médias privés ou prompts complets.

La mémoire permanente reste opt-in : IDA demande confirmation avant de stocker une préférence durable. L’utilisateur doit pouvoir consulter, corriger et supprimer sa mémoire. Les données servant au contexte IA sont minimisées et filtrées par workspace.

## 10. Exploitation, sauvegardes et environnements

### Environnements

- Séparer comptes, bases, buckets, secrets, clients OAuth et noms de domaine de développement, staging et production.
- Ne jamais copier les données de production vers dev. Utiliser des jeux de données synthétiques ou anonymisés.
- Garder les secrets hors du dépôt ; scanner les commits et la CI pour les fuites. Les migrations sont testées en staging et précédées d’une sauvegarde vérifiée.
- Restreindre CORS aux origines IDA connues ; exposer des contrôles de santé minimaux sans détail interne.

### Sauvegarde et observabilité

- Automatiser les sauvegardes de base et activer le point-in-time recovery lorsqu’il est disponible. Versionner le stockage média et chiffrer les backups.
- Définir avant bêta un RPO/RTO réaliste ; point de départ recommandé : perte de données maximale de 24 h et restauration cible sous 4 h, à adapter au budget.
- Tester une restauration complète dans un environnement isolé avant toute promesse de sauvegarde.
- Alerter sur échec de backup, saturation stockage/queue, dead-letter queue, hausse d’erreurs, expiration de jeton, échec de publication et pic inhabituel de coût IA.
- Maintenir des runbooks courts : perte de téléphone, compte compromis, jeton expiré, job bloqué, erreur de publication et restauration.

## 11. Domaine futur : Finance et Banque

IDA ne met **aucune** fonction Finance/Banque en œuvre dans le MVP. L’architecture doit néanmoins empêcher ce futur domaine de devenir une extension banale du chat ou des outils sociaux.

### Principes non négociables

- **Isolation forte :** domaine `Finance` séparé, données et clés de chiffrement séparées, identité de service dédiée, logs d’audit dédiés et absence d’accès par défaut depuis les agents généralistes, sociaux ou marketing.
- **Lecture seule par défaut :** un futur connecteur ne peut lire que les données explicitement consenties. Aucun paiement, virement, ordre de trading, prélèvement, ajout de bénéficiaire ou modification bancaire ne sera proposé ou exécuté par IDA.
- **Consentement granulaire :** connexion, périmètre, durée, finalité et révocation doivent être visibles et confirmés par l’utilisateur. Toute reconnexion ou élargissement de scope redemande un consentement.
- **Pas d’identifiants bancaires :** ne jamais demander ni stocker mot de passe bancaire, code SMS, PIN ou secret d’authentification. N’étudier plus tard que les parcours OAuth/Open Banking officiellement autorisés et des partenaires régulés.
- **Aucun accès IA implicite :** les transactions et soldes bruts ne sont pas injectés dans le contexte IA par défaut. Une requête explicite peut fournir un résumé minimal, filtré et audité ; jamais de secret ou d’identifiant complet.
- **Pas de mélange silencieux :** les données financières ne sont pas rapprochées de la mémoire artistique, des données sociales ou de la publicité sans opt-in explicite et finalité déclarée.

Avant toute intégration financière, il faudra réaliser un threat model dédié, vérifier les obligations réglementaires et contractuelles applicables (notamment Open Banking/PSD2 selon les territoires), choisir un fournisseur habilité, définir une politique de conservation/suppression et faire valider le modèle de consentement. Cette étude est une phase distincte, non une sous-tâche de l’intégration sociale.

## 12. Conditions de sortie de Phase 1

Avant une bêta avec données réelles :

1. tests prouvant qu’un utilisateur/workspace ne peut jamais lire ou modifier l’objet d’un autre ;
2. tests montrant qu’une commande IA ne peut pas publier ni élargir ses droits ;
3. upload de fichiers invalides/malveillants refusé ou mis en quarantaine ;
4. approbation invalidée après toute modification pertinente ;
5. scan de secrets et dépendances dans la CI ;
6. sauvegarde automatisée et restauration testée ;
7. runbooks d’incident disponibles ;
8. inventaire des fournisseurs externes, de leurs données reçues et des règles de rétention.

## Références de conception

- [OWASP OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
