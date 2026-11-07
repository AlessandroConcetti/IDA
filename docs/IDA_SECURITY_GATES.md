# IDA Security Gates — vérification obligatoire avant publication

Statut : **NON CERTIFIÉ**. Ne pas annoncer « tout est sécurisé » sans preuves.

## 1. Isolation des données et RLS

- Recenser chaque base (PGlite locale, éventuels PostgreSQL/Supabase/Render externes), son mode d'accès et ses rôles.
- PGlite local n'est pas une preuve de RLS multi-tenant. Si le stockage est mono-instance locale, conserver l'isolation par contexte et contrôler toutes les requêtes. Si migration vers PostgreSQL partagé : activer RLS sur **chaque table multi-tenant** ; utiliser des rôles applicatifs non propriétaires, sans BYPASSRLS ; FORCE ROW LEVEL SECURITY quand nécessaire.
- Policies SELECT/INSERT/UPDATE/DELETE, WITH CHECK et USING ; tester accès croisés, insert avec autre workspace_id, update transfert de tenant, joins, vues, fonctions SECURITY DEFINER, stockage et service-role.
- Dériver tenant et identité de la session validée par le serveur, jamais d'un champ client non fiable.
- Ajouter des tests négatifs systématiques : utilisateur A ne lit/modifie/supprime jamais les données de B, y compris via identifiants directs.

## 2. Sept classes d'abus montrées par la vidéo

- Frontend : aucun secret, token serveur, clé IA ou règle d'autorisation critique embarqués.
- Clés IA : uniquement serveur, permissions minimales, budgets et quotas par tenant, rotation et alertes.
- Base : isolation et permissions SQL ; chiffrement et sauvegardes restaurables.
- IDOR/BOLA : autorisation objet par objet, même si l'ID est valide.
- Administration : contrôle RBAC/ABAC côté serveur, MFA, séparation des rôles, journal d'audit.
- Inscription : quotas et limitation par compte et par origine fiable ; contrôle anti-abus ; validation email quand pertinente.
- Webhooks : vérification HMAC/signature avec corps brut, horodatage, idempotence et anti-rejeu.

## 3. Gateway IDA Shield

- Préserver le runtime local : ne pas modifier assertLocalOnlyHost pour exposer l'API.
- Gateway indépendant, sur un hostname de test, avec upstream allowlist et sans proxy ouvert.
- Stockage de compteurs partagé atomique et tests de concurrence.
- Ne jamais faire confiance à X-Forwarded-For du navigateur ; valider la chaîne proxy.
- Éviter les blocages automatiques sur seuls User-Agent, pays ou IP NAT ; surveiller les faux positifs.
- Empêcher le contournement par les URL d'origine Render, ou déclarer explicitement la limite.
- Vérifier TLS, DNS, headers, CSP, cookies, CORS, CSRF, upload, cache, SEO et redirections.
- Tests de charge non destructifs en préproduction uniquement.

## 4. Chaîne de livraison

- Exécuter pnpm install --frozen-lockfile, pnpm typecheck, pnpm test, pnpm build, puis tests navigateur.
- Scanner dépendances, secrets et workflows GitHub ; protéger main, exiger revue et checks.
- Déployer d'abord sur une nouvelle URL de preview, comparer métriques, puis basculer progressivement un domaine.
- Ne pas changer les DNS ni l'IP allowlist Render avant d'avoir un plan de retour arrière testé.
- Tester les parcours visiteurs, formulaires, comptes, API, admin, paiement si applicable, et mobiles.

## 5. Critère « prêt pour test utilisateur »

Pour chaque contrôle, consigner : environnement, version/commit, commande de test, résultat, date, preuve, risque résiduel, responsable.

Ne jamais affirmer « 100 % sécurisé » : formuler « contrôles vérifiés selon le périmètre audité » et publier la liste des limites restantes.

## Actions réservées au propriétaire

1. Confirmer les domaines et les services réellement destinés à la production, y compris les sites clients.
2. Vérifier l'accès aux panneaux DNS/registrar, Render, GitHub et aux bases réellement utilisées. Ne communiquer aucun secret dans le chat.
3. Autoriser le basculement DNS seulement après recette sur la préproduction et validation du rollback.
4. Effectuer les essais utilisateurs finaux sur l'environnement validé, sans test DDoS volumétrique.
