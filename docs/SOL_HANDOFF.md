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

La passe sécurité ci-dessus n’avait pas effectué de recette visuelle dans le navigateur. Ne pas présenter la démo comme homologuée, déployée ou prête pour des données personnelles réelles.

## Tranche Aurora — 5–6 septembre 2026

L’utilisateur a rappelé que le frontend de la démo doit reprendre ses deux visuels. L’accueil `AuroraHome` est livré : décor architectural généré autonome, cinq cartes vers les espaces existants, six modules supplémentaires dans l’explorateur, champ de commande relié au Core, compteurs issus de l’API, contraste de transparence temporaire et navigation mobile classique. Les espaces internes et le verrou partagent la palette claire ; aucun changement de sécurité, de schéma ou de permission n’en dépend.

Validation : **138 tests / 13 fichiers**, types web, lint global et build web réussis. Aucun ajout de dépendance. Les builds contrats/domain/API avaient également été vérifiés avant cette passe purement cliente. Contrôles navigateur ciblés sur données fictives en mémoire : accueil desktop, viewport mobile de 390 × 844, carrousel, exploration des autres espaces, ouverture Music Brain/Contenus, commande « aujourd’hui » réellement traitée par le Core, focus de titre et remise en haut à la navigation. Aucun débordement horizontal de page observé sur ce viewport mobile ; aucun avertissement/erreur dans les logs navigateur consultés. Cela ne couvre pas Safari/iPhone ou Android physiques, le parcours métier intégral ni le cycle du verrou en navigateur.

Le décor est livré dans le workspace mais ignoré par Git suivant la règle sur les médias : [provenance, prompt et installation](AURORA_ASSET.md). [Guide de démonstration](DEMO_GUIDE.md) ajouté. L’accueil et les principales entrées de navigation sont français ; la consolidation des libellés anglais internes reste à faire, sans lancer l’internationalisation.

Suite bornée pour Sol : suivre le scénario du guide, compléter la recette du verrou sur une base de test dédiée avec intervention humaine pour la saisie d’un nouveau credential, puis vérifier les messages/états et terminer les libellés français. Préserver les onze modules, le décor local, la frontière d’accès et le Core. Ne pas activer Cosmos, caméra, gestes, banque ou publication réelle pour cette recette.

## Consolidation française et données honnêtes — 6 septembre 2026

Principaux titres, actions et statuts francisés ; `labels.fr.ts` traduit uniquement la présentation et préserve les codes, classes et valeurs de formulaires. Aucun sélecteur de langue ni système i18n n’est activé. Les noms métier et techniques ne sont pas traduits arbitrairement.

Suppression des réponses de secours qui annonçaient un agenda/campagne fictifs, du score Analytics `86` et du fallback du dashboard vers des médias/morceaux/services factices. Les données de démonstration du serveur restent identifiées comme telles. Le formulaire Artist Brain part vide, n’affiche pas de faux profil et ne permet pas de sauvegarde avant une lecture API réussie ; une erreur réseau d’enregistrement n’est plus présentée comme la certitude d’une absence d’écriture. Ce sont des gardes UX, jamais un remplacement des contrôles serveur.

Le nouveau scénario d’`app.test.ts` réutilise les fixtures isolées et enchaîne profil → release/morceau → média/recherche → campagne versionnée → proposition seed/approbation → planification interne → tâche → préférence consentie → commande/historique. Il vérifie les liens, états et projections sans publication ni clé de stockage. Une proposition seed reste distincte de la campagne nouvellement créée : le futur planner n’est pas simulé. Huit nouveaux cas dans `demo-presentation.test.ts` couvrent les fallbacks honnêtes, le profil initial bloqué et les libellés.

Premier lancement global : huit dépassements de 5 s, sans échec d’assertion, dans les migrations/redémarrages PGlite et le verrou. `vitest.config.ts` limite désormais le parallélisme à deux workers et borne tests/hooks à 15 s, sans retrait de scénario ni retry automatique. Cette limite d’infrastructure de test n’est pas un objectif de latence produit.

Vérification finale : **147 tests réussis / 14 fichiers en 151,98 s**, types web/API/contrats/domain, lint global et build web réussis. La suite entière a été relancée après réglage ; aucune assertion n’a été supprimée. Aucun ajout de dépendance, changement d’API ou de base de données n’a été nécessaire.

Suite : recette navigateur complète (dont erreurs/rechargement), actualisation du résumé à la sortie des mutations, vérification sur appareils physiques et finalisation du verrou. Ne pas augmenter artificiellement l’estimation de démo au nombre de traductions ou de tests ; ni validation mobile réelle, ni nouvelle barrière de sécurité ne sont revendiquées par cette tranche.
