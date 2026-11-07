# IDA PREMIUM UPGRADE — BRIEF POUR CODEX

**Priorité : IDA Studio et IDA navigateur.** Ensuite étendre l'expérience aux démonstrateurs IDA concernés et alimenter la Fabrique / IDA Web Engine. Rester dans le périmètre ordonné par le propriétaire.

## Pourquoi

Le propriétaire juge les versions actuelles **largement vendables**. Le Premium Upgrade est une amélioration parallèle, facultative et réversible — **jamais** une condition préalable à leur mise en marché.

## Références

- `https://tryholo.ai/` : qualité éditoriale, présentation évidente du produit, démonstration, cohérence de finition, progression de conviction.
- `https://on.com/` : expérience de site immersif ressemblant à une application sur mobile, utilisation intelligente de la surface visible et continuité des interactions.
- L'expérience Safari **ne peut pas forcer** les contrôles natifs à disparaître en onglet ; proposer le mode standalone via installation volontaire.
- Sources visuelles/vidéos d'observation non fournies à Codex = préciser la limite, ne pas inventer un audit de mouvement.

## Départs et retours arrière non négociables

- Capturer le SHA actuel de chaque `main` avant de toucher le code, et noter le branchement Render si accessible.
- Branches d'archive déjà créées (snapshot des branches `main` du 07/11/2026) : `archive/sellable-baseline-20261107` sur les dépôts non vides. Vérifier individuellement avant toute action. Un dépôt vide comme `MARIAGE` n'a pas de snapshot.
- Ne travailler que sur branche `feature/premium-upgrade-20261107` ou branche de chantier spécifique créée depuis un checkpoint. **Ne jamais remplacer `main`**, ni déployer ou merger sans validation explicite.
- Restituer `AVANT / APRÈS` avec captures desktop/mobile et des étapes de rollback (branche/commit). L'utilisateur choisit version sellable ou premium.

## Définition de « premium » pour IDA

1. Hero signature complet à la première restitution ; typographie éditoriale, composition, lumière, 3D véritable si demandée, motions couplées à des interactions physiques et non fond décoratif plaqué.
2. Narration commerciale : démontrer le parcours client réel, bénéfices, actions, véracité des preuves, progression vers demande/achat ; pas de métrique fictive.
3. UI app-like cohérente : `viewport-fit=cover`, `svh/dvh` contextuels, safe areas, menus et overlays mobiles, gestes clavier/retour, PWA uniquement adaptée à chaque marque. Réutiliser le contrat `docs/IDA_APP_LIKE_MOBILE_STANDARD.md` d'IDA Studio.
4. Fabrique IDA Web Engine : exposer les nouveaux composants comme modules versionnés/paramétrables, isoler la DA par client, contrôler les dépendances. Chaque futur site peut réutiliser app-shell, motion, layouts, transitions et QA sans copier la marque.
5. Performances réelles : progressive enhancement, lazy loading 3D, budget de rendu mobile, absence d'écran blanc. Aucun chiffre de FPS ou Lighthouse inventé.
6. Accessibilité : contraste, navigation tactile et clavier, focus, textes, motion réduite, pas de blocage de scroll ni zoom.
7. Respect des contenus/API/SEO/formulaires/thèmes existants ; pas de nettoyage hors périmètre.

## Phases avec gates

A. **Audit minimal ciblé** : fonctionnalités existantes, matrices desktop/mobile, flux critiques, assets à conserver, captures de base si navigateur disponible.
B. **Implémentation IDA Studio**, qualité finale dans le périmètre, raccordement aux composants réutilisables.
C. **Implémentation IDA navigateur**, conserver identité, auth, données privées et comportements existants.
D. **Extension par site** : adapter chaque template/client séparément à sa DA. Ne pas toucher au dépôt suivant tant que la régression du précédent n'est pas vérifiée.
E. **Fabrique IDA Web Engine** : registre versionné, presets, preview, contrôles, génération validée.

## Critères de sortie

- QA visuelle vraie (desktop 1440 px, iPhone ~390 px + Safari installé/non installé), vidéo scroll, back/forward, clavier, orientation, modal, safe area, PWA/manifest et connexion lente.
- Typecheck/build/tests **exécutés**, diff examiné pour absence de pertes. Mesures comparatives avant/après si disponibles.
- Branches de conservation et dernier SHA documentés, rollback démontrable.
- `NON VALIDÉ VISUELLEMENT` tant qu'un navigateur/terminal physique n'a pas été utilisé. Pas de publication.
- Réponse Codex courte : `branche | contenu livré | preuve visuelle/tests | régressions/limites | PR/rollback`.

**Consigne : produire un premier rendu déjà au standard IDA, sans multiplier les allers-retours et sans longues explications qui consomment les tokens.**
