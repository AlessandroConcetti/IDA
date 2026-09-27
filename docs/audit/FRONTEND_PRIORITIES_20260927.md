# IDA — audit frontend et ordre de finition

État du 27 septembre 2026, reprise Astra. Ce document devient le point d’entrée
frontend ; le backend Agentic Library reste au checkpoint de Luna.

## Verdict

**Non, toutes les demandes UX ne sont pas encore terminées.** Le Hub, La baraque
et le Workspace sont de vraies surfaces navigables, avec des données issues des
contrats existants et des animations. Ce n’est plus uniquement une maquette.
Mais plusieurs fonctions attendues restent absentes, limitées à la lecture ou
non validées sur le PC réel. La reproduction exacte de toutes les références
graphiques n’est pas acquise.

La priorité est de finir les parcours utilisables et leurs états réels, sans
réinitialiser les designs, ajouter de fournisseurs, ni présenter un décor animé
comme la preuve d’un agent qui travaille.

### Portée des preuves

- Demandes relues dans le fil, prompt UX du 27 septembre, registre des demandes
  du 25, matrice de capacités du 27, checkpoints Workspace/Immersive/Hub.
- Inspection du code frontend et de ses raccords. Les anciens audits sont des
  instantanés : notamment les coffres CARE/Finance ne sont plus « absents ».
- Recette sur build de production avec navigateur Edge, serveur local isolé,
  données synthétiques et services externes bloqués. Aucun secret, dossier
  médical, compte mail réel, paiement ou appareil domestique consulté.
- Captures du build réellement rendu, comparées visuellement aux références
  présentes dans le fil. Pas de certification pixel-perfect ni test physique
  iPhone/TV. Les tests d’animation vérifient le mouvement et sa pause, pas une
  appréciation artistique automatique.

## 1. Ordre de travail — du fonctionnement quotidien aux finitions

