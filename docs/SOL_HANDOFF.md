# IDA — Relais de consolidation pour Sol

## Dernière tranche — Audit persistant de l'intelligence — 8 septembre 2026

Lire [INTELLIGENCE_AUDIT.md](INTELLIGENCE_AUDIT.md). `createPersistentIntelligenceAudit(database, authenticatedScope)` fournit les trois callbacks existants contexte/Core/environnement. Nouveau sous-export `@ida/contracts/intelligence-audit`, types réexportés aux anciens emplacements, codes d'erreur partagés. Table `intelligence_audit_events` ajoutée transactionnellement à l'initialisation locale : colonnes strictes, id/timestamp serveur, empreinte de comparaison, index workspace et guards INSERT/UPDATE/DELETE/TRUNCATE. Aucun payload, prompt, réponse ou secret ; aucun ajout aux journaux existants ou à l'UI.

Le sink lie le scope déjà authentifié et la base recoupe les relations et l'existence de LOCAL_LOCK, sans exiger ACTIVE pour un événement historique après révocation. Réautorisation métier toujours au broker/router. Retry identique idempotent, contradictoire refusé. SUCCEEDED ne prouve pas la livraison ; refus tardifs conservés. Les callbacks ne couvrent pas tous les refus préalables du routeur. Les guards ne protègent pas contre un propriétaire de base désactivant les triggers. Rétention/rotation/administration de production restent à définir.

Tests nouveaux : callback/replay/erreurs/composition et persistance SQL réelle sur base temporaire confinée. Un ancien test de migration Identity a été adapté pour retirer aussi la nouvelle table dans sa fixture antérieure à Identity, puis vérifier sa recréation (7 tables au lieu de 6). Aucun changement des invariants testés ni des droits. Ne pas exécuter la remise en état de cette fixture sur une base de travail.

Vérification finale : **731 tests / 39 fichiers** (81 nouveaux), suite complète relancée après correction de la fixture, 177,05 s. Lint global, types et builds contracts/domain/API/web réussis. Aucune modification de la base d'aperçu, de la configuration locale ou des médias.

Pas de modèle ou réseau d'inférence, aucune activation d'agent, aucun redémarrage de la démo. Dates/Home Assistant et modifications UI toujours en pause/hors tranche. Suite : validation de fraîcheur du contexte à l'envoi, prompt de formulation et évaluateur, parcours opt-in/arrêt puis composition du premier agent au chat avec ce puits. Qwen reste un candidat 4/6, pas un modèle qualifié.

## Dernière tranche — Contexte musical contrôlé — 8 septembre 2026

Lire [MUSIC_CONTEXT.md](MUSIC_CONTEXT.md). `MusicContextBroker` + store SQL borné (5 lignes défaut, 10 maximum), requêtes strictes SEARCH_TRACK/SEARCH_MEDIA, archives exclues, métadonnées minimales et classification PRIVATE_CREATIVE. Autorisation partagée avec le routeur d'environnement, agent/Gateway READ, audit expurgé obligatoire et annulation. `LocalIntelligenceAccess` recharge l'identité persistée, impose session LOCAL_LOCK active/idle non expirée, conserve le scope, ne renouvelle pas l'inactivité et ne lit aucun token. Les appels Identity existants gardent leur comportement. Pas de migration ou dépendance.

`getProfile`/`getPolicy` sont maintenant des lecteurs synchrones sans effet de l'autorité runtime, après l'attente Identity ; une autorité persistée future devra être agrégée/versionnée, jamais un cache périmé. Le snapshot musical est historique et **ne constitue pas une autorisation d'inférence** : revalider les ressources à l'envoi. Store SQL jamais directement exposé à une route/agent. Les erreurs typées sont reconstruites pour supprimer leurs détails privés.

Suite complète **650 tests / 37 fichiers** (98 supplémentaires, 171,35 s). Aucun modèle lancé, aucun crédit API consommé. Profils/agents toujours PLANNED, chat toujours déterministe. Reste : audit persistant, parcours d'activation et arrêt, validation des ressources, prompt/évaluation de formulation puis composition au chat. La note du Qwen candidat reste 4/6, pas remplacée par le score des tests logiciels. Dates/Home Assistant/UI et travail en pause préservés.

