# IDA Home — Météo, 10 septembre 2026

## Parcours livré

Roue des mondes → IDA Home → Météo. Une section de Home, pas un nouveau monde, accueil ou Core. Retour à la maison et accès direct au frigo ; navigation vers Agenda, fichiers, Care, projets, Travel et tâches existants.

L'interface reprend la composition de `F:/IDA/FRONTEND VISUELS/INTERFACE METEO.png` : rail sombre, paysage de lac au lever du soleil, température dominante, rangée de mesures, boutons glass, heures, semaine, détails soleil, carte/air et bandeau de villes. Le décor est nettoyé de toutes les commandes ; celles-ci sont de vrais éléments HTML. Fidélité de direction et de composition, pas reproduction pixel à pixel vérifiée. Les fonctions absentes de la maquette (mail/voiture, par exemple) ne reçoivent pas de faux boutons fonctionnels.

Fonctions utilisables :

- Choisir Genève, Marseille, Paris, Lyon, Londres, New York, Tokyo ou Dubaï ; pas de géolocalisation ni adresse personnelle saisie.
- Depuis la demande utilisateur du 26 septembre : le bulletin se charge automatiquement à l’ouverture de l’outil, à l’ouverture du Hub (Marseille) et au changement de ville. Le cache public mémoire partagé avec les lectures vocales est prioritaire ; un bulletin valide évite un nouvel appel. Actualiser reste facultatif. Open-Meteo reçoit uniquement les coordonnées prédéfinies de la ville ; aucune géolocalisation navigateur n’est lue. Le fournisseur voit l’IP sortante du serveur.
- Température, ressenti, humidité, vent et direction, pression, UV maximal ; horodatage et fuseau de la ville.
- Sept jours de prévisions, sélection d'un jour, détail horaire sur l'horizon disponible (48 heures), probabilité de précipitations et chutes de neige prévues.
- Lever/coucher du soleil et durée du jour. La courbe est illustrative, pas un suivi astronomique temps réel.
- Indice européen de qualité de l'air et particules PM2,5/PM10 lorsque le service les renvoie ; l'indice peut dépasser 100.
- Cartes sur Windy, bulletins MétéoSuisse, vigilance Météo-France et indice européen officiel ouverts uniquement par liens explicites, sans iframe distante.
- Pause des reflets et opacité renforcée ; prise en compte des préférences système ; panneaux réorganisés sur petit écran. Choix temporaires, pas de mémoire persistée.
- Dialogue local existant accessible au clic, mais sans transmission automatique de la météo, sans accès live supposé et sans activation de microphone.

Les tirets sont des inconnues, jamais zéro. Les chiffres de 2024 présents sur la référence ne sont pas repris. Les bulletins expirent après dix minutes et leurs mesures sont masquées jusqu’au prochain chargement (réouverture de l’écran ou Actualiser), sans polling à l’expiration. Lors d’un échec d’actualisation, aucun ancien résultat n’est présenté comme actualisé : un cache encore valide conserve son horodatage d’origine. Une panne air n’empêche pas les prévisions météo mais produit un état air indisponible.

## Connexion réelle et réutilisation

Réutilisés : IDA Core, HOME, ToolGateway, Identity/LOCAL_LOCK, revalidation persistée, API transport Web, erreurs contrôlées, fenêtres natives `Sheet`, `LineIcon`, viewport et animations Glass. `ProviderRegistry` IA n'est pas détourné pour la météo.

Créés : contrat météo version 1 et contrat de bord Open-Meteo dans le package contracts, `WeatherAdapter`/`OpenMeteoAdapter`, module HTTP `home-weather`, écran `WeatherEnvironment` et CSS, fonctions de formatage, tests ciblés et décision [ADR 0006](adr/0006-home-weather-read-pilot.md).

`createApp` refuse les lectures externes par défaut. L’entrée locale personnelle `apps/api/src/local-preview.ts` active explicitement la météo, uniquement avec le mode LOCAL_LOCK effectif. Le client vérifie `/v1/home/weather/status` avant une nouvelle lecture : un service désactivé ou un statut non valide interdit l’appel météo. L’ouverture du Hub ou de l’outil demande désormais automatiquement le bulletin public conformément à la demande utilisateur ; ce changement reste une couche cliente, sans modification des droits du Core. Le corps est uniquement `{ cityId }` et l’interface indique le fournisseur et la ville traitée. Mettre `weatherEnabled: false` désactive la connexion sans supprimer la section. Aucune dépendance nouvelle, clé API, modification de pare-feu ou exposition LAN.

Le chargeur `weather-loader.ts` déduplique les demandes en cours pour une même ville et réutilise le cache de `assistant-reads`. L’action Actualiser contourne ce cache valide. Le changement de ville, le démontage et l’onglet masqué annulent le consommateur ; le transport partagé est annulé si aucun consommateur ne reste. Le changement de workspace invalide toutes les lectures en cours. Aucune donnée périmée, d’une autre ville ou reçue après annulation n’est enregistrée. Aucune requête périodique ni boucle de retry n’est ajoutée : une erreur reste visible avec Actualiser disponible. Revenir dans un écran visible peut demander son bulletin s’il n’est plus en cache.