| Rang | Demande utilisateur / reste concret | État et preuve | Condition pour clore |
| --- | --- | --- | --- |
| 1 | Accueil, sidebar, texte/voix et fermeture accessibles de chaque écran et modale | Socle global présent ; navigation Hub/Baraque/Workspace testée. Toutes les sous-vues ne sont pas parcourues. Un débordement de modale Google à 390 px et une en-tête marine en Classic ont été constatés pendant cette reprise. | Matrice route × modale × mobile/bureau : retour, clavier, focus, zéro commande masquée ; même parcours dans les cinq thèmes. |
| 2 | Démarrage fiable depuis le vrai `.exe`, vidéo fenêtrée fournie, puis connexion et plein écran | Code vidéo présent dans `scripts/desktop/IdaLauncher.cs`. Cela ne prouve pas la version du raccourci bureau/épinglé. Historique utilisateur : plein écran accepté, vidéo plusieurs fois contestée. | Vérifier cible/hash/assets du raccourci réellement utilisé, lancement à froid et double lancement. Ne pas modifier le verrou ni arrêter Ollama personnel. |
| 3 | « Bonjour IDA » après activation du vocal, réponse parlée et réarmement sans clic répété | `VoiceControls`, wake et synthèse raccordés ; tests synthétiques historiques. Pas de recette micro/haut-parleur réel dans cet audit. L’usage au quotidien n’est donc pas déclaré clos. | Activer une fois → wake → demande → réponse audible → réarmement → interruption/arrêt ; fournisseur réellement utilisé et fallback visibles, pas de dépense implicite. |
| 4 | Mail et agenda vraiment utiles dans la conversation et leurs écrans | Mail lit des extraits ; boutons réponse/transfert/suppression/classement et fonctions IA sont désactivés dans `MailWorkspace`. Google Calendar en lecture seule, distinct du calendrier éditorial. Accès Calendar direct corrigé dans Connexions. | Lecture réelle avec source/date, résumé vérifiable ; brouillon/réponse/pièces jointes/tri uniquement après raccord et approbation adéquats. Ne pas annoncer un envoi sur une simple ouverture. |
| 5 | Dossier CARE et données Finance conservés, consultables et choisis pour les agents | `RetainedDocumentsPanel` est monté dans CARE, Finance et le panneau agents ; sélection d’identifiants raccordée. Texte uniquement. Recette navigateur complète, export/permissions/historique et validation DPAPI réelle restent à terminer. | Import → relecture après reconnexion → sélection explicite → résultat sourcé → révocation/rétablissement → suppression seulement explicitement confirmée. Focus visible après Lire/Révoquer ; aucune perte à l’erreur. |
| 6 | Chaque agent a rôle, statut, outils, activité et résultat vérifiables | Centre agents et objectifs existants. « Déclaré actif » n’est pas « en exécution ». Le frontend ne consomme pas encore les nouvelles routes de gouvernance Agentic Library. | État registre/runtime/dernière exécution distingué ; résultat et erreurs retrouvables ; admission/retrait/versions de la bibliothèque visibles après contrat stabilisé avec Luna. |
| 7 | Fabrique capable de faire le projet Menuiserie à huit agents | Moteur backend identifié, **aucun client des routes Menuiserie dans `apps/web/src`**. Les prototypes métiers ne sont pas l’application persistante demandée. | Fiche client unique, transitions, devis, achats/planning/factures/suivi, validations et historique accessibles ; ne pas simuler WhatsApp, appels, commandes ou paiements non raccordés. |
| 8 | Hub/Workspace : résumé réellement utile de la journée et du travail pendant l’absence | Tâches, catalogue, activité, lectures volontaires existent. Les connexions absentes produisent des états vides. « Depuis ta dernière visite » affiche des actions récentes, sans preuve de curseur de visite. | Curseur/période explicites, sources/date/fraîcheur, résumés réels ; aucun score CARE, solde ou travail autonome inventé. |
| 9 | Maison pilotable, météo automatique, frigo partagé | Météo automatique et cache déjà présents ; Home limité aux entités autorisées ; frigo API partagé raccordé. Une interface maison n’atteste pas une action physique réussie. | Commande → état relu → retour réel pour chaque appareil admis. Météo affiche température ou erreur sans case manuelle. Frigo garde les brouillons refusés et ne ment pas sur la sauvegarde. |
| 10 | Gestes réellement assignés aux commandes | Suivi confirmé historiquement par l’utilisateur ; `gesture-live.ts` émet des événements locaux mais déclare n’avoir ni registre d’actions ni adaptateur OS/HA. | Écran d’affectation/calibration, commandes clientes autorisées, retour visuel et désactivation ; jamais caméra implicite. Test réel avec l’utilisateur. |
| 11 | Tous les sous-écrans habillés, sans formulaires génériques ni boutons trompeurs | Système glass partagé, mais couverture incomplète. Des menus créatifs ouvrent une collection de ressources plutôt qu’un éditeur. | Parcours action → résultat → feedback → état réel ; explication lisible avant les actions non disponibles, puis habillage cohérent sans changer les permissions. |
| 12 | Fidélité exacte des références Chat/Mail/Hub/Baraque/Workspace et identité commune | Compositions présentes, pas identiques partout. Comparaison détaillée ci-dessous. | Captures comparables aux références, écarts acceptés explicitement ou corrigés ; même orbe signature, pas de chiffres de maquette pris pour des données personnelles. |
| 13 | Tout vivant mais simple, lisible et fluide | Mouvements Hub/Baraque/Workspace et pause testés. Pas de validation artistique de chaque icône, globe, mer, aquarium et sous-écran. | Mouvement sémantique visible, pas de surcharge ; animation suspendue masquée, réduction de mouvement prioritaire, mesures sur PC cible. |
| 14 | iPhone, écran TV 75 pouces et déploiement réel | 390 px et 3840 px testés dans le navigateur. Ce ne sont pas l’iPhone, la télécommande ni le flux de la TV. | Sessions/réseau réel validés, tactile/clavier mobile, distance de lecture TV, gestes/voix, latence ; sécurité réseau inchangée. |

