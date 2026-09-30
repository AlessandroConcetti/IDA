# Checkpoint Music B.11 — relances datées partagées

30 septembre 2026. **50 %** du prompt Music : 850/1700, après 825/1700 (49 %).
Seul le critère 11 passe de 25 à 50. Les autres critères restent inchangés.

## Livré et limites

Music Studio → Labels & dates → contact → **Relances datées**. Créer une tâche
avec échéance/fuseau, la retrouver dans Workspace → **Relances Music** ou
**Tâches**, confirmer son achèvement et revenir au contact. Une seule tâche,
états et dates communs, persistance, erreurs/retry et absence de doublon.
La longue prochaine action garde un titre de 240 caractères maximum et son
intégralité dans les détails modifiables. Réutilisation des moteurs Contacts et
Tasks. Route commune d'achèvement renforcée par revalidation des droits avant
et après mutation. Contrat : `docs/MUSIC_FOLLOWUPS.md` ; OpenAPI dédié.

Pas de notification programmée, report d'échéance, calendrier Google,
approbation de mail, envoi, changement CRM automatique ou historique CRM complet.
La clôture d'une tâche est une déclaration humaine, pas une preuve d'envoi.

## Preuves

- **214 tests ciblés / 24 fichiers PASS**, dont 11 API et 4 UI/date/navigation nouveaux.
- **3 tests existants du Task Center PASS** ; les 71 autres du fichier n'étaient
  pas sélectionnés dans cette commande ciblée.
- **16 recettes navigateur Edge PASS**, huit parcours Music en Classic/Sci-Fi.
  Création, réponse perdue/retry, même tâche dans Workspace, achèvement depuis
  Tasks, retour au contact, achèvement Music en erreur puis réussi, lecture
  503/réessai, état sans anciennes lignes trompeuses, 390 px et réouverture.
- API : vraie fermeture/réouverture base sur disque et `createApp`, isolation,
  grants cumulés, VIEW_ONLY, concurrence, idempotence, révision obsolète,
  Unicode/NUL/taille, pagination, rollback après insertion ou révocation finale,
  y compris à l'achèvement. Dates UTC, gap/overlap DST Paris testés.
- Builds Contracts/API/Web, typechecks API/Web et Biome des huit nouveaux
  fichiers source/test : PASS. YAML OpenAPI et références internes validés.
- Revue indépendante : pas de P1/P2 relevé ; préremplissage long corrigé.
- Captures : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-WxmtW8` ;
  suite des 16 : `C:/Users/Aless/AppData/Local/Temp/ida-mcp-browser-results-2kOo6U`.
  Classic bureau et Sci-Fi mobile inspectés ; aucun débordement relevé.

Tests isolés sur 8791, données synthétiques et réseau externe bloqué.
**Runtime personnel non redémarré** : aucune recette de déploiement sur la base
personnelle revendiquée. Aucun contact réel ou fichier musical modifié.
Pas de nouvelle activité de fond, polling, scan, capteur ou provider. Requêtes
annulées au démontage. Chunk partagé différé ~9,8 Ko ; warning bundle principal
~988 Ko préexistant. Performance CPU/GPU/RAM globale non requalifiée.

## Reprise B.12

Historique de suivi contact lisible dans Music à partir des événements réels
persistés, sans texte privé dans les audits. Puis revue/approbation du message
exact, sans livraison implicite via Gmail. Priorité aux deux projets et à
Marseille/alentours, puis Avignon/Montpellier/Lyon ; prestations privées comprises.

## Restauration

Avant : `tmp/source-checkpoints/2026-09-30T18-55-11-106Z-source`, 950 fichiers,
9 165 309 octets, HEAD `c225280`, empreintes vérifiées à la copie.
Checkpoint avant B.12 : `tmp/source-checkpoints/2026-09-30T21-18-23-815Z-source`,
961 fichiers, 9 251 255 octets. Empreintes vérifiées à la copie. Le sélecteur de
test de confirmation a ensuite été précisé pour distinguer le chargement du
message de succès ; les deux recettes complètes passent à nouveau, y compris
le préremplissage long. Code fonctionnel inchangé après ce snapshot.

Sources/tests/docs/config uniquement, sans média, base utilisateur, coffre,
secret ou node_modules. Vérifier le manifeste puis restaurer dans un **nouveau
checkout**, jamais sur les travaux en cours. Le commit isole les nouveaux
fichiers de B.11 et sa documentation ; les raccords aux gros fichiers mixtes
sont conservés dans le snapshot complet, pas dans ce commit partiel.
