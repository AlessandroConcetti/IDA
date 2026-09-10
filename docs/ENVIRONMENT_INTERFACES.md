# Environnements plein écran — 9 septembre 2026

## Mise à jour du 10 septembre — références nommées et dialogue local

Cette section remplace les anciennes limites Research/Travel/Music décrites ci-dessous. Voir [la livraison détaillée](REFERENCE_ENVIRONMENTS_20260910.md) pour le périmètre exact et les prompts des nouveaux décors.

- Research, Travel et Music Studio ont des compositions dédiées (`ReferenceEnvironment`) : rail, titres, commandes latérales et dock inspirés des fichiers nommés. Les interfaces sont des éléments HTML, jamais une capture avec de fausses commandes. Les versions mobiles réorganisent les contrôles ; fidélité pixel à pixel non attestée.
- Les vidéos décoratives sont réservées aux cartes de la roue, avec l'exception déjà demandée du robot dans Immersive. Les accueils des environnements utilisent désormais des images fixes et des reflets animés désactivables.
- Frigo dispose d'une scène indépendante dans IDA Home, avec inventaire, courses, historique temporaire, compteurs et paramètres. Cette version sombre correspond à la référence précédente ; le nouveau Frigo Classic vert/crème n'est pas encore intégré.
- Le bouton Dialogue/Assistant des trois scènes ouvre la façade commune `LocalDialogue`. Elle utilise les nouvelles routes locales décrites dans [LOCAL_DIALOGUE.md](LOCAL_DIALOGUE.md), et n'injecte ni fichiers ni inventaire ni profil Care dans le prompt.
- Les briefs Research/Studio et projets Travel peuvent être enregistrés via `createTask`, dans les tâches existantes du workspace. Les brouillons restent éphémères jusqu'à cette action. Aucune réservation ni invitation n'est effectuée.
- Les contrôles Mix/Master proposent une écoute avec égaliseur 3 bandes et compression douce optionnelle, dans Web Audio après action explicite. Pas de mastering certifié, export audio traité, analyse spectrale ni mesure LUFS.
- Les images nouvelles La Fabrique et Météo restent des références à intégrer ; aucun bulletin météo fictif n'est présenté comme actuel.

Les anciens paragraphes « vidéo studio dans l'environnement » et « premier modèle à brancher » ci-dessous sont historiques. Le modèle est maintenant composé côté serveur ; une réponse réelle dans l'interface attend l'initialisation du verrou local par l'utilisateur.

## Parcours livré

La carte de la roue ouvre directement son accueil d'environnement. `EnvironmentLobby` remplace la petite scène imbriquée de `WorldWheel` : décor plein viewport, navigation des mondes à gauche, titre et intention à gauche, véritables boutons des espaces à droite, dock de commandes en bas. Sur téléphone, un sélecteur repliable remplace la navigation latérale et le bouton « Accéder aux espaces » rejoint directement les contrôles en leur donnant le focus. Le retour à la roue reste présent et les panneaux suivent le décor dans une page défilable. Retour/Échap restaure la carte ; aucune deuxième application ni copie du Core.

Un outil ouvert depuis un environnement affiche « Retour à [monde] ». Ce retour réouvre la scène d'origine, y compris depuis les tâches de « Ma journée ». Ce repère est seulement un état de navigation éphémère d'App : aucune route métier ni mémoire parallèle. Il ne restaure pas les brouillons abandonnés en quittant Care ou Frigo. Le bouton d'accueil habituel reste un retour au point d'entrée principal.

Les mondes sans outil possèdent maintenant une page d'accueil explorable, explicitement sans intégration active. Les chiffres, projets et résultats incrustés dans les références ne sont pas reproduits comme des données réelles.

- **Music Studio** : catalogue/Artist Brain existants, conversation partagée, vidéo studio fournie et bouton « Décor spatial » pour retrouver l'ambiance de la nouvelle référence. Le catalogue lui-même n'est pas modifié dans cette tranche.
- **La Fabrique** : nouveau point de navigation visuel vers les capacités/agents, tâches/projets et contenus existants. Ne génère ni installe automatiquement de nouveaux agents ou applications.
- **IDA Home** : espaces Frigo, Domotique, Ma journée, tâches, calendrier, mémoire. Le contenu existant de l'aperçu quotidien reste accessible par « Ma journée », la préparation Home Assistant par « Domotique ».
- **Frigo** : ajout manuel d'un produit/quantité, case « À racheter », retrait et compteurs issus de la liste réellement saisie. Brouillon borné à 100 produits, en état React pendant la visite du monde ; sortie du monde/verrouillage = effacement. Aucun achat, capteur de frigo, stockage durable ou compte connecté. La persistance future passera par les contrats et permissions du Core, pas un second inventaire local permanent.
- **IDA Care** : nouveau profil visuel personnalisable, champs corporels et texte de santé facultatifs activés explicitement, sujets de quotidien sélectionnables, étapes navigables et effacement. Aucun préremplissage de données corporelles inventées, IMC calculé, diagnostic, scan ou recommandation médicale. Le mannequin et l'androïde sont un décor illustré.

## Immersive et identité

