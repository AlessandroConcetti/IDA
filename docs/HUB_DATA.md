# Le Hub — sources affichées

Le Hub est une projection cliente des API existantes. Il n’ajoute pas de donnée métier, de fournisseur, de credential ou de permission. Les valeurs présentes sur les images de référence ne sont pas importées comme des données personnelles réelles.

## Lectures à l’ouverture

- `/v1/tracks` : dernier projet musical non archivé, titre et artiste seulement. Aucun lien distant n’est transformé en flux audio et aucune lecture audio ne démarre automatiquement.
- `/v1/approvals/queue` : validations réelles `REQUESTED`, consultation dans le centre de validation existant. Le Hub ne publie, n’approuve et ne refuse rien implicitement.
- `/v1/activity-logs?limit=4` : quatre dernières activités du journal IDA. Ce résultat n’est pas un calcul « depuis la dernière visite » et ne prouve pas une activité autonome.
- `/v1/home/device/status` : configuration locale du connecteur Home Assistant, sans contact avec l’appareil.
- Météo : chargement automatique pour Marseille à l’ouverture du Hub, conformément à la demande utilisateur du 26 septembre. Le chargeur partagé réutilise un bulletin encore valide du cache mémoire `assistant-reads` ; sinon il vérifie `/v1/home/weather/status`, puis appelle `/v1/home/weather` avec uniquement `{ cityId }` si le service est activé. L’outil Météo réutilise le même cache et la même requête en cours : passer du Hub à l’outil ne redemande pas un bulletin valide. Aucun capteur, géolocalisation, LLM ou nouveau fournisseur n’est activé.

## Lectures au clic « Lire mes connexions autorisées »

Le Hub consulte le statut MCP, puis demande uniquement les outils déjà exposés par le serveur. Les contrôles d’identité, de workspace et d’autorisation du Tool Gateway restent applicables.

- `CALENDAR_READ` : semaine courante, projection des événements du jour dans le fuseau fourni par le serveur. Les événements traversant minuit sont conservés, les dates erronées rejetées. La disponibilité de Google Calendar dépend du connecteur réel.
- `EMAIL_READ` : extraits bornés des dernières 24 heures. Le titre, les métadonnées et l’extrait déjà fourni par le contrat (1 000 caractères maximum) sont conservés uniquement en mémoire d’affichage. Le journal fait défiler cet extrait lorsqu’il est long ; aucun téléchargement du corps complet, stockage permanent ni appel IA supplémentaire.
- `/v1/home/device/read` : observation ponctuelle de l’unique lampe autorisée par le connecteur actuel. Un état `OFF` signifie zéro sur cette seule lampe ; il ne permet pas d’affirmer que la maison entière est sécurisée ni de connaître sa température.

Finance, indicateurs CARE, température domestique, sécurité globale, trafic et vols n’ont pas de source agrégée fiable dans ce raccord : ils restent des emplacements et des liens vers leurs environnements, sans chiffres fabriqués.

## Cycle de vie

Les requêtes utilisent le transport de session existant et son annulation par workspace. Les lectures sont annulées au démontage, au verrouillage et lorsque l’onglet devient masqué. Les données privées sont alors retirées de la mémoire de l’écran. Aucun polling de fournisseur n’est mis en place ; au retour visible, les lectures internes reprennent ainsi que la météo publique (cache valide prioritaire). Les connexions privées Mail, Calendar et Home Assistant restent en relecture manuelle.

Les consommateurs météo simultanés pour une même ville partagent la requête ; quitter un écran n’annule pas celle d’un autre écran encore visible. Le transport est annulé quand le dernier consommateur part. Un changement de workspace invalide les requêtes en cours, et une réponse tardive annulée ne réécrit pas le cache. Un service désactivé ou un statut invalide interdit le POST météo. Une panne produit un état indisponible visible, sans temporisateur de retry. Le bouton Actualiser du module Météo reste facultatif et force une nouvelle lecture ; le rafraîchissement du Hub privilégie le cache valide. Seule la ville publique prédéfinie est transmise à Open-Meteo via le serveur, dont le fournisseur voit l’IP sortante.

Les sections distinguent chargement, résultat réel, résultat vide et lecture indisponible. Une observation Home expire après une minute ; la météo suit l’expiration du bulletin. L’expiration efface les valeurs sans relancer de requête réseau.

L’agenda du jour, même vide, expire à minuit dans le fuseau du workspace fourni par IDA. Le calcul respecte les journées de 23 ou 25 heures aux changements d’heure. L’écran invite ensuite à relire les connexions ; il ne laisse pas les rendez-vous d’hier sous le titre « Aujourd’hui » et ne déclenche aucun appel externe à minuit.

Le mode de masquage du tableau emploie `redactedHubData()` : les valeurs, métadonnées et compteurs ne sont pas rendus dans le DOM du Hub. Ce mode est une aide à la présentation sur grand écran, pas un verrouillage de session ni un contrôle de confidentialité des autres pages ou de la barre de discussion. La projection réelle reste dans la mémoire du hook jusqu’à son cycle normal d’effacement.

## Validation

`hub-data.test.ts` couvre la projection de l’agenda et des événements nocturnes, le rejet des données non conformes, les états inconnus, les expirations, la conservation d’un zéro réellement observé et l’absence de valeurs personnelles inventées. Les tests utilisent uniquement des données synthétiques locales ; ils ne vérifient pas la disponibilité effective des comptes de l’utilisateur.

`weather-loader.test.ts` vérifie le cache partagé, la déduplication, l’activation serveur, le corps strict `{ cityId }`, le rafraîchissement volontaire, l’annulation par consommateur et workspace, le rejet des bulletins périmés/non conformes et l’absence de retry automatique. Aucun appel fournisseur réel n’est effectué par ces tests.
