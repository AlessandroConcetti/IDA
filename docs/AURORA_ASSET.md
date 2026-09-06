# Aurora — ressource graphique locale

## Livraison

- Usage : décor architectural de l’accueil et du verrou, sous les vrais composants HTML. Aucun texte, carte ou contrôle n’est intégré à l’image.
- Source : une génération par l’outil ImageGen intégré, guidée par la référence desktop fournie par l’utilisateur. Mode création d’un décor autonome avec référence visuelle, pas modification de la capture originale.
- Fichier livré : `apps/web/public/design/aurora-atrium.png`, PNG 1536 × 1024, 1 677 136 octets.
- Sortie originale : `C:/Users/Aless/.codex/generated_images/01a0723d-bf9c-78d1-8490-26a284ab4b48/exec-98ef7f36-e700-457b-aed5-2cbc819b82f9.png`.
- Le fichier public est une copie non transformée. Aucun CDN, police distante, script 3D ou appel IA n’est utilisé au chargement d’IDA.
- Conformément à `AGENTS.md`, le PNG n’est pas committé. Il est présent dans ce workspace et copié par Vite lors du build ; pour une autre installation, fournir ce décor local au même chemin, séparément du dépôt. Les captures originales de l’utilisateur ne sont pas distribuées.
- En cas d’image absente, le fond ivoire CSS et toutes les fonctions restent utilisables ; la fidélité architecturale nécessite le PNG. Une optimisation mesurée de poids pourra suivre avant distribution mobile réelle.

## Prompt exact

```text
Use case: photorealistic-natural
Asset type: full-page background bitmap for an existing premium personal assistant web interface
Primary request: Generate a new standalone architectural environment inspired by the provided reference image: an ultra-premium luminous ivory modern atrium lounge, serene and gently futuristic, never spaceship-like or cyberpunk.
Input images: Image 1 is a style, atmosphere, and broad composition reference only; do not reproduce or include any of its interface, typography, logos, cards, icons, buttons, or overlays.
Scene/backdrop: An enormous sweeping circular white ceiling with a broad sculptural arch across the upper frame and soft warm concealed cove lighting; floor-to-ceiling glass curtain walls opening to a pale blue ocean horizon and airy sky; expansive subtle reflective cream stone floor. Include only a restrained small white sofa grouping and a delicate olive tree at the far left, echoing the spatial balance of the reference. Keep architecture elegant, minimal, plausible, and uncluttered.
Style/medium: Photorealistic high-end architectural visualization, sophisticated editorial realism, refined luxury hospitality interior, natural material detail, soft atmospheric depth.
Composition/framing: Landscape 3:2 composition, centered and symmetrical enough for a web page overlay, with abundant low-contrast negative space throughout the center and lower-middle; preserve the dramatic broad arch at top and a spacious uninterrupted floor plane. Architectural features should frame rather than compete with overlaid content.
Lighting/mood: Bright diffuse daylight blended with warm ivory cove light, tranquil, optimistic, ethereal but believable; no harsh contrast.
Color palette: Luminous ivory, pearl white, warm sand, cream, and very subtle ice blue from ocean and sky.
Materials/textures: Smooth white plaster, lightly veined cream stone, low-glare glass, gentle realistic reflections, understated premium upholstery.
Text (verbatim): none.
Constraints: The bitmap must contain environment only. No text, no UI, no logo, no cards, no panels, no icons, no interface chrome. No people. No watermarks. Keep the center visually quiet and readable beneath real HTML UI.
Avoid: neon colors, stars, outer-space imagery, spacecraft aesthetics, cyberpunk, dark areas, busy furniture, excessive plants, decorative clutter, dramatic lens effects, illegible pseudo-text, signage, branding.
```
