# Références visuelles et demandes conservées — complément du 27 septembre

Ce registre complète `FRONTEND_PRIORITIES_20260927.md`, sans retirer de demande.
L'ordre inversé demandé reste actif. Une référence graphique n'est pas une
preuve de raccordement fonctionnel ; ses noms, messages, nombres et états sont
illustratifs, jamais des données personnelles à reproduire en production.

## Sept références renvoyées

| Écran | Source utilisateur (chemin local) | Condition de finition |
| --- | --- | --- |
| Mail Sci-Fi | `F:/IDA/FRONTEND VISUELS/ChatGPT Image 25 sept. 2026, 05_18_43.png` | Réseau lumineux vivant ; rail, liste, lecteur et colonne boîtes/agents/statistiques ; conserver les états de connexion réels. |
| Mail Classic | `F:/IDA/FRONTEND VISUELS/ChatGPT Image 25 sept. 2026, 05_24_52.png` | Architecture lumineuse, verre ivoire, liste/lecteur/assistant, pièces jointes/actions/contexte. |
| Calendrier Classic | `F:/IDA/FRONTEND VISUELS/7C2F57AD-E46D-4C8A-A83B-85831702D4D9.png` | Fond lumineux, grille et détail du jour beige translucide, navigation lisible. Ne pas confondre publications éditoriales et rendez-vous personnels. |
| Calendrier Sci-Fi | `F:/IDA/FRONTEND VISUELS/CALENDAR SCIFI THEME.png` | Observatoire spatial, verre sombre, grille et détail du jour, traits colorés animés sans inventer d'événements. |
| Carrousel | `F:/IDA/FRONTEND VISUELS/IDA SPECIAL CARROUSSEL THEME.png` | **Vraie révolution** des bulles autour de la sphère centrale, textes droits et sélection accessible ; pause et mouvement réduit. |
| Chat Classic | `F:/IDA/FRONTEND VISUELS/CHAT INTERFACE CLASSIC THEME.png` | Trois colonnes, décor architectural clair, verre ivoire, conversation et saisie, contexte/outils/état réellement disponibles. |
| Chat Sci-Fi | `C:/Users/Aless/Downloads/C592EF64-0103-46D0-A510-2B99223E1406.png` | Trois colonnes, galaxie, rail, conversation et saisie, contexte/outils/état ; reproduire proportions et matières. |

Ces fichiers sont présents localement. Ils ne sont pas ajoutés au commit Git.
La comparaison doit utiliser des captures du rendu aux dimensions de référence,
puis mobile et grand écran. Ne pas annoncer « identique » sur la seule base du code.
Les exceptions explicites plus récentes priment : **orbe signature commun**,
**orbe à gauche du champ de la barre commune**, commandes de voix à droite,
renommages Le Hub / La Fondation / La baraque. Le mobile peut redisposer les
contrôles pour préserver leur accessibilité.

## Ajouts prioritaires de cette reprise

- [x] Music Studio : feu et cheminée animés sur le décor existant ; couleurs de
  néons réglables pour la pièce virtuelle. Ne commande pas Home Assistant.
- [x] Accueil / « Heureux de te retrouver » : le bouton d'ambiance produit
  une nappe audible, pas seulement changer d'étiquette. Démarrage volontaire,
  arrêt, suspension masquée, nettoyage à la connexion et erreur visible.
- [x] Barre du Hub : orbe déplacé à gauche ; vérifié mobile, bureau, 4K.
- [x] Carrousel : recette réelle de la révolution, pause clavier/survol et
  réduction de mouvement ; grille tactile de repli pour petit écran.

Recette : `../checkpoints/FRONTEND_ORBITS_MUSIC_SOUND_20260927.md`.
Le signal audio est mesuré dans le navigateur ; la sortie physique des
haut-parleurs Windows reste à écouter par l'utilisateur. La révolution est
validée, pas la conformité complète de la composition du Carrousel.

## Écarts conservés pour la suite

- Chat : prénom Classic et densité des trois colonnes, unification des orbes,
  puis captures comparées aux deux maquettes.
- Mail : décor architectural Classic et réseau Sci-Fi, icônes, colonnes
  spécifiques par thème ; les corps complets/pièces jointes/actions non
  raccordés restent indisponibles, jamais simulés comme fonctionnels.
- Calendrier : variante Classic encore absente du composant dédié ; distinguer
  visuellement et fonctionnellement calendrier éditorial et agenda personnel.
- La composition globale du Carrousel (panneaux de gauche/droite, décor et
  identité centrale) n'est pas déclarée identique du seul fait de sa rotation.
- Restent toutes les demandes de l'audit principal, dont la bulle desktop et
  les recettes natives. Aucune réouverture des providers/API à la place du frontend.