Les rangs 2, 3, 4, 5, 9 et 14 ont une dépendance native, matérielle ou backend.
Ils ne doivent pas immobiliser le reste du frontend : préparer les parcours et
les états honnêtes, puis effectuer une recette humaine ciblée. Aucun nouveau
credential ou fournisseur ne doit être demandé par défaut.

## 2. Les trois environnements que tu veux voir ce soir

### Le Hub

- Composition Journal, neuf widgets, deux palettes, barre commune unique,
  accès Accueil et variantes mobile/TV déjà rendus.
- Lumière/feuillage, icônes et effets météo/journal ont du code de mouvement et
  des tests. La reprise vérifie notamment décor mobile/bureau et pause.
- **Écarts visibles** : orbe central Classic très lumineux/opaque comparé au
  globe translucide de la référence ; quelques tailles/densités diffèrent.
  L’emblème typographique du décor et l’orbe commun coexistent encore.
- Les widgets vides dans les captures isolées ne signifient pas une panne des
  comptes personnels : ces comptes ne sont volontairement pas raccordés au test.
  Inversement leur cadre visible ne prouve pas leurs données réelles.
- Restent les agrégations CARE/Finance, sources maison exhaustives, période
  « absence » exacte et contrôle artistique final des effets mer/météo/journal.

### La baraque

- Renommée et accessible dans les cinq thèmes. Décor fourni respecté dans sa
  composition globale : aquarium, globe suspendu, bureau, plantes, vitrine.
  Création d’un dossier persistant et ouverture du Creative Engine testables.
- **Écarts visibles** : la vitrine montre les ressources réellement disponibles,
  pas automatiquement les six projets illustrés de la référence ; pour les
  formats sans aperçu, un pictogramme remplace une miniature. Barre commune
  ajoutée sous la vitrine ; branding remplacé par l’orbe signature.
- Aquarium/globe/écran/feuillage/lumières sont des effets de présentation sur
  un décor. Ils ne constituent pas un monde 3D entièrement simulé.
- Les entrées Montage vidéo/audio, 3D/VFX, Génération IA, Rendu et Cloud/Stockage
  ne prouvent pas un éditeur ou moteur opérationnel. Les panneaux renvoient à
  des ressources et outils de la Fabrique ; rendre cette différence immédiate
  dès le menu. Aucun rendu/générateur d’images installé n’est confirmé ici.
- Restent vraie chaîne création → média → outil → export et vitrine animée
  vérifiée avec plusieurs vrais projets, sans inventer des réalisations.

### Workspace

- Six grappes, recherche locale, tâches persistantes, catalogue/projets,
  approbations, registre agents et lecteurs Mail/Calendar sont présents.
- Classic est désormais ivoire/beige avec réseau réactif ; l’ancien fond forêt
  n’est plus exigé, car ta demande ultérieure l’a explicitement remplacé.
  Sci-Fi conserve l’observatoire. Profondeur au pointeur, pause et format TV
  font l’objet de tests navigateur.
- **Écarts visibles** : réseau moins dense et moins organique que les tentacules
  de la référence ; cartes plus sobres ; frise inférieure réduite à des
  éléments réels, pas au planning complexe dessiné dans l’image.
- Le rendu est une géométrie XYZ projetée dans **Canvas2D**, pas une scène WebGL
  complète avec objets 3D manipulables. Ce point doit rester explicite.
- Restent contacts, vraie vue de charge/liaisons transversales, timeline
  multi-pistes, réunions/agenda au-delà de la lecture, résumé mails et focus
  persistant. Les chiffres du registre ne sont pas des agents simultanément
  en train de travailler.

## 3. Autres demandes frontend conservées — aucune retirée silencieusement

