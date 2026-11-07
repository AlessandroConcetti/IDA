# IDA Shield — matrice défense en profondeur et responsabilités

**Portée** : IDA CORE, IDA PRO, IDA Studio, applications, API, bases de données, tous les sites clients et futurs projets. Cette matrice est une exigence de livraison, **pas une attestation de sécurité**.

| Domaine | IDA Shield / développement (assistant + Codex) | Fournisseur / hébergeur | Propriétaire IDA | Preuve exigée |
|---|---|---|---|---|
| L1 physique | Classification des données, chiffrement applicatif si nécessaire, politique de sauvegarde | Datacenters, accès physique, stockage et chiffrement au repos documenté | Chiffrer postes, sauvegardes locales, clés de récupération hors poste | Attestation hébergeur + test restauration |
| L2 liaison | Aucune configuration des switches Render par code applicatif | Segmentation physique/virtuelle, ARP/DHCP, isolation hyperviseur | Wi-Fi WPA3/WPA2 fort, firmware routeur, segmentation des appareils sensibles | Documentation fournisseur + audit LAN autorisé |
| L3 réseau | Inventaire des origines, interdiction de proxy ouvert, configuration edge | Filtrage anti-spoofing, absorption DDoS, IP allowlists | Validation DNS et des chemins réseau | Test absence de contournement direct Render |
| L4 transport | Timeouts, limites de concurrence et de requêtes | Pare-feu TCP/UDP, SYN flood, ports publics | Validation des ports et des services | Tests de disponibilité et inventaire ports |
| L5 sessions | Cookies Secure/HttpOnly/SameSite, rotation, invalidation serveur, anti-CSRF, MFA | Terminaison TLS quand déléguée | Activation MFA/passkeys sur tous les comptes administrateurs | Tests logout, expiration, vol/rejeu de session |
| L6 présentation | Validation de schémas, limites de parsing, encodage sûr, CSP | TLS et renouvellement des certificats | Validation certificats/domaines | Tests TLS, parsing et CSP |
| L7 application | WAF, autorisation objet par objet, RLS si base compatible, requêtes paramétrées, protection XSS, webhook HMAC, quotas IA | Edge/WAF et protection contre saturation L7 selon offre | Validation des flux métier et de la confidentialité client | Tests IDOR/BOLA, injection, isolation tenant, webhook |
| L8 humain | CI, scan secrets, revue PR, journal d'audit, gestion des rôles | Sécurité des comptes fournisseur | MFA FIDO2, sauvegarde codes, procédure phishing et révocation des accès | Revue trimestrielle des accès + exercice incident |

## Points de vigilance

- Les couches OSI sont un **modèle pédagogique**, pas un découpage exhaustif des responsabilités de sécurité cloud.
- TLS 1.3 est préféré ; TLS 1.2 moderne reste acceptable si correctement configuré. Désactiver SSLv3, TLS 1.0 et 1.1.
- Le RLS n'est applicable que si le moteur SQL et le modèle d'authentification le prennent en charge. Une base locale PGlite ne doit pas être déclarée multi-tenant sécurisée sans tests d'autorisation.
- Les protections WAF ne remplacent ni l'authentification, ni l'autorisation serveur, ni la validation métier.
- Un reverse-proxy sur Render ne peut pas absorber seul un DDoS volumétrique.
- Les outils offensifs usuels (Nmap, Burp Suite, OWASP ZAP, sqlmap, Metasploit, nuclei, ffuf) servent à **modéliser les attaques et bâtir les tests autorisés** ; leur popularité ne prouve pas qu'une défense est complète. N'exécuter que des tests sur des actifs appartenant à IDA ou avec autorisation explicite, et préférer les scans passifs/non destructifs en production.

## Gates pour tout nouveau projet

1. **Inventaire** : domaine, origine, propriétaire, classification des données, bases, secrets, APIs et webhooks.
2. **Threat model** : accès visiteurs/clients/admin, limites de confiance, flux de données, abus IA, fraude et dépendances.
3. **Tests automatisés** : analyse de dépendances, secrets, autorisations négatives, schémas, headers et quotas.
4. **Préproduction** : déploiement isolé, contrôle DNS/TLS, anti-bypass, validation du routage et des formulaires.
5. **Recette humaine** : scénarios métier, sauvegardes, accès d'urgence, rollback.
6. **Publication** : approbation explicite du propriétaire et rapport des risques résiduels.

**Ne jamais fusionner automatiquement une correction de sécurité qui modifie les permissions ou le routage sans tests et plan de retour arrière.**
