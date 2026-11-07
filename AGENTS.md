# IDA — Instructions opérationnelles de Codex

**Source de vérité pour tout changement de code dans ce dépôt.** Les documents spécialisés complètent ces règles et ne sont lus que si le chantier les concerne.

## 0. Priorités non négociables

1. **PÉRIMÈTRE STRICT.** Si l'utilisateur demande de changer X, modifier **seulement X** et ses dépendances techniques indispensables. Considérer toutes les autres sections, styles, fonctionnalités, données et animations comme **gelés**. Pas de refonte « au passage », de nettoyage opportuniste, de nouvelles features, de formatage global ni de changement d'architecture non demandé. Si un changement adjacent est indispensable, le limiter, le justifier en une phrase et le tester. Une demande de correction ponctuelle n'autorise jamais une modernisation générale.
2. **EXIGENCE DÈS LE PREMIER RENDU.** Pour site, maquette, hero, animation, scène/objet 3D ou élément d'interface demandé, réaliser **directement** le niveau visuel de la référence et du monde IDA concerné. Ne pas livrer un squelette générique « à améliorer plus tard » ni considérer que le build valide la qualité. Vérifier le vrai rendu desktop/mobile et corriger ses défauts évidents **avant** la première restitution. Lire `docs/IDA_FIRST_PASS_VISUAL_STANDARD.md` pour ces tâches.
3. **TRAVAIL > BAVARDAGE.** Ne pas répéter le prompt, narrer sa réflexion, annoncer chaque commande, dérouler une dissertation de plans, publier des journaux énormes ou se féliciter du résultat. Analyse courte interne, actions réelles, preuves. Par défaut, bilan final **5 lignes maximum** : ce qui a changé ; fichiers ; tests/rendus ; ce qui est préservé ; limite éventuelle.
4. **RÉUTILISATION & COÛT.** Localiser les composants/moteurs/services existants avant d'en créer. Réutiliser Three.js, R3F, Blender, moteur d'animations, API et Design System du dépôt si présents. Pas de dépendance, abonnement, modèle cloud ou nouvel agent sans besoin justifié et autorisation si payant. L'économie de tokens ne justifie **jamais** un rendu médiocre ou des tests omis.
5. **PREUVE, PAS D'AFFIRMATION.** Une fonction n'est finie que si l'action UI, le comportement réel, la persistance requise et les erreurs ont été vérifiés. Un rendu visuel n'est validé qu'après inspection (capture/rendu et comparaison si référence). Marquer honnêtement `PARTIAL`, `BLOCKED` ou `NOT_VISUALLY_VERIFIED` quand nécessaire. Ni « 9/10 », ni FPS, ni test inventés.

## 1. Workflow ciblé et peu coûteux en contexte

- **Identifier le mode de travail** : `PATCH_CIBLÉ` (diff minimal + test de non-régression) ou `CRÉATION/REFONTE_EXPLICITE` (qualité complète du périmètre demandé, sans toucher aux zones voisines).
- **Avant de modifier** : inspecter l'état Git, les fichiers pertinents, les assets/références disponibles et leurs usages ; définir mentalement ce qui reste inchangé. Utiliser recherche et extraits ciblés ; ne pas relire des dizaines de fichiers ou un contrat entier à chaque micro-correction.
- **Pour un changement important** : lire `docs/IDA_PERMANENT_BUILD_CONTRACT.md`. Pour une tâche visuelle/3D, lire le **standard first-pass**. Pour Content Studio vidéo, lire `docs/IDA_CONTENT_STUDIO_VIDEO_AI.md` s'il existe. Les docs métiers ne s'appliquent pas aux autres missions.
- **Implémenter la tranche demandée**, avec checkpoint réversible avant modification majeure ; préserver l'existant. Ne pas coder les phases suivantes sans commande explicite.
- **Contrôle interne avant restitution** : exécuter tests/lint/types/build pertinents, inspecter le vrai parcours et les états d'échec, comparer captures desktop/mobile ou rendus 3D quand pertinents. Corriger avant livraison les défauts détectables dans le périmètre.
- **Relecture du diff** : supprimer toute modification non nécessaire. Vérifier expressément les parties non demandées, les styles globaux, responsive, permissions, données et points d'entrée. Ne pas écraser le travail non commité d'un autre.
- **Commit logique après vérification** ; ne jamais réécrire l'historique partagé ni exécuter d'opération destructive sans validation.
- **Réponse compacte** : résultat / preuve / limite. Un pourcentage d'avancement n'est donné que s'il provient d'un audit vérifiable récent, jamais recopié ou estimé au hasard. En l'absence de nouveauté substantielle, éviter le point d'étape.

