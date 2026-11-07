# IDA Shield — ordre de déploiement et blocages (2026-11-07)

Périmètre : IDA, IDA PRO, IDA Studio, tous les sites clients actuels et futurs.

## État vérifié
- Une passerelle de **préproduction** Render existe : ida-shield-preview.onrender.com ; elle ne protège pas les domaines publics.
- 20 services Render recensés, dont la passerelle ; les origines publiques ont des règles 0.0.0.0/0.
- Les protections RLS de toutes les bases, le WAF distribué, les DNS et les domaines personnalisés ne sont pas encore certifiés.

## Conditions bloquantes pour un basculement
1. **Réseau** : disposer d'un chemin de proxy protégé avec identité réseau vérifiable, et prouver l'absence de contournement via onrender.com. Ne pas bloquer 0.0.0.0/0 avant ce test.
2. **DNS** : relever les zones OVH et chaque domaine client ; valider certificats, CAA, CNAME, TTL et rollback.
3. **Rate limiting** : remplacer les compteurs locaux de démonstration par un backend atomique partagé et des tests de concurrence.
4. **Passerelle** : tests de proxy, cache, en-têtes, redirects, cookies, formulaires, uploads, APIs et latence. La preview actuelle ne gère que GET/HEAD et n'est pas une solution de production.
5. **RLS** : inventaire de chaque base et de ses rôles ; pour PostgreSQL multi-tenant, activer et tester les politiques par table. Pour PGlite local, auditer et tester l'autorisation applicative plutôt que prétendre à un RLS serveur non vérifié.
6. **CI** : tests verts et revues de code ; ne pas fusionner une PR sans ces preuves.

## Règles permanentes pour les futurs sites
- Chaque nouveau projet doit déclarer son domaine, son origine, son propriétaire, sa base, son profil d'accès, son statut preview/prod et son plan de retour arrière.
- Refuser la mise en production si le chemin réseau et l'isolation des données ne sont pas vérifiés.
- Les sites statiques sans comptes ne nécessitent pas un RLS fictif : les bases et API qu'ils appellent doivent être sécurisées.
- Ne jamais stocker de secrets dans GitHub, les logs, les pages HTML ou les prompts.
- Ne jamais promettre 100 % de sécurité.

## Actions propriétaire à effectuer sur Render après rappel
- Ouvrir la configuration du service IDA Studio et relever la présence d'Inbound IP Rules / IP Allow List, les domaines personnalisés et leurs certificats, sans changer les règles.
- Vérifier les options d'IP sortante stable ou de réseau privé pour la passerelle, puis choisir un mécanisme de verrouillage des origines compatible.
- Fournir uniquement les résultats de configuration (pas de clés ni de mots de passe) pour préparer la bascule.