## Dernière tranche — Cerveaux par environnement — 7 septembre 2026

Douze profils serveur correspondent à la Roue existante ; tous PLANNED / LOCAL_ONLY / budget API nul / sans modèle. Les rôles futurs ne sont pas des agents exécutables. `EnvironmentIntelligence` implémente le port commun et revalide profil/agent/contexte/version via les mêmes Identity/Gateway/Router. Les deux agents existants restent PLANNED. `allowedModels` et `allowedLocalities` limitent le Router sans dupliquer providers/quotas. **442 tests / 32 fichiers**, dont 52 nouveaux, types des quatre packages/apps et lint validés.

Lire `ENVIRONMENT_BRAINS.md` avant activation. Mémoire consentie et recherche documentaire ne sont pas un entraînement automatique ; le Context Broker et la provenance des ressources restent à livrer. Pas de clés, modèle téléchargé, réseau d'inférence, migration, UI, nouveau domaine métier actif ou auto-déploiement. Offres gratuites documentées avec sources actuelles : ne pas promettre qualité identique ni API gratuite via chat web ; GitHub Models est retiré, Gemini a des conditions EEE à vérifier, Copilot SDK a ses propres droits/coûts. Domotique et dates toujours en pause et préservées.

## Dernière tranche — Fondation multi-intelligences — 7 septembre 2026

Vérification de cette tranche : **390 tests / 29 fichiers** (baseline 290, donc 100 nouveaux), types des quatre packages/apps, lint global sans avertissement et quatre builds réussis. Aucun appel réseau d'inférence ; tests synthétiques uniquement. Détails et prochaines étapes dans `INTELLIGENCE_CONNECTION.md`.

À la demande utilisateur, Home Assistant est en pause en attendant ses informations. La tranche dates reste également en pause et non committée. Ne pas y toucher dans le commit IA.

Fondation livrée : sous-export `@ida/contracts/intelligence`, ProviderRegistry/Router, `IntelligencePort`, façade serveur `CoreIntelligence`, point optionnel `DeterministicIdaCore.generateProposal`, adaptateurs OpenAI Responses / Ollama derrière un transport JSON injecté. Réutilise IdentityAccessPolicy, ToolGateway et le Core existant ; pas de dépendance, agent activé, table, route HTTP, clé, modèle téléchargé ou requête IA réelle. La composition `app.ts` ne branche pas encore la façade. Le chat reste déterministe, le frontend et ses thèmes ne changent pas.

Lire [INTELLIGENCE_CONNECTION.md](INTELLIGENCE_CONNECTION.md) avant toute activation. Les contrats sont serveur uniquement ; une classification/policy envoyée par le client ne vaut pas autorisation. Le port de relecture Identity doit lire l'autorité courante, pas le contexte HTTP figé. Coût/latence sont des estimations, le quota une allocation en mémoire partagée par le registre, pas le solde fournisseur. Transports fixes, coffre, egress local, persistance des consentements/budgets/audits, Context Broker et parcours d'activation sont encore à connecter. OpenAI/Astra n'est pas un second Core. Aucun compte ou donnée privée à utiliser pour accélérer un test.

## Dernière tranche — Préparation Home Assistant — 7 septembre 2026

L’utilisateur demande la connexion de sa domotique Alexa/Google Home puis confirme **Home Assistant en cours d’installation de son côté**. Ce choix est retenu, mais l’adresse, la méthode d’installation, les appareils exposés et l’accès sécurisé restent inconnus. Ne pas installer/scanner/associer de compte ni demander de token dans le chat. La lecture ou commande de la maison réelle n’est pas encore implémentée.

Livré dans le même environnement IDA Home : `HomeConnections` et un guide selon l’installation déclarée, sans persistance, réseau, secret ou faux bouton de connexion. Thèmes, Roue, musique et social préservés. Côté serveur, `SmartHomeReadProvider` / `createHomeAssistantReadProvider` dans `smart-home-read.ts` prépare la lecture ciblée d’une lampe Home Assistant via un transport injecté, non implémenté et non enregistré dans le runtime. Projection minimale, validations, erreurs génériques, aucun cache ou retry ; `AbortSignal` annule avant/pendant la lecture et empêche un résultat tardif de redevenir visible. Ce port n’est pas une autorisation : pas de branchement direct à une route.