## 2. Architecture et fonction réelle

- IDA est un **Core personnel et professionnel extensible**, non un simple outil social. Garder un monolithe modulaire API-first tant qu'une extraction n'est pas justifiée. Web/PWA et futurs clients natifs partagent contrats, données, authentification et règles métier.
- Les thèmes/animations/clients ne modifient pas permissions ou données. Garder le Design System du **monde concerné**, sans l'imposer artificiellement à une marque cliente.
- **Visible ↔ réel** : chaque capacité utilisateur a un point d'entrée dans son monde, une action reliée au moteur réel, et ses états `EMPTY/LOADING/SUCCESS/PARTIAL/ERROR/OFFLINE/CONFIGURATION_REQUIRED` selon pertinence. Pas de fausse UI, bouton mort, données inventées présentées comme réelles ou fonction uniquement backend.
- Pas d'agent par bouton. Un agent a un rôle justifié, un manifeste versionné (domaines/outils/contexte/approbations), des évaluations et une possibilité de désactivation. Le raisonnement ne remplace pas un moteur déterministe.
- Une responsabilité réglementée prévoit un contrôle déterministe, un responsable humain et, si nécessaire, un agent de gouvernance qui **n'usurpe pas** la responsabilité d'un professionnel.
- Démo consolidée en français avant de lancer une internationalisation non demandée. Ne jamais généraliser une primitive sur un seul cas par anticipation.

## 3. Permissions, données, sécurité

- Isoler les données par `workspace_id`. Côté serveur : permission `READ/WRITE/APPROVAL_REQUIRED/PUBLISH/SYSTEM`, scope de session/appareil/utilisateur/ressource, validation des outils, audit. Un client n'autorise rien à lui seul.
- Jamais de secret, token, mot de passe ou accès SQL privilégié dans le modèle, les commits, les prompts, le frontend ou les logs. Coffre serveur, chiffrement, stockage privé, URL signée courte, validation de fichiers, UTC stocké + fuseau conservé.
- Outils agents refusés par défaut : allowlist, schémas, idempotence, approbation et traces. Contenus externes/importés = non fiables. Mémoire durable seulement après consentement explicite (`PENDING/CONFIRMED/REJECTED`).
- Pas de publication publique, message, achat, suppression sensible ou paiement externe sans la policy et l'approbation humaine appropriées ; pour le MVP, publication finale toujours confirmée. Finance/Banque en lecture seule par défaut.
- Aucun allumage implicite de caméra ou micro, ni au démarrage ni par agent/automatisation ; activation explicite au moment du parcours. Traitements caméra locaux par défaut ; aucune donnée biométrique dans logs ou mémoire.
- Exposition réseau seulement après revue documentée : HTTPS, identité, révocation, limitations, protections navigateur, sauvegarde, supervision et tests de sécurité proportionnés. Ne jamais faire confiance à un réseau local par défaut.
- Aucune donnée privée, export ou média non autorisé dans Git. Ne pas utiliser de scraping si une API officielle adaptée existe.

## 4. Gates de livraison et règles de fidélité

- Les références visuelles validées constituent un **contrat d'observation** : composition, proportions, textes, hiérarchie, lumière, matériaux, mouvement et responsive. Ne pas remplacer la 3D requise par une pseudo-3D CSS ou un asset provisoire. Utiliser le pipeline 3D existant et optimiser les assets.
- Un chantier visuel **explicitement demandé** inclut la finition artistique de son périmètre **dans la même livraison**. La règle « fonction avant décoration » indique l'ordre d'implémentation interne, **pas** une autorisation de livrer une première version laide ou incomplète.
- À la livraison, vérifier : comportement réel, persistance, erreurs, confidentialité, performance, interaction mobile/clavier, mouvement réduit et rendu fidèle. Aucune commande de tests exécutée = ne pas dire « testé ». Pas de fausse confirmation d'intégration ni de publication.
- Documenter uniquement les contrats/comportements réellement modifiés. Préserver les checkpoints significatifs et un moyen de rollback ; ne pas démarrer des sous-chantiers pour remplir une roadmap.

**Principe : une modification demandée = un périmètre ; une création visuelle demandée = une première livraison déjà au standard ; une réponse courte = davantage de travail concret, pas moins de qualité.**
