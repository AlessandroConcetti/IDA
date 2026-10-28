# IDA PRO Cloud — Menuiserie

État vérifié le 28 octobre 2026. Ce document distingue le module local testé et le déploiement distant encore à publier ; il ne constitue pas une annonce de mise en production.

## Principe partagé

Un même moteur métier, les mêmes contrats et les mêmes données derrière les vues Atelier 3D et Classique. Le choix du métier adapte les assets et le vocabulaire, sans reconstruire les moteurs devis, projets, planning, livraisons et facturation. Le classique ne charge pas la scène 3D.

Priorité de traitement : code déterministe, moteur spécialisé local, modèle local, puis provider cloud autorisé. Les assistants inactifs ne consomment aucun LLM. Le repli entre quotas gratuits, API légère et GPU distant doit être explicitement configuré avec des plafonds et états observables ; il n'est pas encore actif dans le pilote cloud. Aucun compte Codex ne fait office d'API commerciale implicite.

## Identités permanentes des DOTS

| Couleur | Prénom |
| --- | --- |
| Orange | Zolokodo |
| Bleu | Kouakou |
| Violet | Chipo |
| Vert | Grogno |
| Rose | Luxi |
| Doré | Luxio |

Ces identités valent pour tout IDA. Le rôle métier, les permissions et l'état d'activation restent distincts du prénom.

## État local réellement testé

- Parcours de semaine complet : 37 actions, plusieurs chantiers, devis indépendants, acceptation, approvisionnement déclaré, réception, planning, fabrication, pose, facturation, règlements partiels, relance et suivi.
- Huit rubriques métier vérifiées sur PC et format mobile, persistance après redémarrage, import CRM avec reprise et dédoublonnage.
- Virgile : déplacement automatique vers les postes, déplacement manuel au clavier et joystick, vue FPS, retour à la vue d'ensemble, panneaux ancrés dans le monde.
- Douze thèmes et palette personnalisée, fond atelier en classique, logo de chargement jusqu'au premier rendu.
- Dialogue Qwen local via Ollama sur moteur autorisé, sortie structurée contrôlée, proposition puis préremplissage à relire ; aucun chantier créé avant validation humaine. Le texte d'origine est conservé dans la description.
- 159 tests backend ciblés passent. La build dédiée n'importe plus les autres environnements IDA.

Les achats, envois, paiements et publications restent des déclarations ou brouillons ; ils ne sont pas exécutés par des connecteurs externes. Aucun agent autonome en arrière-plan n'est actif.

## Pilote serveur construit séparément

Runtime dédié à une entreprise, sans exposition d'IDA personnel ni copie de profil Windows. HTTPS, origine exacte, sessions opaques HttpOnly/Secure/SameSite=Strict, identité propre à chaque navigateur, révocation, limitation des connexions et permissions recalculées côté serveur. Aucun endpoint public de création du compte.

Dossiers chiffrés AES-256-GCM, clé serveur séparée du disque et configuration d'identité figée. Une mauvaise clé refuse de démarrer plutôt que de recréer des données. Export PGlite cohérent chiffré dans Comptabilité ; restauration opérateur uniquement dans un dossier vide, avec révocation des anciennes sessions.

Recette locale via une vraie passerelle HTTPS : login PC/mobile, création, sauvegarde, restauration et persistance après redémarrage passent. Cela ne prouve pas encore un déploiement Linux ou Render réel.

## Publication restante

Espace Render confirmé : My Workspace. Service et assets de livraison restent à publier, paramètres réels de l'entreprise à fournir, coût à approuver, puis recette sur le vrai domaine. Le paquet cloud assemblé ne contient ni compte préexistant, ni phrase de passe, ni clé. Les fonctions classiques marchent sans LLM cloud ; le moteur IA distant reste non configuré.

Proposition d'hébergement à confirmer : 1 CPU / 2 Go, 25 USD/mois, disque persistant 1 Go à 0,25 USD/mois, hors taxes et dépassement réseau. Tarifs consultés sur https://render.com/pricing le 28 octobre 2026. Le stockage éphémère gratuit ne convient pas à des dossiers clients persistants.

Avant vente : vérifier Linux/Render réel, téléphone physique et Safari, supervision, sauvegardes automatiques hors serveur, récupération du compte et revue de sécurité adaptée. Ne pas annoncer une conformité comptable, un import universel ou une compatibilité matérielle non testée.

Mac : le client web réutilise le même module. Le paquet local macOS demande un coffre Keychain et un lanceur spécifiques ; reporté après la démo pour ne pas retarder le menuisier.