| Demande | Reste à faire ou à prouver |
| --- | --- |
| Chat EXACTEMENT d’après la dernière image 3 | Revue comparative : géométrie trois colonnes, conversation, zone de saisie, rail/outil/provider, responsive. `ChatWorkspace`/styles présents, exactitude non certifiée. Un résultat modèle réel ne découle pas du choix dans un menu. |
| Mail Classic et Sci-Fi exacts, décor réseau vivant | Comparer les deux références et rendre les fonctions désactivées compréhensibles. Les extraits actuels ne sont ni corps complet ni résumé IA. Pièces jointes/réponse/transfert/automatisations restent des raccords distincts. |
| Classic beige partout, Sci-Fi marine, verre cohérent | Audit sous-écrans et contrastes ; le défaut d’en-tête marine découvert dans une modale Classic illustre une couverture encore incomplète. Vérifier aussi les erreurs et boutons désactivés. |
| Barre latérale au bord gauche dans tous les écrans | Tests globaux et trois environnements passent ; finir sous-vues natives, modales imbriquées et destinations secondaires sans piège clavier. |
| Orbe bleu unique partout, y compris bulle bureau | Réemploi majoritaire mais restes (`ReferenceRail` typographique, mini-emblèmes Mail, décor Hub). Vérifier bulle Windows réellement lancée, derrière les fenêtres et sur le bureau uniquement ; les sources ne suffisent pas. |
| Icône `.exe` et épingle de barre des tâches | Contrôler la cible épinglée et l’identité de fenêtre réelle ; ne pas présenter le favicon web comme une preuve de correction Windows. |
| Vidéo démarrage et vidéo connexion séparées | Sources/codes présents. Vérifier clip demandé le plus récent dans le lanceur réel, durée et transition ; ambiance reposante volontaire derrière connexion, sans son imposé. |
| Vidéo robot immersive 4K fournie | Checkpoint du 27 : source remplacée, versions desktop/mobile, pause dialogue/masquage/réduction ; 4 E2E historiques. Vérifier encore l’asset servi par le vrai `.exe`. |
| Modern : bulles rondes, lueur, étoiles et étoiles filantes ; supprimer doublon de saisie | CSS et composants modifiés historiquement. Nouvelle recette tous formats et capture de la version réellement servie nécessaire avant fermeture. |
| Cartes Classic/Sci-Fi → bulles Modern/Carrousel ; image IDACAR partout | Associations existantes ; comparer chaque monde et thème, y compris Admin. Aucun besoin de recréer les médias déjà fournis. |
| Carrousel autour de l’orbe, boucle fluide de la roue | Structure orbitale présente ; valider ordre/boucle, accessibilité, pauses et sélection manuelle dans la build finale. |
| Admin vivant avec l’interface fournie | Composant et visuel existent. Référence composite contient de l’UI ; fond seul n’est pas attesté. Comparer sans dupliquer les textes/widgets du décor ni inventer des démarches personnelles. |
| Finance : globe central tournant, banques/marchés/budget/crypto | Globe/identité à comparer dans tous les thèmes. Rubriques métier réelles ou indication de source manquante ; aucun paiement/ordre bancaire. |
| CARE : rhumatologie et autres labos, symptômes, HUMIRA, livre | Coffre/sélection présents ; profil quotidien durable, provenance et partage choisi des extraits restent à terminer. Aucun score médical ou conseil thérapeutique prétendu déduit du décor. |
| La Fondation, Le Hub, La baraque : renommages | Catalogue principal corrigé. Rechercher les libellés secondaires visibles, ne pas changer les identifiants internes sans nécessité. |
| Music Studio : YouTube, catalogue, labels/producteurs | Recherche publique et catalogue ont des surfaces ; CRM/prospection/brouillon/envoi approuvé manquent. Lecture audio réelle dépend d’un média disponible. |
| IDACAR / Travel : Google Maps et mobilité | Géocodage ≠ itinéraire temps réel, vol, réservation. Afficher périmètre réel, quota/erreur/source et accès au résultat. |
| Providers/quota visibles | Diagnostic/registre existent ; preuve requête runtime, fournisseur réellement utilisé, modèle/durée/fallback restent séparés des clés stockées et du succès historique. Aucun nouveau provider. |
| Agents pendant mon absence / niveau de capacités visé par Muse | Journal et objectifs ne sont pas une exécution autonome durable. Montrer prévu/en cours/bloqué/achevé avec artefact, budget/approbation/annulation lorsque le backend le permet. |
| Bibliothèque d’agents créée par Luna | UI dédiée de gouvernance/réutilisation non repérée. Faire valider le contrat backend avant montage, sans reprendre le chantier backend d’Astra par inadvertance. |
| Frigo : photo → propositions classées → validation | Nouvelle demande conservée, **mise de côté à ta demande pour finir l’UX**. Aucun produit enregistré avant validation ; caméra volontaire ; modèle vision/transport restent à établir. |
| Frigo : image du contenu, gratuite, éventuellement tous les trois jours | Aucun moteur d’images branché établi dans le dépôt. Une limite de fréquence ne garantit pas la gratuité. Aperçu illustré local proposé mais pas implémenté ; ne pas le faire passer pour génération IA. Également différé. |
| Sites 3D interactifs et sous-écrans vivants sans formulaires sans âme | Habillage commun engagé ; scène spatiale Hub limitée et Workspace Canvas2D. Définir des interactions utiles, pas un moteur 3D universel ni une multiplication des décorations. |
| Audit/commits/GitHub et checkpoints | Conserver médias/secrets hors Git. Arbre très mêlé : pas de commit global ni de push. Un rapport ou build local n’est pas un déploiement sur le bureau/TV. |

