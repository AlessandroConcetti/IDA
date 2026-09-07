# IDA — démo locale

Utiliser seulement des données fictives. Aucun compte social, publication publique, paiement ou service cloud n’est actif.

## Lancer

1. Depuis la racine, `pnpm install` si les dépendances manquent, puis `pnpm dev`.
2. Ouvrir `http://127.0.0.1:5173` ; l’API écoute sur `127.0.0.1:8787`. Laisser `VITE_IDA_API_URL` vide pour conserver le proxy de même origine.
3. Ne pas exposer le serveur sur le réseau local ou Internet. Un viewport mobile teste la mise en page, pas une connexion distante depuis un téléphone.
4. Le décor livré localement doit exister dans `apps/web/public/design/aurora-atrium.png` ; voir [provenance et installation](AURORA_ASSET.md). Il n’est pas versionné ; sans lui, le fond reste ivoire.

`LOCAL_DEMO` s’ouvre directement avant tout setup. `LOCAL_LOCK` est un mode de test opt-in : son initialisation rend le verrou persistant dans cette base. Tester ce parcours avec une base dédiée, sans enregistrer de passphrase ou cookie dans une capture. Ne pas effacer une base utilisateur pour réinitialiser l’accès.

## Parcours conseillé

Calendrier : les boutons précédent/suivant parcourent les jours, semaines ou mois ; « Aujourd’hui » revient à l’horloge du workspace. Changer de vue conserve l’instant choisi, pas le bord gauche d’une semaine. Les dates affichent aussi l’année. En cas d’échec de lecture, aucun ancien créneau n’est actionnable : « Réessayer cette période » recharge la même sélection. Les calculs restent côté serveur, y compris aux changements d’heure.

Pour tester la vidéo : entrer dans **Music Studio**, puis « Lire l’ambiance vidéo ». Elle est muette et se boucle ; « Arrêter » ou changer de thème la démonte. Aucun lancement au retour dans le monde. En mode mouvement réduit ou économie de données, la lecture reste désactivée. Les [décors locaux supplémentaires](WORLDS_AND_THEMES.md) doivent être présents ; les autres vidéos attendent les fichiers utilisateur.

1. Accueil Aurora : choisir Classic ou Sci-Fi, sélectionner un monde dans la roue puis « Entrer ». Music Studio contient Artist Brain et Music Brain ; Social Hub relie réseaux, Approval Center, calendrier, campagnes et statistiques. « Explorer tous les environnements » ouvre la grille ; « Explorer tous les espaces » garde un accès direct aux onze modules. Le soleil réduit temporairement la transparence. Les mondes « À venir » n’activent rien.
2. Artist Brain : consulter/modifier le profil artistique. Music Brain : créer une release, puis un morceau et choisir cette release explicitement.
3. Content Library : importer un petit média fictif (25 MiB maximum), choisir les liens musicaux, rechercher et prévisualiser. Les médias de seed sans fichier ne promettent pas d’aperçu réel.
4. Campagnes : créer un brief `DRAFT`, puis choisir explicitement une release et un morceau. Aucun planning n’est généré automatiquement.
5. Dans Contenus, Approval Center : « Approuver » une proposition préexistante. Cette décision ne publie rien. La campagne précédente ne crée pas encore sa propre proposition : ne pas simuler ce lien manquant.
6. Calendrier : planifier la version approuvée uniquement dans IDA, puis éventuellement annuler ce snapshot interne. Aucun worker social ne s’exécute. Si le créneau dépasse la semaine courante, choisir « Mois ». La navigation vers le mois suivant reste à ajouter ; les propositions sont toujours consultables dans Contenus, même hors de la période affichée.
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

La tranche précédente a vérifié 165 tests / 15 fichiers et l’actualisation après approbation/ajout de morceau. Le refus des dates passées a été conservé. Désormais, les nouvelles bases ont deux propositions futures (J+2/J+4) et une release associée à J+19, calculées au premier amorçage. Rien n’est redaté dans les bases existantes. Ne pas modifier les dates utilisateur ou reculer l’horloge réelle pour la démo.

Recette complémentaire du 6 septembre : sur une base de démonstration dédiée, approbation → calendrier « Mois » → planification du teaser du 8 septembre → compteur actif à 1 → annulation → compteur à 0. La validation reste acquise et le contenu redevient prêt à planifier ; aucune livraison externe n’a eu lieu. Le test de persistance contrôle en plus qu’un redémarrage ultérieur conserve dates, hashes et décisions, puis refuse de replanifier une date passée.

Vérification finale : **173 tests / 17 fichiers**, types, lint et builds API/web réussis.

### Aperçu réactivé à la demande

L’aperçu actuellement lancé utilise `tmp/ida-preview-relative-dates/data` et `tmp/ida-preview-relative-dates/media`, dossiers privés locaux ignorés par Git, distincts de la base par défaut et du précédent aperçu `tmp/ida-preview-september-06`. Aucun de ces anciens dossiers n’a été supprimé ou redaté. Le serveur écoute seulement sur `127.0.0.1:8787` et l’interface sur `127.0.0.1:5173`. Les processus sont laissés actifs à la demande de l’utilisateur ; leur durée de vie dépend de la session et du PC, pas d’un service installé.

`pnpm dev` relance la base de développement par défaut, pas cette base d’aperçu. Pour reprendre spécifiquement cet aperçu après arrêt, une fois le backend compilé, lancer depuis la racine (puis le frontend avec `pnpm --filter @ida/web dev`) :

```sh
node --input-type=module -e "import {createApp} from './apps/api/dist/app.js';const app=await createApp({dataDir:'./tmp/ida-preview-relative-dates/data',storageDir:'./tmp/ida-preview-relative-dates/media',identityMode:'LOCAL_DEMO'});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0)});await app.listen({host:'127.0.0.1',port:8787});"
```

Ne pas lancer un second serveur sur les mêmes ports ou ouvrir deux processus sur la même base. Ne pas utiliser cet aperçu pour des données réelles sensibles.

## Limites à conserver visibles

Les réseaux affichent leurs capacités déclarées, pas des connexions réelles. Les deux manifestes d’agents restent `PLANNED`. Scheduler, notifications réelles, analytics connectées, voix, gestes, Cosmos, finance, courses et Device Linking réel restent futurs. Titres, boutons du parcours et principaux statuts sont français ; certains libellés secondaires restent à consolider. L’internationalisation FR/EN est différée. Le scénario métier complet et le verrou doivent encore faire l’objet d’une recette navigateur dédiée. Une réponse réseau perdue après une écriture peut laisser son résultat incertain : vérifier les données à l’accueil avant de répéter l’action.