[SMART_HOME.md](SMART_HOME.md) et [ADR 0005](adr/0005-smart-home-read-pilot.md) consignent les sources officielles Alexa/Google/HA, les limites natives, données/rétention, sécurité, futur Home Safety Steward, routes/outils candidats non publiés et critères d’activation. Aucun nouveau paquet, schéma, table, endpoint, agent ou privilège. L’exposition réseau du Core reste interdite. Ne pas affaiblir TLS/CORS/auth pour accélérer le pilote ; choisir le transport après connaissance du véritable trajet hôte/VM/LAN.

Vérifications : suite complète **287 tests / 26 fichiers, 187,68 s** ; après ajout du support d’annulation, **36 tests ciblés / 2 fichiers, 614 ms**, dont trois nouveaux scénarios d’annulation/nettoyage. Types des quatre apps/packages, lint global et builds web/API réussis. Les tests de protocole utilisent uniquement des réponses fictives, aucun socket vers HA. Les 287 incluent la tranche de dates toujours en pause ; ne pas les attribuer tous à la domotique. Cette passe n’a pas effectué de nouvelle recette visuelle/navigation dans le navigateur ni de test matériel.

L’aperçu existant répond toujours sur `127.0.0.1:5173`, son API sur `127.0.0.1:8787` ; pas de relance, de doublon ou de modification des données. Le travail Sites a conservé l’accueil et ses styles existants, sans hébergement cloud. Suite : demander seulement méthode d’installation, adresse sans secret et lampe pilote visible ; préparer ensuite coffre/identité/transport/Gateway/audit et leurs tests avant la première lecture réelle. Conserver intactes les modifications non committées des dates de release.

## Dernière tranche — IDA Home — 7 septembre 2026

À la demande utilisateur, **mettre en pause la section sur la saisie des dates de release**, préserver ses changements non committés et travailler sur IDA Home. Ne pas les supprimer ni les inclure dans le commit Home. Les fichiers de cette tranche précédente restent dans `App.tsx`, `api.ts`, `styles.css`, les contrats/tests API, `ReleaseDateField`/`release-date` et leurs documents API/roadmap/guide/OpenAPI.

Clarification UX intégrée : un seul accueil `AuroraHome`, une seule Roue, IDA Home comme environnement du monde `home`. Les aperçus quotidiens sont montés dans cet environnement, pas dans une deuxième page. Une case permet de choisir explicitement son ouverture dans le même accueil au démarrage, préférence du navigateur uniquement. Le choix par défaut reste la Roue ; il a été restauré après la recette. Voir [contrat et composants IDA Home](IDA_HOME.md).

Livré : accueil recomposé avec les tokens/décors existants, navigation desktop/mobile, quatre compteurs factuels, suggestions de commande sans envoi automatique ; IDA Home affiche les tâches ouvertes et le journal via les lecteurs/contrats existants, puis relie Tâches, Calendrier, Mémoire et Conversation. Les onze modules, dont toute la chaîne musicale et sociale, sont conservés. Pas de base, route, endpoint, dépendance, agent ou pouvoir ajouté. Maison/courses/budget restent futurs.

Vérification finale : **254 tests / 24 fichiers en 160,66 s**, types web/API/contracts/domain, lint global et build web réussis. Le premier passage complet a signalé deux attentes de libellés obsolètes dans `aurora.test.ts` ; elles ont été adaptées aux compteurs et messages actuels sans retirer les invariants. Les 254 tests incluent aussi les changements de dates laissés en pause : ne pas les attribuer tous à Home.

Recette sur la base de démo existante : sélection IDA Home dans la Roue, ouverture, deux tâches et trois événements réellement lus, raccourci latéral, retour Échap et réentrée, actualisation, préférence cochée + rechargement puis décochée + rechargement, Classic/Sci-Fi. Un seul `main`, une seule vue quotidienne et zéro lecteur vidéo observés. Mise en page responsive contrôlée à largeur CSS effective 480 px : colonne unique, navigation mobile, sidebar masquée, aucun débordement horizontal. Le viewport demandé est mis à l’échelle par l’aperçu ; il ne s’agit pas d’un test iPhone physique. Captures toujours tronquées, pas de validation visuelle multi-appareils complète revendiquée. Logs consultés sans erreur ni avertissement à la fin.