## 4. Preuves de cette reprise

Résultats à jour et captures : voir le checkpoint
[`FRONTEND_UX_REVIEW_20260927.md`](../checkpoints/FRONTEND_UX_REVIEW_20260927.md).
Il distingue tests passés, défauts rencontrés puis corrigés, contrôles non faits
et limites de déploiement. Les captures utilisent des données synthétiques.

## 5. Prochaine tranche frontend proposée

1. Terminer la recette des modales communes sur les deux palettes et mobile ;
   corriger les débordements/contrastes et retours sans refaire les designs.
2. Terminer le parcours documentaire CARE, puis Finance, avec focus,
   consentement, import/lecture/révocation et tests navigateur réels isolés.
3. Rendre visibles les limites Mail/Calendar et compléter les actions possibles
   avec les contrats existants. Les opérations nécessitant une nouvelle
   autorisation restent bloquées clairement.
4. Raccorder la surface Menuiserie persistante aux huit capacités existantes.
5. Reprendre Chat et fidélité graphique des trois grands environnements,
   homogénéiser l’orbe, puis les autres sous-écrans et les cinq thèmes.
6. Recette commune avec toi : exécutable du bureau, micro/voix, gestes, appareils
   autorisés, iPhone et TV. Préparer un test court par sujet, pas une nouvelle
   boucle de configuration sans diagnostic.

L’ordre reste piloté par le fonctionnement d’IDA ; les nouvelles images/photos
du frigo ne passent pas devant ces finitions.

## Sources techniques principales

- `apps/web/src/ReferenceChrome.tsx`, `EdgeNavigation.tsx`, `experience-system.css`
- `VoiceControls.tsx`, `CameraPreview.tsx`, `gesture-live.ts`, `IntelligenceNetwork.tsx`
- `MailWorkspace.tsx`, `CalendarSurface.tsx`, `ConnectionsPanel.tsx`
- `RetainedDocumentsPanel.tsx`, `EnvironmentAgentsPanel.tsx`, `AgentCenter.tsx`
- `HubEnvironment.tsx`, `useHubData.ts`, `BaraqueEnvironment.tsx`, `baraque-data.ts`
- `WorkspaceEnvironment.tsx`, `WorkspaceNeuralField.tsx`, `WorkspaceOperations.tsx`
- `scripts/desktop/IdaLauncher.cs`, `docs/LOCAL_LAUNCHER.md`
- `docs/audit/UX_CAPABILITY_MATRIX_20260927.md`, `REMAINING_USER_REQUESTS_20260925.md`

Une demande n’est close que par un parcours vérifié et, pour une exigence
artistique, une comparaison visuelle ; pas par l’existence d’un composant.
