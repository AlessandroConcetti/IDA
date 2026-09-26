# Le Hub — ambiance visuelle

Le composant `apps/web/src/HubAtmosphere.tsx` présente les deux fonds propres
`/design/hub-20260926/hub-classic.png` et `hub-scifi.png`. Classic utilise le
palais méditerranéen ; les autres thèmes utilisent la scène orbitale. Les
fichiers médias restent locaux et ne sont pas destinés au commit Git.

Les fonds propres ont été dérivés avec ImageGen des deux maquettes fournies
par l'utilisateur (`LE HUB THEME CLASSIC.png`, `LE HUB THEME SCIFI.png`).
Direction de transformation : retirer panneaux, texte, boutons, navigation,
orbe et anneaux ; conserver perspective, architecture et éclairages ;
reconstituer les zones masquées du palais maritime ou de l'observatoire.
Ce sont des décors reconstruits, pas les maquettes originales recouvertes de
boutons. Ils ne contiennent aucune donnée métier.

## Composition et mouvement

- La photographie conserve sa géométrie et reste toujours disponible sans canvas.
- Les points lumineux et les reflets au sol respirent indépendamment, en ambre.
- Classic : éclats et petites rides lumineuses limités aux deux zones de mer
  visibles, sous la ligne de côte. Halo solaire aligné sur le disque existant.
- Sci-Fi : étoiles à scintillement lent dans le ciel, horizon bleu lumineux,
  météore occasionnel, reflets bleus et poussières légères.
- La variation des halos est accentuée : les sources passent d'une lueur faible
  à un halo nettement visible en cinq à neuf secondes, indépendamment les unes
  des autres. Les étoiles ont un noyau et une couronne lumineuse plus présents.
- Quatre morceaux de feuillage aux bords de chaque décor bougent de quelques
  pixels au rythme d'une brise lente. Ils proviennent de la même image locale,
  découpée par des masques adoucis préparés une seule fois au chargement. Les
  piliers, l'horizon, les meubles et le sol restent fixes. Ce procédé simule une
  brise à partir de la photo ; il ne reconstitue pas des feuilles en 3D.
- Les widgets restent du HTML indépendant de cette décoration. Aucun chiffre,
  état métier, capteur ou service externe n'est créé par cette ambiance.
- L'orbe appartient au composant d'interface ; cette couche n'introduit aucun
  nouveau logo ou deuxième modèle d'orbe.

`HubOrbFilaments` ajoute à l'intérieur de l'orbe IDA commun six courbes SVG
asymétriques, un volume translucide et un reflet. Trois mouvements de rotation
lente donnent un effet de réfraction, sans animation de texte ni d'état métier.
Les halos utilisent un flou SVG limité aux courbes ; ils sont masqués en mode
léger. Les couleurs Classic reprennent les tons nacrés du décor. Le composant
réagit aux attributs de pause/mouvement du Hub et à la réduction du mouvement.
Les identifiants des gradients sont propres à chaque instance React.

L'eau est une animation procédurale de reflets superposée à une image fixe :
ce n'est ni une vidéo de vagues réelles, ni une simulation hydrodynamique. Les
bâtiments, les bateaux et les reliefs ne sont pas déformés.

## Ressources et accessibilité

### Pictogrammes et fenêtres vivantes

`HubAnimatedIcon` anime treize pictogrammes SVG : enveloppe et lettre, barres
Finance, liens Agents, cœur, note, météo décorative, maison, horloge, grille,
calendrier, ampoule, globe et document. Chaque cycle comprend une longue pause,
et les phases sont décalées pour éviter un écran de mouvements synchronisés.
Ces formes n'indiquent ni transactions, ni battements mesurés, ni travail réel
des agents. L'icône du bulletin réel conserve le pictogramme de sa condition.

`HubWidgetAtmosphere` ajoute neuf décors indépendants derrière le contenu :
repère lumineux d'agenda, chaleur domestique, papier numérique du courrier,
lignes de registre financier, aurore CARE, sillons Music, constellation Agents,
archives d'activité et conditions météo. Les contenus et zones cliquables ne
bougent pas. Les lumières et tracés ne simulent aucun état métier.

Le widget météo choisit soleil, nuages, pluie, neige, brume ou orage uniquement
à partir du code WMO du bulletin reçu. Un code absent/invalide produit un décor
neutre, sans pluie ni soleil inventés. Pas d'éclairs stroboscopiques.

`HubMessageJournal` présente trois messages réellement reçus. Le premier peut
afficher son extrait borné fourni par l'API existante ; son titre et ses
métadonnées restent fixes. L'extrait trop long glisse après 7,2 secondes de repos,
revient doucement, puis attend le prochain cycle (24 secondes). Aucun défilement
pour un texte qui tient dans sa fenêtre. Les résumés d'activité longs utilisent
la même lecture lente. Survol et focus arrêtent le texte. Le mode statique conserve
une zone de lecture scrollable : un long extrait ne rend pas les messages suivants
inaccessibles. Aucun faux mail, résumé IA inventé ou requête pour télécharger un
corps de mail supplémentaire.

Les décors des fenêtres sont masqués en mode LOW/OFF, mouvement/transparence
réduits ou contraste renforcé. Les textes mobiles restent statiques. La pause du
Hub, le menu ouvert et une page cachée suspendent les animations ; les titres,
boutons, informations et permissions restent inchangés.

Le composant réutilise `useEnvironmentMotion` : le réglage commun IDA, la
visibilité de la page, la présence dans le viewport, le mode tactile et les
préférences système décident du niveau d'animation. Le prop `paused` permet
à l'écran de suspendre les effets pendant une interaction.

- 30 images par seconde au maximum ; 18 en mode léger/mobile.
- Deux canvas superposés (feuilles et lumière), chacun plafonné à 1 600 pixels
  de large, 1,6 million de pixels et DPR 1,25 ; quatre petits masques temporaires
  préparés à partir du même fond, sans nouvelle requête réseau.
- Arrêt de `requestAnimationFrame` quand la scène est masquée ou arrêtée ;
  nettoyage du RAF et du `ResizeObserver` au démontage.
- Une pause conserve la dernière image ; la reprise continue au même instant
  d'animation. Le feuillage partage la même horloge et les mêmes arrêts que les
  éclairages.
- `prefers-reduced-motion`, transparence réduite, contraste renforcé et motion
  OFF désactivent les effets. Les couleurs forcées masquent aussi la photo.
- Le canvas et l'image sont décoratifs (`aria-hidden`), non interactifs, et
  n'interceptent aucun clic. Aucun micro, caméra, audio ou requête cloud.
- Les points lumineux sont déterministes : pas de hasard au montage React.

Le rendu canvas reprend le cadrage `object-fit: cover` de l'image et son ratio
natif après chargement. Les masques de lumière suivent donc le décor sur PC,
mobile et téléviseur, sans déplacer les interfaces.

## Vérification

Vérifications attendues pour cette couche : types TypeScript et lint des deux
fichiers, puis contrôle visuel dans Le Hub Classic et Sci-Fi, pause/reprise,
réduction du mouvement, mobile et grand écran. Le test visuel de l'écran complet
est réalisé avec l'intégration du Hub ; le seul contrôle statique ne le remplace pas.