Les anciens processus d’aperçu n’étaient plus actifs : relance après refus de connexion constaté, **sans doublon ni changement de données**. API session `39091` sur `127.0.0.1:8787`, web session `37541` sur `127.0.0.1:5173`, même base `tmp/ida-preview-relative-dates/data`, même stockage `media`, mode `LOCAL_DEMO`. Aperçu conservé ouvert sur IDA Home en Classic ; serveurs laissés actifs. Aucun service Windows installé ni accès LAN/Internet ouvert.

Suite bornée : faire valider cette organisation, puis consolider les espaces quotidiens par petites tranches autorisées. Ne pas démarrer maison/banque/courses ou des agents autonomes sous prétexte que le monde est accessible. Les dates restent en pause jusqu’à reprise demandée. La démarche Sites a guidé la réutilisation du projet, de son design et de son aperçu local ; aucun hébergement cloud.

## Dernière tranche — Navigation du calendrier — 7 septembre 2026

Le calendrier propose période précédente, période suivante et retour à aujourd’hui en vues jour, semaine et mois. Le nouveau paramètre facultatif `anchor` de `GET /v1/calendar` est exclusif avec `from`/`to` et borné aux années 1000 à 9998. Le serveur reste seul responsable du fuseau du workspace, des bornes civiles et des changements d’heure. La navigation utilise le début de la période suivante ou l’instant précédant la période courante, sans ajouter de durées fixes. Le changement de vue conserve l’ancre choisie, même lorsqu’une semaine chevauche deux mois ; aujourd’hui revient à l’horloge serveur. Les années sont affichées dans la plage.

Un lecteur par requête empêche les anciennes réponses de remplacer la période sélectionnée. Plages, listes et compteurs précédents sont masqués pendant le chargement ou l’erreur ; une erreur permet de réessayer. La navigation est bloquée pendant une mutation en cours. Aucun changement des permissions, états de publication, données persistantes ou thèmes.

Vérification : **213 tests / 21 fichiers, 140,67 s**, types web/API/contracts/domain, lint global et builds contrats/API/web réussis. Les tests couvrent DST 23/25 heures, semaines et mois de durées variables, année bissextile, changement d’année, paramètres invalides, limites, ancre conservée et réponses obsolètes. Recette dans l’aperçu existant : septembre → octobre, semaine du 28 septembre au 5 octobre → retour au mois d’octobre, période précédente, aujourd’hui et vue jour/semaine. Logs consultés sans erreur ni avertissement. Aucun scénario d’appareil physique ou de réseau distant revendiqué ; aucune écriture métier pendant cette recette.

Fichiers : `calendar-navigation.ts` et tests côté web, `CalendarView`/`useEditorialCalendar` dans `App.tsx`, transport `api.ts`, schéma partagé, résolution API et tests HTTP/DST ; contrats documentés dans `API.md` et l’OpenAPI. Aucun ajout de dépendance ni migration.

L’API d’aperçu a été reconstruite puis relancée proprement en loopback sur 8787 (session `66195`, remplace `90971`). Même base dédiée `tmp/ida-preview-relative-dates/data`, même stockage et mode `LOCAL_DEMO`, sans réinitialisation ni redatage. Le serveur web existant `72853` reste sur 5173 ; l’onglet d’origine est conservé. Aperçu laissé actif à la demande utilisateur. La démarche Sites conserve le design et l’aperçu local existants ; aucun hébergement cloud.

Suite bornée : saisie des dates de release, scénario français restant, recette du verrou sur base dédiée avec saisie humaine du credential, puis appareils physiques. Les vidéos manquantes attendent toujours l’utilisateur ; aucune intégration sociale publique, caméra, voix, banque ou nouvelle phase activée.

## Roue des Mondes — 6 septembre 2026

Voir [périmètre, composants et médias](WORLDS_AND_THEMES.md). Accueil : roue en perspective, grille alternative, sélection clavier/tactile/trackpad, environnement et retour avec focus. Music Studio → Artist Brain/Music Brain ; Content Studio → DAM ; Social Hub → capacités sociales/Approval Center/calendrier/campagnes/statistiques ; Workspace → Command Center/conversation/tâches/mémoire/système. Les huit mondes futurs sont inertes. Tous les anciens modules restent directement accessibles.

