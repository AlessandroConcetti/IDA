# IDA — démo locale

Utiliser seulement des données fictives. Aucun compte social, publication publique, paiement ou service cloud n’est actif.

## Lancer

1. Depuis la racine, `pnpm install` si les dépendances manquent, puis `pnpm dev`.
2. Ouvrir `http://127.0.0.1:5173` ; l’API écoute sur `127.0.0.1:8787`. Laisser `VITE_IDA_API_URL` vide pour conserver le proxy de même origine.
3. Ne pas exposer le serveur sur le réseau local ou Internet. Un viewport mobile teste la mise en page, pas une connexion distante depuis un téléphone.
4. Le décor livré localement doit exister dans `apps/web/public/design/aurora-atrium.png` ; voir [provenance et installation](AURORA_ASSET.md). Il n’est pas versionné ; sans lui, le fond reste ivoire.

`LOCAL_DEMO` s’ouvre directement avant tout setup. `LOCAL_LOCK` est un mode de test opt-in : son initialisation rend le verrou persistant dans cette base. Tester ce parcours avec une base dédiée, sans enregistrer de passphrase ou cookie dans une capture. Ne pas effacer une base utilisateur pour réinitialiser l’accès.

## Parcours conseillé

1. Accueil Aurora : ouvrir les cinq cartes ; « Explorer tous les espaces » donne accès au calendrier, campagnes, statistiques, tâches, mémoire et système. Le soleil réduit temporairement la transparence.
2. Artist Brain : consulter/modifier le profil artistique. Music Brain : créer une release, puis un morceau et choisir cette release explicitement.
3. Content Library : importer un petit média fictif (25 MiB maximum), choisir les liens musicaux, rechercher et prévisualiser. Les médias de seed sans fichier ne promettent pas d’aperçu réel.
4. Campagnes : créer un brief `DRAFT`, puis choisir explicitement une release et un morceau. Aucun planning n’est généré automatiquement.
5. Dans Contenus, Approval Center : « Approuver » une proposition préexistante. Cette décision ne publie rien. La campagne précédente ne crée pas encore sa propre proposition : ne pas simuler ce lien manquant.
6. Calendrier : planifier la version approuvée uniquement dans IDA, puis éventuellement annuler ce snapshot interne. Aucun worker social ne s’exécute.
7. Tâches : créer et terminer une tâche fictive. Mémoire : proposer une préférence puis la confirmer ou la refuser.
8. IDA : essayer une commande ci-dessous, retrouver sa réponse dans la conversation ; Système : consulter l’activité et les manifestes déclarés.

## Commandes actuellement reconnues

- « Qu’est-ce que j’ai aujourd’hui ? » / « Qu’est-ce que j’ai demain ? »
- « Liste les médias inutilisés »
- « Quel est l’état du système ? »
- « Pourquoi Instagram n’est pas connecté ? »

Le Core est encore déterministe et en lecture pour ces commandes, pas une IA générative générale. Les suggestions de campagne ne sont pas produites par un modèle actif. Si l’API est inaccessible, IDA ne fabrique ni agenda ni campagne de secours et ne relance aucune demande automatiquement.

## Vérifications automatisées — 6 septembre 2026

Le test « enchaîne le parcours de démonstration local sans publication externe » exécute le scénario par injection HTTP sur une base en mémoire et un stockage temporaire : profil, release, morceau, vrai petit fichier PNG fictif, recherche par liens musicaux, campagne versionnée, proposition seed approuvée, planification interne, tâche, préférence consentie et historique. Il ne touche pas à la base de travail ni aux médias de l’utilisateur. Il ne remplace pas la recette navigateur.

Les tests de présentation vérifient l’absence de réponse inventée en cas d’API manquante, de score Analytics simulé et de profil Artist Brain fictif modifiable avant chargement. Les libellés français ne changent pas les valeurs techniques envoyées à l’API.

Le résumé et ses catalogues se mettent à jour après création de release, morceau, média ou campagne, approbation/refus, planification interne ou annulation confirmés. Les lectures rapprochées sont regroupées ; une réponse antérieure à une nouvelle modification ne peut pas remplacer les données récentes. En cas d’erreur de lecture, les anciens chiffres sont masqués : revenir à l’accueil relance uniquement la lecture, jamais l’écriture. Ce mécanisme ne synchronise pas encore en temps réel plusieurs appareils ou onglets.

Validation de cette tranche : **165 tests / 15 fichiers**, types des quatre apps/packages, lint et build web réussis. En navigateur, sur une base fictive en mémoire : une approbation a fait passer le compteur de 2 à 1 et un nouveau morceau est apparu dans le catalogue sans recharger la page. La planification d’une proposition datée du 1er septembre a été refusée le 6 septembre : ce garde fonctionne, mais les dates de seed nécessitent une correction dédiée pour terminer le parcours calendrier. Ne pas désactiver cette validation, modifier la base utilisateur ou reculer l’horloge réelle pour la démo.

## Limites à conserver visibles

Les réseaux affichent leurs capacités déclarées, pas des connexions réelles. Les deux manifestes d’agents restent `PLANNED`. Scheduler, notifications réelles, analytics connectées, voix, gestes, Cosmos, finance, courses et Device Linking réel restent futurs. Titres, boutons du parcours et principaux statuts sont français ; certains libellés secondaires restent à consolider. L’internationalisation FR/EN est différée. Le scénario métier complet et le verrou doivent encore faire l’objet d’une recette navigateur dédiée. Une réponse réseau perdue après une écriture peut laisser son résultat incertain : vérifier les données à l’accueil avant de répéter l’action.
