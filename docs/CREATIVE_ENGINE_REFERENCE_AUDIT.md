# La Fabrique — audit de référence et dimensionnement local

Date : 13 septembre 2026. Statut : **ANALYSE — architecture proposée, non implémentée**.

## Décision de cadrage

Open-Generative-AI est une référence à étudier, pas une dépendance centrale, un nouveau Core ou une autorité sur les données IDA. **MuAPI est exclu de l'intégration**, conformément à la dernière précision de l'utilisateur. Aucun compte, token, fallback ou appel MuAPI ne doit être ajouté. Les descriptions de MuAPI ci-dessous expliquent le dépôt audité ; elles ne constituent pas une recommandation de branchement.

Le résultat recherché est un Creative Engine natif, interne à La Fabrique, utilisant les permissions, le routage, les données et l'audit existants. Les agents logiciels restent à la demande. Aucun projet, agent actif, historique ou résultat fictif n'a été créé.

## Méthode et limites

- Référence examinée : [Open-Generative-AI, commit 871c1d4](https://github.com/Anil-matcha/Open-Generative-AI/tree/871c1d4ef4e184d7b6b5117147d863d30b656cbb), daté du 11 septembre 2026. Lecture publique du README, de la licence, des manifestes, de l'arborescence et de fichiers/extraits ciblés via GitHub.
- IDA : lecture des sources présentes dans le worktree, y compris les modifications sauvegardées non encore committées. Ce rapport ne certifie pas que chaque modification est dans le bundle actuellement servi.
- Pas d'installation, de scripts externes exécutés, d'inférence, d'upload, de benchmark, d'achat ou de modification Tailscale. Les mesures matérielles sont des lectures Windows/NVIDIA uniquement.
- Audit statique ciblé, pas audit exhaustif, pentest ou analyse de toute la chaîne de dépendances. Les contenus des trois sous-modules externes, les poids et le backend propriétaire MuAPI ne sont pas audités ici. Certaines lectures réseau ont échoué ; les limites sont conservées, sans conclure à une sécurité ou compatibilité non démontrée.
- Le rapport ChatGPT fourni est du contexte, pas une preuve d'implémentation. Les recommandations suivantes sont distinguées des constats de code.

## État réel d'IDA avant intégration

Vocabulaire : **REAL** = implémentation trouvée ; **CONNECTED** = échange réel observé dans cette session ; **PREPARED** = contrat/adaptateur présent mais raccordement incomplet ; **DEMO** = parcours explicitement de démonstration ; **MOCK** = doublure ; **BLOCKED** = prérequis manquant ; **PLANNED** = intention. Un fichier de tests n'est pas une preuve de connexion en production.

| Élément | État établi | Conséquence pour le Creative Engine |
|---|---|---|
| La Fabrique : briefs, création/lecture/clôture de tâches, export Markdown | REAL dans le code ; parcours authentifié non rejoué dans cet audit | Réutiliser la projection actuelle des tâches. Ce n'est pas un générateur de logiciels. |
| Projets logiciels isolés avec Git, fichiers, exécution et releases | PLANNED | Le préfixe de titre `Fabrique · ` ne constitue pas une isolation de sécurité. |
| Core déterministe / façade d'intelligence | REAL | Garder le même point de contrôle, ne pas ajouter un second cerveau. |
| Module Registry | REAL | La Fabrique n'est pas actuellement un module métier autonome enregistré. Définir son contrat avant d'ajouter des outils. |
| Agent Registry | REAL pour le mécanisme ; manifestes Memory Manager et Music Librarian PLANNED | Ne pas afficher une équipe logicielle active. Aucun manifeste logiciel trouvé. |
| Profils des environnements | PLANNED dans les déclarations par défaut | Le profil `creative` n'a ni agent enregistré ni contexte autorisé ; il ne constitue pas encore le profil logiciel de La Fabrique. |
| Provider Registry / Provider Router | REAL pour les contrôles ; PREPARED pour une extension multimédia | Contrat actuel `TEXT` / `REASONING`, sortie texte. Ni job vidéo ni artefact binaire. |
| Adaptateurs de texte et dialogue local | PREPARED, activation conditionnelle | La configuration exige notamment l'opt-in local ; aucune réponse de modèle n'a été vérifiée ici. |
| Tool Gateway + IdentityAccessPolicy | REAL | Liste blanche + autorisation de session/workspace. Le gateway seul ne remplace pas les contrôles métier et SQL. |
| Approval Center / décisions serveur | REAL pour les contenus/posts et leurs versions | Étendre le mécanisme existant aux plans créatifs ; le coût, l'artefact et le provider doivent faire partie de la décision. |
| Mémoire | REAL : propositions puis CONFIRMED / REJECTED | Pas de mémoire de travail logicielle isolée constatée. Ne pas écrire les décisions techniques dans la mémoire personnelle par défaut. |
| Context Broker | REAL pour `MusicContextBroker` spécialisé ; contexte logiciel PLANNED | Réutiliser ses principes de sélection et réautorisation, pas prétendre qu'un broker universel existe déjà. |
| Workspaces / memberships / grants / stockage privé | REAL dans les contrats, requêtes et routes | Étendre l'isolation existante à chaque projet logiciel ; ne pas créer une base cliente concurrente. |
| Audit d'intelligence | REAL : événements bornés, liens d'identité, garde append-only | Les contraintes actuelles sont spécialisées ; migration nécessaire avant d'ajouter les événements créatifs. |
| Egress / isolation d'un moteur externe | PREPARED au niveau des transports et policies ; sandbox créative PLANNED | Un port loopback ou un processus Electron ne prouve pas l'absence de sorties réseau. |
| Accueil local IDA | CONNECTED : HTTP 200 observé sur 127.0.0.1:8787 lors de la reprise | Ne prouve ni génération, ni authentification iPhone. Le pairing reste en pause. |

Sources IDA : [Fabrique][ida-fabrique], [CoreIntelligence][ida-core], [modules][ida-modules], [agents][ida-agents], [profils][ida-profiles], [contrat d'intelligence][ida-contract], [router][ida-router], [gateway][ida-gateway], [broker musique][ida-broker], [API][ida-api], [persistance][ida-db], [audit][ida-audit], [lancement local][ida-runtime]. Aucun inventaire de projets privés n'a été lu pour fabriquer un état « vide » : le code prévoit un état vide, ce rapport ne prétend pas connaître le nombre actuel de projets.

## A. Ce que le dépôt apporte réellement

Un ensemble de studios multimédias, un catalogue et des paramètres de modèles, des clients API, des parcours d'historique/upload et un client desktop avec accès à des moteurs locaux. Les fonctions image, image→image, vidéo, image→vidéo, vidéo→vidéo, audio, lip-sync et motion graphics disposent de wrappers de requêtes. **Wrapper présent n'implique pas génération réussie, gratuite ou locale.** [Client multimédia][oga-client]

L'application web utilise Next/React ; le desktop suit un chemin Vite/Electron distinct. Les paquets workflow, agents et design incluent des dépendances vers trois autres dépôts Git. Il n'est pas établi que toutes les fonctions aient la même couverture web/desktop. [Manifestes][oga-package], [sous-modules][oga-submodules]

Ce n'est pas, à lui seul, une chaîne démontrée de création logicielle avec isolation Git, tests, audit IDA et préparation de déploiement.

## B. Ce qui est réutilisable

Des principes : registre de capacités, paramètres typés par modèle, distinction soumission/suivi/résultat, annulation, contrats d'images de référence et indication de disponibilité. Le dépôt sépare notamment modèles, capacités et contrats d'entrées. [Arborescence du studio][oga-studio]

Une réutilisation de code précis nécessitera une revue du fichier, de ses dépendances et de sa provenance. Aucun code externe n'a été copié dans IDA. Le choix prioritaire reste une implémentation adaptée aux contrats natifs.

## C. Inspiration seulement

Les studios spécialisés, le graphe de workflow, la reprise d'une génération et les formulaires contextuels. Conserver la direction artistique IDA et le Motion Design System existant.

Le endpoint `motion-graphics` génère un contenu via API : il ne remplace pas les animations CSS et les politiques de réduction de mouvement de l'interface IDA. [Client multimédia][oga-client]

## D. Inutile pour la tranche actuelle

Le white-label, sa facturation, une seconde coquille Electron, tous les studios d'un coup, des centaines de modèles non évalués, des personnages commerciaux et un autre tableau de comptes. Ni un abonnement ni un catalogue énorme n'apportent l'isolation logicielle manquante.

## E. Risques et écarts constatés

- `StandaloneShell` sauvegarde la clé MuAPI dans `localStorage` et écrit un cookie depuis JavaScript. `DesignAgentStudio` écrit également la clé sous `localStorage.token`. À ne pas reprendre : ces secrets seraient accessibles au code client. [Shell][oga-shell], [Design Agent][oga-design]
- La route `/api/api/v1/*` enlève bien le cookie des headers sortants : il existe donc des corrections de sécurité à reconnaître. Cette route reste un proxy vers MuAPI, pas le Tool Gateway IDA. [Route proxy][oga-proxy]
- Le proxy d'upload vérifie une clé, appelle une validation de destination et refuse certains types/extensions. Ces protections ne suffisent pas à démontrer une isolation par workspace, des quotas, une validation du contenu réel ou une maîtrise des redirections. Pas de preuve d'exploitation dans cet audit. [Upload][oga-upload]
- L'historique local d'uploads et le partitionnement par hash de clé ne remplacent pas une identité et une autorisation serveur. Supprimer une entrée locale ne prouve pas la suppression d'une copie distante. [Historique][oga-history], [partitionnement][oga-persist]
- Le téléchargement de moteurs est du code privilégié. Le chemin macOS contient un retrait de quarantaine ; ne pas importer cette pratique ni les contournements de protections proposés par la documentation. [Moteur local][oga-local]

## F. Dépendances externes — MuAPI exclu

Les générations cloud et les fonctions d'historique, de coût, de workflows et d'agents passent par le client MuAPI. `AgentStudio` importe ses opérations de conversation/création depuis ce client. `WorkflowStudio` charge ses données via le même point ; `DesignAgentStudio` intègre un paquet externe. Ce n'est pas une preuve d'exécution autonome locale des agents ou du graphe. [Client][oga-client], [Agent Studio][oga-agent], [Workflow Studio][oga-workflow], [Design Agent][oga-design]

Les binaires, poids, paquets npm/Python et sous-modules demandent aussi des sources externes lors de leur acquisition. **Local-first ne signifie pas installation sans réseau** ; une fois acquis et vérifiés, l'inférence devra pouvoir fonctionner sans egress. Aucune acquisition n'a eu lieu.

## G. Ce qui peut fonctionner localement et matériel réel

Le chemin desktop expose via IPC des opérations sd.cpp et Wan2GP. Le gestionnaire sd.cpp prévoit des répertoires de données/binaires/modèles et le lancement de processus. Wan2GP est un serveur Gradio séparé, lancé par l'utilisateur ; l'adaptateur sonde ses noms d'API et transmet les entrées. Une URL distante configurée dans cet adaptateur n'est évidemment pas du calcul sur ce PC. [Préchargement][oga-preload], [sd.cpp][oga-local], [Wan2GP adapter][oga-wan]

Electron active `contextIsolation` et désactive `nodeIntegration`. C'est utile, mais ne constitue pas une sandbox suffisante pour du code tiers ou pour les droits de ses opérations IPC. [Electron][oga-electron]

### Mesures Windows/NVIDIA du 13 septembre

| Ressource | Mesure |
|---|---|
| CPU | AMD Ryzen 5 5600H, 6 cœurs / 12 threads |
| RAM installée | 16 Gio ; environ 13,9 Gio utilisables par Windows |
| GPU de calcul proposé | NVIDIA GeForce RTX 3060 Laptop GPU |
| VRAM exacte | 6 144 Mio, soit 6 Gio ; 5 450 Mio libres au relevé |
| Pilote NVIDIA | 581.80 |
| GPU intégré | AMD Radeon Graphics ; ne pas additionner sa mémoire aux 6 Gio NVIDIA |
| C: | SSD NVMe Intel ; volume 474,7 Gio, 82,8 Gio libres |
| F: | SSD Samsung PSSD T7, connexion USB, NTFS ; 931,5 Gio, 458,6 Gio libres |

Méthode : CIM Windows pour CPU/RAM, `nvidia-smi` pour VRAM, inventaire volumes/partitions/disques pour C: et F:. `AdapterRAM` de WMI donnait une valeur incohérente pour la NVIDIA : la valeur retenue vient de NVIDIA. Ce sont des instantanés, pas des réservations d'espace. L'utilisateur libère C: en parallèle. Aucun fichier supprimé ou déplacé.

### Faisabilité proposée, pas benchmark

1. **Image locale : premier candidat.** Évaluer sd.cpp/CUDA avec un seul modèle compact et une génération à la fois. Le projet amont documente Windows, CUDA, quantification et réduction de mémoire ; cela justifie un essai, pas une garantie de vitesse sur ce portable. [sd.cpp officiel](https://github.com/leejet/stable-diffusion.cpp)
2. **Vidéo locale : expérimentation ultérieure.** Wan2GP annonce certains modèles utilisables à partir de 6 Go de VRAM ; le PC se situe à ce seuil, avec une RAM système limitée. Modèle/résolution/durée devront être sélectionnés ensemble. Ne pas promettre du temps réel, de la 4K ou tous les modèles Wan/Hunyuan/LTX. [Wan2GP officiel](https://github.com/deepbeepmeep/Wan2GP)
3. **Logiciels :** briefs, architecture, génération de propositions et vérifications ne nécessitent pas l'installation de toute une suite multimédia. Les futurs builds seront isolés et bornés ; les moteurs image/vidéo ne deviennent pas le cerveau des agents logiciels.
4. **Concurrence :** planifier les tâches GPU en série au début ; éviter l'inférence texte et vidéo simultanées. Suspendre les effets coûteux pendant un rendu sans changer les permissions.

Libérer le SSD ne crée ni RAM ni VRAM. Le SSD aide au stockage et aux chargements, pas à remplacer la carte graphique. Aucune recommandation d'achat matériel n'est nécessaire à ce stade.

### Utilisation proposée de F: — aucun déplacement effectué

Répertoire futur, à créer seulement lors d'une tranche approuvée : `F:/IDA/AI/`, avec `runtimes/`, `models/`, `cache/`, `jobs/` et `artifacts/` séparés. L'emplacement serait choisi côté serveur, jamais un chemin arbitraire fourni par un agent.

- Mettre les poids et les rendus sur F: ; configurer explicitement les caches pour éviter des copies volumineuses implicites dans le profil Windows sur C:.
- Garder pour l'instant le Core, ses données et sa configuration à leur emplacement existant. Pas de migration globale, de junction ou de déplacement du dossier utilisateur.
- Vérifier l'identité du volume et sa disponibilité à chaque démarrage. F: absent, plein ou débranché = tâche refusée/arrêtée proprement, jamais reprise silencieuse sur C:.
- Le T7 est USB : débit réel et stabilité sous charge non mesurés. Ne pas débrancher pendant un job ; prévoir des écritures temporaires puis une finalisation atomique.
- Ne pas scanner ni prendre possession du contenu personnel de F:. Ne pas placer les tokens dans les répertoires de modèles. Un SSD contenant les rendus n'est pas, à lui seul, une sauvegarde.

## H. Coûts

MuAPI : exclu. Autres services cloud : non activés dans cette tranche. Ne pas déduire la gratuité d'un label open source, d'un abonnement utilisateur ou d'un bouton « free ».

Le local consomme temps machine, électricité, RAM, VRAM et disque ; les poids peuvent avoir leurs propres conditions. Avant chaque acquisition : origine, licence, taille, destination, budget disque et validation. Pas de téléchargement massif automatique.

Le futur coût d'une action sera `LOCAL`, `FREE_TIER`, `PAID`, `UNKNOWN` ou `BLOCKED`. `UNKNOWN` ne doit jamais être traité comme zéro. Pour une éventuelle offre cloud autorisée plus tard, approbation liée au devis, au provider, aux entrées et au plafond ; aucun fallback payant implicite après un échec local.

## I. Capacités à intégrer progressivement

| Capacité | Équivalent natif proposé | Priorité |
|---|---|---|
| Étudier une référence | Source épinglée, inventaire, provenance, risques, dossier exportable | Première tranche |
| Concevoir un logiciel | Brief → architecture → tâches → critères d'acceptation | Après validation de la première tranche |
| Produire un artefact image | Job local typé, suivi réel, stockage privé | Première capacité média à expérimenter |
| Éditer / multi-référence | Références autorisées, tailles/hash/licences, paramètres typés | Après l'image simple |
| Vidéo / image→vidéo | File GPU bornée, annulation, récupération après arrêt | Après benchmark matériel |
| Audio / lip-sync / vidéo→vidéo | Adaptateur et règles de consentement propres | PLANNED, pas de faux boutons actifs |
| Workflows | Plan déterministe versionné et étapes autorisées | Après plusieurs outils fiables |

## J. Architecture cible — extension, pas doublon

```text
La Fabrique (interface et projet réel)
  → API IDA : identité + workspace + droits sur le projet
  → Creative Engine : plan versionné, outils limités, autorité humaine
      → contexte de projet sélectionné et réautorisé
      → Tool Gateway + règles métier + approbation liée au plan
      → Provider Router partagé, étendu aux capacités créatives
          → moteur local isolé : image d'abord, vidéo ensuite
      → validation des sorties → stockage privé → audit → interface
```

MuAPI ne figure pas dans le registre cible. Le « Creative Provider Router » est une vue spécialisée du router partagé, pas un autre système de politiques ou de secrets.

Contrats proposés : `CreativeProject`, `ReferenceRecord`, `CreativePlan`, `CreativeJob`, `CreativeArtifact`, `ProjectDecision`. Les noms sont des propositions, pas des objets déjà créés. Chaque projet logiciel a un workspace isolé, des grants explicites et son propre répertoire de travail/Git ; aucune propagation automatique des droits d'autres projets.

Un job distingue préparation, approbation éventuelle, file, exécution, réussite, échec, annulation et résultat incertain après coupure. La progression vient du moteur ; sinon afficher une attente indéterminée. Idempotence et reprise persistantes empêchent un redémarrage de relancer une dépense ou de publier un résultat incomplet.

Les approvals actuelles sont liées à des contenus : les étendre avec le hash du plan, des entrées, du modèle/provider et du devis. Le Tool Gateway générique ne suffit pas à vérifier seul ces liaisons. Une révision invalide l'accord précédent.

La mémoire de travail est une projection autorisée du projet, non un nouvel accès global aux données. Conservation à définir explicitement : décisions versionnées pendant la vie du projet, artefacts temporaires à durée bornée, suppression logique/audit préservé. Aucun secret ni donnée Care/Finance importé par défaut.

Le moteur externe ne reçoit ni DB ni token IDA. Entrées copiées minimales, répertoire de sortie dédié, limites CPU/RAM/VRAM/temps/disque, réseau refusé hors acquisition contrôlée. Même règle pour le futur runner de builds. Le téléphone consommera l'API IDA existante, jamais directement Gradio ou un serveur de modèles.

## K. Agents réellement nécessaires

**Aucun nouvel agent actif aujourd'hui.** Pour la première tranche, un seul rôle d'analyse de référence suffit, encadré par des contrôles déterministes. Les rôles suivants ne deviennent des manifestes qu'au moment où leurs outils existent :

| Rôle | Entrée → sortie | Droits et limites |
|---|---|---|
| Product / Reference Analyst | Besoin + sources choisies → faits sourcés et critères | READ ; aucune exécution du dépôt étudié |
| Software Architect | Dossier validé → contrats et plan | Propositions ; pas de modification de policies |
| Software Builder | Plan approuvé → patch/artefacts du projet | WRITE dans la sandbox du projet uniquement |
| Quality Reviewer | Patch + critères → résultats réels et écarts | Runner de tests autorisé, aucune certification automatique |
| Creative Governance Steward | Provenance, risques, permissions, release → alertes | READ/propositions ; escalade au propriétaire/reviewer humain, spécialiste juridique si nécessaire |

Frontend/backend/UX/documentation peuvent commencer comme compétences du même rôle, sans quinze agents décoratifs. Les évaluations, prompts versionnés, outils autorisés et mécanismes de désactivation sont obligatoires avant activation. Les agents n'approuvent pas leurs propres actions.

## L. Ordre de développement recommandé

1. Présenter cet audit et valider la tranche suivante. Aucun code créatif modifié pendant l'analyse.
2. Référence → dossier : contrat isolé, provenance, lecture limitée de sources sélectionnées, synthèse sourcée/export et état vide honnête. Aucun moteur lourd requis.
3. Projet logiciel → plan : étendre les workspaces/grants et la mémoire de travail ; premier manifeste d'analyse seulement.
4. Job local image : un modèle choisi, licence/hash vérifiés, emplacement F: et budget validés, arrêt contrôlé. Une image réellement produite constitue le jalon, pas un badge.
5. Patch logiciel → vérification isolée → revue humaine ; artefacts téléchargeables, pas de déploiement automatique.
6. Vidéo locale courte après mesure RAM/VRAM/durée/qualité ; puis édition, audio et workflows selon besoins réels.

La génération d'images et la création logicielle sont deux capacités distinctes ; l'une n'est pas un prérequis artificiel de l'autre.

## M. Vérifications nécessaires

- Isolation inter-workspaces/projets ; grants révoqués pendant une lecture ou une génération ; agent PLANNED refusé.
- Référence malveillante demandant des secrets ou un changement de règles ; URL interne/redirect interdite ; source trop grosse ; provenance perdue.
- Entrées et sorties : type réel, taille, hash, chemins absolus/traversée/symlinks ; HTML/JS généré jamais exécuté dans l'origine IDA.
- Devis absent/périmé, plan modifié, double clic, retry après timeout, annulation après acceptation provider, redémarrage pendant un job.
- F: absent/plein/débranché, modèle corrompu, GPU indisponible, mémoire insuffisante, moteur bloqué ; aucun fallback MuAPI/cloud.
- Tests natifs existants de contrats, identity, gateway, registry, router, broker, audit et approvals ; ajouter les scénarios créatifs ciblés puis lint/types.
- Non-régression Home/Care/Music, roue des mondes, thèmes, accessibilité et « Parler à IDA » ; progression honnête et réduction du mouvement.

Pas de campagne de tests d'exécution externe pendant cet audit : aucun logiciel tiers n'a été lancé. Le benchmark local reste à faire après choix/validation du moteur et du modèle.

## N. Sécurité : conditions avant raccordement

Les risques prioritaires sont la prompt injection des références, l'exécution de scripts de dépendances, l'exfiltration par URL de résultat, les secrets client, la confusion entre workspaces et le contournement d'une approbation après modification. S'y ajoutent l'épuisement mémoire/disque et les résultats incertains après coupure.

L'installation d'un moteur doit constituer une action administrative distincte de son invocation. Version épinglée, provenance, signatures/hash disponibles, revue de dépendances et rollback ; aucun « install latest » ordonné par un modèle. Les plugins/MCP/CLI externes ne sont pas activés implicitement. Une URL loopback n'autorise pas un réseau arbitraire.

## O. Licences et provenance

Le dépôt principal contient une licence MIT avec notice des contributeurs 2026. Toute réutilisation devra conserver les notices applicables. Cette observation documentaire n'est pas une validation juridique de l'ensemble. [Licence épinglée][oga-license]

Les licences des sous-modules, dépendances, poids, LoRA, jeux de données, voix, marques, textes et assets restent à vérifier individuellement. Leurs conditions ne sont pas déduites de la licence de l'interface. Le futur dossier de provenance conservera source, version/hash, licence, attribution, modifications et limites d'usage. Les questions commerciales ambiguës remontent à un humain compétent.

## P. À garder hors d'IDA

MuAPI ; comptes et cookies du produit de référence ; accès automatique aux fichiers personnels ; scripts tiers dans le Core ; serveur Gradio exposé au réseau ; mémoire partagée inter-projets ; plugins non revus ; désactivation de protections OS ; publications/achats/commercialisation automatiques ; faux résultats et faux agents actifs.

**Conclusion :** matériel crédible pour démarrer petit en image locale, vidéo conditionnelle ; F: offre une capacité de stockage suffisante pour une sélection maîtrisée. Le premier manque d'IDA reste le parcours de projet créatif isolé et audité, pas une installation géante de modèles. La prochaine étape proposée est un dossier de référence natif, suivi d'une première capacité locale vérifiée, après validation humaine.

[ida-fabrique]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/web/src/FabriqueEnvironment.tsx
[ida-core]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/api/src/core-intelligence.ts
[ida-modules]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/packages/domain/src/modules.ts
[ida-agents]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/packages/domain/src/agent-registry.ts
[ida-profiles]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/packages/domain/src/environment-brains.ts
[ida-contract]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/packages/contracts/src/intelligence.ts
[ida-router]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/packages/domain/src/provider-router.ts
[ida-gateway]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/packages/domain/src/tool-policy.ts
[ida-broker]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/api/src/music-context.ts
[ida-api]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/api/src/app.ts
[ida-db]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/api/src/database.ts
[ida-audit]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/api/src/intelligence-audit-schema.ts
[ida-runtime]: C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/api/src/local-preview.ts
[oga-client]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/packages/studio/src/muapi.js
[oga-package]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/package.json
[oga-submodules]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/.gitmodules
[oga-studio]: https://github.com/Anil-matcha/Open-Generative-AI/tree/871c1d4ef4e184d7b6b5117147d863d30b656cbb/packages/studio/src
[oga-shell]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/components/StandaloneShell.js
[oga-design]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/packages/studio/src/components/DesignAgentStudio.jsx
[oga-agent]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/packages/studio/src/components/AgentStudio.jsx
[oga-workflow]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/packages/studio/src/components/WorkflowStudio.jsx
[oga-proxy]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/app/api/api/v1/%5B%5B...path%5D%5D/route.js
[oga-upload]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/app/api/upload-binary/route.js
[oga-history]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/src/lib/uploadHistory.js
[oga-persist]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/packages/studio/src/persistKey.js
[oga-local]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/electron/lib/localInference.js
[oga-wan]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/electron/lib/wan2gpProvider.js
[oga-preload]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/electron/preload.js
[oga-electron]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/electron/main.js
[oga-license]: https://github.com/Anil-matcha/Open-Generative-AI/blob/871c1d4ef4e184d7b6b5117147d863d30b656cbb/LICENSE