Classic/Sci-Fi est un état de présentation éphémère dans `App`, uniquement pour l’accueil/environnements ; aucun changement Identity/Core/API/base/permission. La vidéo utilisateur de Music Studio (4,78125 s, portrait 480 × 832) démarre uniquement au clic, muette ; changement de thème, sortie, masquage, hors-écran et préférences restrictives l’arrêtent. Aucun capteur, fournisseur, dépendance ou génération. Les médias de décor sont copiés localement et exclus de Git ; les autres clips restent à fournir.

Vérification finale : **185 tests / 18 fichiers, 137,20 s**, types web/API/contracts/domain, lint global et build web réussis. Recette dans l’aperçu existant : sélection clavier bornée, focus/Échap, grille/roue et recentrage, ouverture Music Brain et Social Brain, accès réel aux validations depuis Social Hub, onze raccourcis directs, aucune vidéo avant demande, lecture effective muette puis démontage au changement de thème. Logs navigateur consultés sans erreur/avertissement. Aucune écriture métier pendant cette recette.

Limites : les captures restent tronquées par l’aperçu ; aucune nouvelle recette physique iPhone/Android ni validation réseau revendiquée. Le lecteur respecte les préférences restrictives par contrat/test de policy ; leur changement système n’a pas été simulé dans le navigateur. Les modules métier restent clairs ; l’immersion vidéo dans toutes les cartes et le vortex attendent les assets et une tranche dédiée. Continuer ensuite la consolidation calendrier/verrou décrite plus bas, sans nouveaux pouvoirs.

Les serveurs d’aperçu précédents restent actifs à la demande utilisateur, sans doublon, sans exposition LAN et sans changer la base de démo. La couche Sites a guidé la conservation du projet et de son aperçu local ; aucun déploiement cloud.

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

## Actualisation fiable du dashboard — 6 septembre 2026

`api-transport.ts` émet un signal sans payload après succès HTTP courant de huit familles de POST affectant le snapshot : releases, tracks, media, campaigns, approve, reject, internal-schedules et cancel. Pas de signal pour GET, auth/accessRequest, commande READ ni autres écritures sans effet sur ce snapshot. Les réponses d’une génération d’accès invalidée ne signalent rien. Un observateur défaillant ne transforme pas le succès métier en erreur et aucun replay n’est introduit.

`snapshot-reader.ts` sérialise les lectures logiques, regroupe les invalidations en une relance et ignore succès/erreurs d’une révision périmée. Son état ne conserve plus les données lors d’une actualisation, panne ou déconnexion. Le remontage StrictMode reste compatible avec une ancienne lecture en attente. `App.tsx` utilise ce lecteur via `useSyncExternalStore`, se désabonne au démontage et relit au retour à l’accueil. Suppression des ajouts optimistes concurrents de morceaux/médias ; les notices de succès des formulaires restent locales. Aucun changement de contrat API, schéma, permission, dépendance ou style.

Vérification : **165 tests / 15 fichiers en 160,47 s**, dont 18 nouveaux cas (signaux, exclusions, refus, verrouillage, observateur défaillant, regroupement, réponse/erreur obsolète, panne puis relecture, cache fermé, StrictMode, chaînage transport/lecteur). Types web/API/contracts/domain, lint global et build web réussis.

Recette navigateur dans le même aperçu sur `memory://`, données fictives uniquement : proposition Instagram approuvée, compteur 2 → 1 au retour à l’accueil ; nouveau morceau visible dans Music Brain sans navigation ni rechargement. Aucune erreur/avertissement dans les logs navigateur consultés. Aucun changement de zoom ou viewport pendant cette passe. Les captures de l’aperçu restent tronquées dans cet environnement : cette tranche ne revendique pas de nouvelle validation visuelle desktop/mobile.

Constats à reprendre par Sol :

1. Les dates fixes des propositions seed (1er et 3 septembre) sont maintenant passées. La planification est correctement refusée par le serveur ; ne pas retirer ce garde. Préparer des fixtures isolées datées de façon reproductible pour les nouvelles bases de démo, sans modifier les données utilisateur existantes. Retester succès/annulation et les compteurs dans le navigateur.

   Source à inspecter : `apps/api/src/database.ts`, données seed `plannedAt` autour des lignes 5711–5768, dates de release autour de 5575/5609 ; attentes couplées dans `apps/api/src/app.test.ts`. Pas de remplacement global des dates sans distinguer fixtures et assertions temporelles.