`HomeTheme` accepte `classic`, `scifi`, `immersive`. Le dernier réutilise la palette sombre via `themePalette`, et ouvre `ImmersivePresence` depuis l'accueil ou le sélecteur partagé des modules. La préférence de thème seule est conservée dans `ida.ui.theme.v1`. Le bouton « Écrire à IDA » ouvre la conversation existante : ce n'est pas encore un dialogue vocal synchronisé avec le robot. Voix, animation réactive du robot et motion tracking restent à connecter. Aucun `getUserMedia`, caméra, micro ou permission matérielle n'est ajouté.

`WorldAmbience` est réutilisé pour le robot : vidéo décorative muette, boucle inline, pause disponible, montage uniquement après visibilité et préférences, arrêt si onglet masqué/sortie. La roue, l'environnement et la présence robot sont des branches exclusives : une seule vidéo décorative est montée. Le choix d'arrêt de la roue est conservé à l'ouverture et au changement de monde. Dans Music Studio, couper la vidéo montre le décor spatial ; sa vidéo existante n'a pas été remplacée ou transformée.

« Voir le robot seul » masque les panneaux de présentation sans démonter ni redémarrer le film. Un dock conserve les commandes de retour, dialogue, pause et réaffichage des panneaux. Échap restaure d'abord les commandes, puis permet de revenir aux mondes. C'est un plein viewport web, sans requête de permission système.

Le parcours `CareOnboarding` est disponible par « Premiers pas » et s'ouvre après une première création réussie du **verrou local existant**, seulement une fois la frontière d'accès ouverte. Aucun changement de `LocalAccessController`, endpoint d'authentification, permission ou session. Ce parcours visuel **n'est pas une inscription cloud par e-mail**, ni une sauvegarde de dossier santé. Ces liaisons restent à construire. Les étapes peuvent toutes être ignorées sans bloquer IDA.

## Données sensibles : limites explicites

Care ne référence ni transport API, ni stockage navigateur, ni conversation, ni mémoire permanente. Les valeurs n'existent que dans l'état de son composant, puis sont abandonnées en quittant le parcours, après « Terminer sans enregistrer », à l'effacement ou au verrouillage/masquage qui démonte l'interface autorisée. Ce comportement n'est pas une promesse de purge forensique de la mémoire du navigateur. Ne pas utiliser cette démo comme dossier médical.

Avant une future sauvegarde : classification/rétention, consentement explicite approprié, contrôle d'accès par workspace, chiffrement, suppression/export, gouvernance Care et escalade humaine devront être définis côté Core. Le formulaire de cette tranche ne donne aucun consentement à cette future utilisation ni aucun accès au profil santé à un agent.

## Décors et prompts

Trois éditions via **image_gen intégré**, une par référence, sans variante ni relance. Images inspectées puis copiées dans le projet. Chemins finaux, hors Git conformément aux règles médias :

- `apps/web/public/design/user-20260909/care-scene-v1.png` — [Care](../apps/web/public/design/user-20260909/care-scene-v1.png).
- `apps/web/public/design/user-20260909/music-scene-v1.png` — [Music Studio](../apps/web/public/design/user-20260909/music-scene-v1.png).
- `apps/web/public/design/user-20260909/fabrique-scene-v1.png` — [La Fabrique](../apps/web/public/design/user-20260909/fabrique-scene-v1.png).

Prompts appliqués :

1. **Care**, référence `8b0ff631-4f0c-4e3b-8961-d4c4d6235262.png` : retirer les interfaces, mesures, graphiques et textes ; conserver la station sombre, le lever de soleil, le mannequin holographique central non anatomique et l'androïde à droite. Décor seul, sans nouvelle donnée médicale.
2. **Music**, référence `dbd1221a-348e-4196-b261-ad5b71cbbbce.png` : retirer interface, waveform, mots et logos ; conserver orbite centrale, architecture et matériel musical ; écrans abstraits sombres et espace latéral pour les contrôles réels.
3. **Fabrique**, référence `acda3efd-a066-4991-86f0-7351c0f01fc4.png` : retirer liste de projets, mots et logos sur les surfaces ; conserver architecture, mobilier, plantes et personnes ; écrans vides.

Robot : `ambient-1.mov` provient de `F:/IDA/FRONTEND VISUELS/Vidéo.mov`, utilisé intact, y compris les textes/filigranes éventuels. `robot-poster-reference.png` est une copie intacte de `43912063-ff8f-4164-8666-3569dab8daad.png` pour le repli statique. Affichage contenu dans le cadre, sans découpe de la vidéo. Les images/films fournis restent des décors publics de la démo locale, jamais le stockage de données privées.

## Vérification et périmètre restant

Pas de tests automatiques, lint, typecheck ou build relancés, à la demande utilisateur. Les sources frontend sont servies sans erreur de transformation par le serveur de développement ; revue de code ciblée des branches de navigation, limites des brouillons et cycle des vidéos. Pas de recette navigateur ni de validation sur iPhone/Android physiques dans cette tranche. Les anciens résultats de tests des autres documents ne valent pas validation de ces nouveaux parcours.

Restent notamment : inscription e-mail réelle, sauvegarde sécurisée de Care et du frigo, reconnaissance vocale, synchronisation de la présence, motion tracking opt-in, connexion Home Assistant authentifiée, premier modèle réellement branché au dialogue. Aucun de ces services n'est présenté comme connecté par la nouvelle interface.