L'outil `read_home_weather` appartient à HOME/READ. Le serveur impose identité/session/instance/workspace, corps strict `{ cityId }`, catalogue fermé, quota de 30 consultations par heure et une lecture à la fois. Il revalide les droits avant la sortie et avant la livraison, y compris pour un cache hit. L'audit préalable doit réussir ; pas de ville, prompt, secret ou réponse externe brute journalisés. Audit par ajout dans `activity_logs` existant ; pas de nouvelle garantie SQL d'immutabilité ni de projection de ces événements dans la timeline publique.

Deux origines HTTPS fixes, aucun redirect/cookie/URL arbitraire ; délai HTTP dix secondes, réponse JSON plafonnée à 128 Kio décompressés par service, schémas et unités validés. Le cache public côté serveur est évincé au plus tard à l'expiration, sans identité dans ses valeurs. Le délai HTTP ne borne pas une panne SQL. Erreurs expurgées, pas de fallback cloud/IA. Contrat HTTP : [home-weather-v1.yaml](openapi/home-weather-v1.yaml).

## Vérification

- Lecture réelle du fournisseur le 10 septembre 2026 : ville publique Genève, bulletin daté `2026-09-10T12:15:00Z`, 48 heures, sept jours, air disponible. Vérification directe de l'adapter ; aucun déverrouillage du compte utilisateur n'a été effectué.
- 21 tests ciblés réussis : mapping, valeurs inconnues, unités, horaires, données périmées, destination/taille/type, consentement, activation, audit, cache/quota, annulation, revalidation et intégration HTTP LOCAL_LOCK dans une base éphémère distincte.
- Types Web/API et production Web vérifiés ; pas de recette navigateur, de comparaison pixel ou d'essai sur un téléphone physique dans cette tranche.

## Reste à connecter

Vigilance officielle structurée, notifications, radar embarqué, géocodage de villes libres, personnalisation persistée et intégration météo dans le contexte IA. Aucun n'est simulé. L'écran fonctionne sur le serveur local, mais l'accès téléphone attend toujours HTTPS et le jalon de sécurité réseau ; ne pas ouvrir ce serveur en 0.0.0.0.

L'usage de l'API gratuite dans cette tranche est personnel et non commercial. Un produit commercial demandera une licence/configuration distincte. Sources officielles consultées le 10 septembre 2026 : [Open-Meteo prévisions](https://open-meteo.com/en/docs), [air et attribution CAMS](https://open-meteo.com/en/docs/air-quality-api), [conditions](https://open-meteo.com/en/terms), [MétéoSuisse](https://www.meteosuisse.admin.ch/), [Météo-France](https://vigilance.meteofrance.fr/fr), [indice européen](https://airindex.eea.europa.eu/AQI/index.html).

## Décor — Imagegen intégré

Mode : outil intégré imagegen, une génération, original préservé. Cette compétence a permis d'extraire et reconstituer le paysage afin que l'interface reste interactive, sans boutons ni texte imprimés dans l'image. Le paysage est une illustration, pas une photographie factuelle de Genève ou une mesure du temps présent.

Image finale : `C:/Users/Aless/Documents/Codex/2026-08-30/project-ida-intelligent-digital-assistant-je/apps/web/public/design/user-20260909/weather-lake-v1.png` (1536 × 1024), média local exclu de Git comme les autres références. Génération d'origine : `C:/Users/Aless/.codex/generated_images/01a08aef-3c4d-7ef0-80ed-5032a68dbdc6/exec-ed1c877e-3913-4d31-bcf3-34aa53132514.png`.

Prompt final complet :

```text
Use case: precise-object-edit.
Asset type: standalone illustrative scenic background for a weather interface; the output itself is only landscape photography, never a UI screenshot or a factual live image of Geneva.
Input images: Image 1 is the edit target, the supplied IDA weather interface screenshot. Extract and extend the alpine lake sunrise landscape visible behind the interface.
Primary request: Create exactly one clean wide 3:2 image, ideally 1536x1024. Remove ALL interface content, including the entire sidebar and header, IDA logo, search bar, avatar, panels, cards, borders, buttons, temperature, weather symbols, all numbers, all lettering, map, and overlays. Seamlessly reconstruct every exposed removed region as coherent natural landscape.
Scene/backdrop: Calm alpine lake beneath layered distant mountain peaks, wooded shoreline and low hills. Preserve the source's visual landscape direction: mountains stretch across the middle distance, a small low sun near the right horizon, warm sunrise reflections toward the right of the lake, darker shaded hills and foreground toward the left and bottom. Extend the lake and natural dark foreground coherently across the lower canvas.
Style/medium: cinematic photorealistic landscape with believable lake ripples, fine mountain texture, subtle atmospheric haze and layered clouds, restrained filmic contrast.
Lighting/mood: quiet early sunrise, dark navy blue lake and foreground hills, blue-gray mountain silhouettes, soft warm peach and muted gold light around the sun on the right.
Constraints: preserve the reference landscape's atmosphere, directional composition, subdued dark color balance and warm right-side sunrise. Landscape fills the complete frame edge to edge; no frames, no collage, no mockup, no device. No UI, no typography, no numbers, no labels, no watermarks, no charts, no icons, no maps. Do not introduce prominent people, buildings, boats or other new focal objects.
```