2. Une release fictive a été créée, mais la saisie de date dans l’aperçu n’a pas été enregistrée comme attendu. Ne pas affirmer que le compteur de sorties a été validé en navigateur : reproduire la saisie classique et distinguer un problème d’automatisation de l’aperçu d’un problème de formulaire avant toute correction.
3. Quelques libellés secondaires restent anglais (`Open calendar`, `RESULTS`, métadonnées de morceau sans BPM/tonalité). Les traiter dans une tranche française bornée, sans lancer l’i18n.
4. Terminer la recette dédiée du verrou (saisie d’un nouveau credential par l’utilisateur), du calendrier et des parcours encore non testés en navigateur. Aucun appareil physique, accès LAN, publication ou synchronisation inter-appareils n’a été activé.

Limites : un succès HTTP à réponse mal formée peut déclencher une relecture alors que le formulaire affiche une erreur de décodage ; une écriture à réponse perdue reste incertaine. Le retour à l’accueil permet de lire l’état serveur sans la rejouer. Les signaux sont locaux à l’instance cliente, pas un bus multi-appareils, ni une barrière de sécurité.

## Dates de démonstration et aperçu actif — 6 septembre 2026

Tranche livrée : `demo-dates.ts` compose en UTC les créneaux J+2 à 18 h et J+4 à 17 h 30, puis la date de release/morceau à J+19. `DemoDatabaseOptions.now` partage l’horloge injectable de `createApp` ; un seul appel est effectué pour le seed. Les hashes de proposition sont calculés ensuite, et tous les inserts conservent `ON CONFLICT DO NOTHING`. Les données historiques et inter-workspaces restent fixes. Ni backfill, ni modification d’approbation, ni nouvelle migration ne sont ajoutés.

Validation : **173 tests / 17 fichiers en 155,86 s**, types des quatre apps/packages, lint global et builds API/web réussis. Sept tests de dates (horloge historique, cinq limites de dates, date invalide) et un test de persistance ont été ajoutés. Ce dernier crée une nouvelle base, approuve/planifie, compare les dates/hashes/décisions avant et après réouverture en novembre, conserve l’autre proposition REQUESTED, annule le snapshot et vérifie le refus de replanification dans le passé. Deux anciens scénarios ont reçu une horloge explicite : progression jusqu’au jour planifié et conflit exact de créneau. Leurs assertions métier sont conservées.

Recette navigateur réussie dans la base dédiée `tmp/ida-preview-relative-dates/data` : proposition Instagram du 8 septembre à 20 h Europe/Paris approuvée, vue Mois, planification, compteur actif à 1, annulation, compteur à 0. Le teaser reste approuvé et peut être replanifié tant que sa date est future. L’autre proposition reste à valider. Aucun avertissement/erreur dans les logs consultés. Pas de nouveau test sur appareil physique ni de retouche visuelle.

À la demande « active », **laisser l’aperçu actif** : Vite `127.0.0.1:5173` (session 72853), API `127.0.0.1:8787` (session 90971). Ne pas lancer de doublon. L’API utilise `tmp/ida-preview-relative-dates/data` et `media`, pas la base de travail par défaut. La base précédente `tmp/ida-preview-september-06` a été conservée sans redatage ni suppression ; seul son processus API a été arrêté pour changer d’aperçu. Le guide indique la commande exacte de reprise, différente de `pnpm dev` pour la base par défaut. Aucun service de démarrage Windows n’a été installé et aucun port LAN/Internet n’a été ouvert.

Suite bornée : navigation de périodes calendrier (les futures propositions peuvent dépasser le mois courant), vérification de la saisie des dates de release, derniers libellés français, puis recette du verrou avec saisie humaine du credential. Les dates persistées vieillissent normalement : ne pas les repousser silencieusement au redémarrage. La couche Sites a été suivie pour réutiliser le même aperçu et préserver le projet ; la demande utilisateur d’activation garde ici les processus locaux actifs. L’estimation de démo n’est pas augmentée automatiquement au nombre de tests.
