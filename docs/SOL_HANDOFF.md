# IDA — Relais de consolidation pour Sol

## Périmètre de la passe Astra — 5 septembre 2026

À la demande de l’utilisateur, cette passe se limite aux invariants sensibles du cycle Identity local et aux tests adversariaux. Pas de nouvelle phase métier, dépendance, intégration, modèle ou service cloud.

Livré :

- Révocation transactionnelle et définitive des tokens après désactivation/réactivation d’un utilisateur, appareil, membership ou grant. Les instances indépendantes gardent leurs droits propres ; une réactivation nécessite un nouveau token.
- Annulation des émissions de session en attente/en cours lors d’un verrouillage explicite, sans remettre à zéro un credential déjà créé. La fermeture cible aussi la session déjà émise de l’instance locale serveur lorsque le navigateur présente encore l’ancien cookie de rotation, ou aucun cookie. Ce cas a été reproduit en échec avant correction, puis retesté.
- Premier `LocalAccessGate` français : setup, unlock, lock, erreur réseau et temporisation. Les modules métier ne sont montés qu’après confirmation serveur. Les erreurs ne deviennent jamais implicitement une démo ouverte.
- Transport partagé : cookie géré par le navigateur, même origine obligatoire pour l’accès, absence de cache, rejet des réponses obsolètes, pas de replay automatique des mutations. Un échec de fermeture reste masqué jusqu’à nouvelle tentative de verrouillage.
- Contrat `GET /v1/auth/status` explicite dans les deux modes, OpenAPI et documentation alignés. `LOCAL_DEMO` reste le défaut avant initialisation ; le verrou reste strictement loopback.

Fichiers principaux : `apps/api/src/local-auth.ts`, `apps/api/src/database.ts`, `apps/web/src/local-access.ts`, `apps/web/src/api-transport.ts`, `apps/web/src/LocalAccessGate.tsx`, `packages/contracts/src/identity.ts`. Tests dédiés : `local-auth-races.test.ts`, `local-auth-revocation.test.ts`, les deux `local-access.test.ts`, ainsi que les tests Identity/HTTP existants.

## À reprendre par Sol, sans reconstruire le Core

Vérification finale de cette passe : **135 tests réussis dans 12 fichiers** (`vitest run`), types des quatre packages/apps, lint Biome et builds contrats/domain/API/web réussis. Aucun ajout de dépendance. Ces contrôles ont utilisé directement le runtime Node local déjà installé.

1. Faire la recette réelle dans un navigateur local : démo, setup, mauvaise phrase, temporisation, unlock, lock, réseau interrompu, deux onglets, retour d’onglet et rechargement. Ne pas enregistrer de passphrase ou cookie dans captures, logs ou documentation. Utiliser des données fictives et un credential de test, jamais le compte de l’utilisateur. Le setup rend le verrou persistant : ne pas l’activer sur la base de travail par inadvertance et ne pas supprimer cette base pour réinitialiser.
2. Vérifier clavier, focus, lecture des erreurs, zoom et viewport mobile. L’apparence de `LocalAccessGate` et le bouton « Verrouiller IDA » sont une première base, pas une interface validée visuellement. Polir uniquement les composants nécessaires avec les tokens existants. Le masquage d’un onglet démonte le hub et abandonne les formulaires non soumis ; vérifier ce compromis d’usage et l’expliquer sans stocker silencieusement des brouillons privés.
3. Consolider un scénario de démonstration français de bout en bout : Artist Brain → release/morceau → import de média fictif → recherche → brief de campagne → proposition préexistante/approbation → planification interne → tâche → préférence consentie → historique de commande. Utiliser seulement les capacités réellement livrées ; documenter un écart au lieu de simuler une intégration active.
4. Terminer un guide de lancement et de démonstration court. Relancer tests, types, lint et builds après toute correction ; faire un commit logique. Conserver les onze modules, notamment Content, Social, Calendar, Campaigns et Analytics, sans les présenter comme intégrés à des comptes sociaux réels.

Le proxy Vite de même origine est requis pour l’accès ; laisser `VITE_IDA_API_URL` vide. Les viewports mobiles sont une recette responsive locale, pas une autorisation d’accès LAN ou Internet depuis un téléphone. Les binaires natifs et le Device Linking réel restent futurs.

## Limites à ne pas effacer

La révocation n’annule pas une action métier déjà exécutée. Le masquage client ne garantit pas l’effacement de la mémoire du navigateur. Le polling de statut ne prolonge pas l’inactivité. La révocation SQL est conservatrice pour le profil mono-workspace actuel ; voir `DATABASE.md` avant toute extension. Un compte OS compromis reste hors protection de ce verrou local.

OAuth/publication réels, IA générative générale, voix, banque/budget, courses, anglais, thèmes cinématiques, gestes et agents de gouvernance demeurent aux jalons prévus. Aucun capteur ou agent permanent n’a été activé.

## État de la démo

Estimation communiquée : **environ 75 % de la démo locale testable et fonctionnelle**, appréciation du périmètre et non mesure automatique. Ne pas l’augmenter au seul nombre de tests. La recette navigateur et le scénario complet restent nécessaires ; ce pourcentage ne concerne ni l’IDA finale ni les intégrations sociales, l’IA générale ou le déploiement multi-appareils.

La passe Astra n’a pas effectué de recette visuelle dans le navigateur. Ne pas présenter la démo comme homologuée, déployée ou prête pour des données personnelles réelles.
