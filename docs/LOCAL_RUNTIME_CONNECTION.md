# IDA — Reconnexion du dialogue local

Tranche du 14 septembre 2026. **Dialogue textuel local activé ; une réponse réelle vérifiée sur une session synthétique isolée.** Aucun fournisseur cloud activé, aucune nouvelle dépendance ou installation, aucun changement Tailscale/pare-feu. Le pairing iPhone reste en pause et non validé depuis l’extérieur.

## État effectivement constaté

- Au début, IDA écoutait sur `127.0.0.1:8787`, mais Ollama était arrêté ; les flags de dialogue étaient absents du dernier lancement.
- Sauvegarde fermée de la base existante : 1 176 fichiers, archive chiffrée DPAPI CurrentUser, intégrité vérifiée. Pas de changement de phrase de passe, seed ou migration pour cette tranche.
- Le nouveau lanceur a d’abord échoué sur `ERR_UNSUPPORTED_ESM_URL_SCHEME` : `--import C:\...` n’est pas une URL ESM valide. Correction en `file:///...`, couverte par une régression PowerShell sur un chemin contenant des espaces. Le rollback a arrêté ses propres processus ; aucun faux succès annoncé.
- Relance réussie : IDA en `LOCAL_LOCK` sur `127.0.0.1:8787`, Ollama **0.33.3** sur `127.0.0.1:11434`. PID et interface des sockets contrôlés. Journal du daemon confirmant cloud désactivé. Cette configuration n’est pas une isolation OS d’egress certifiée.
- Exécutable Ollama existant : signature `Valid`, organisation `Ollama Inc.`, SHA-256 épinglé dans le lanceur. Aucun téléchargement, `pull`, nouvelle version ou mise à jour automatique.
- Modèle existant `qwen3:4b-instruct-2507-q4_K_M`, digest exact conservé depuis `evaluation/local-model-pin.ts`. Aucun modèle découvert n’est automatiquement approuvé.
- Page réelle `http://127.0.0.1:8787/` ouverte dans le navigateur : écran de déverrouillage IDA affiché. **La session personnelle n’a pas été ouverte par l’agent** ; le parcours de dialogue dans cette session et l’iPhone ne sont pas revendiqués comme validés.

## Utilisation dans IDA

Après déverrouillage : **System → Réseau d’intelligence → Ouvrir le dialogue local**. L’ouverture vérifie seulement l’inventaire ; cliquer sur **Envoyer** lance le calcul. Fermer le dialogue ou utiliser **Arrêter** annule la demande cliente. Les autres emplacements du composant `LocalDialogue` réutilisent le même parcours.

Les statuts sont distincts : désactivé, occupé, modèle absent/empreinte différente, moteur indisponible, prêt. Le client valide localité, modèle et caractère expérimental avant d’accepter un statut ou une réponse. Pas de succès de remplacement en cas d’erreur, ni sortie HTML exécutée.

Le tableau du registre conserve ses données réelles : l’allocation éphémère locale est affichée **non ouverte** ou **consommée**, pas présentée comme un crédit cloud ou une preuve de panne du moteur. La vérification réelle se fait dans le dialogue. Aucun quota permanent inventé, changement de permission ou activation d’agent métier.

Limites conservées : une demande simultanée, 30 tentatives/heure/processus, 3 000 caractères, 512 tokens de sortie, délai serveur 110 s. Seulement le texte saisi et le cadrage serveur ; ni fichiers, données Care, mémoire automatique, secrets, outils ou actions. Qualité expérimentale : le précédent échec de qualification musicale reste valable. Ce contrôle de connexion ne qualifie ni la santé, ni la création logicielle, ni les recommandations métier.

## Lanceur reproductible, manuel et réversible

`scripts/start-local-ida.ps1` nécessite PowerShell 7.4+. Il ne démarre rien au boot Windows et n’installe aucune tâche/service. Il refuse les ports occupés et n’arrête/adopte jamais un daemon existant dont il ne connaît pas les paramètres. `-CheckOnly` vérifie fichiers, provenance et ports **sans démarrage** ; ce mode ne prouve pas la présence du modèle.

Depuis le dépôt, après arrêt contrôlé de l’ancienne API et sauvegarde de sa base fermée :

```powershell
& ./scripts/start-local-ida.ps1 -EnableLocalDialogue `
  -NodeExecutable 'C:/Users/Aless/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' `
  -OllamaExecutable 'C:/Users/Aless/AppData/Local/Programs/Ollama/ollama.exe' `
  -PrivateBrowserOrigin 'https://zaratustraama.taild50a0e.ts.net'
```

Le paramètre d’origine conserve l’origine HTTPS privée précédemment configurée dans IDA ; il ne crée/active ni proxy, DNS, certificat, tunnel ni port externe et ne démontre pas leur fonctionnement. Ne pas l’omettre lors d’une reprise de cette installation. Les variables d’activation et `OLLAMA_NO_CLOUD=1` sont transmises aux enfants, pas écrites dans les variables Windows globales. Le daemon reçoit explicitement son bind loopback et une seule inférence parallèle.

Lanceur : exige les données et le build existants ; contrôle signature/hash, version, inventaire et digest avant API ; conserve `LOCAL_LOCK`, vérifie le verrou initialisé ; sorties sans credential, journaux sous `tmp/local-runtime-*`. En cas d’échec, arrête ses seuls processus dans l’ordre API puis moteur, avec erreurs de nettoyage signalées. Aucun fichier ni donnée supprimé.

Retour arrière : arrêter les seuls PID identifiés par cette exécution après vérification de leur identité ; sauvegarder l’API arrêtée ; relancer sans `-EnableLocalDialogue` en conservant l’origine privée et les mêmes données. Aucun reset du verrou, restauration ou suppression automatique. Après extinction du PC, ces processus doivent être relancés manuellement ; un autostart supervisé reste à traiter séparément.

## Preuve d’inférence et tests

`apps/api/src/evaluation/run-local-dialogue.ts` : opt-in exact `--run-synthetic-local-dialogue` et attestation `OLLAMA_NO_CLOUD=1`. L’import et les tests ordinaires ne lancent aucune inférence. Base `memory://`, `createApp` réel sans `listen`, phrase et session aléatoires jetables ; aucun credential utilisateur, média, base persistante ou configuration Home Assistant.

Une seule requête de génération synthétique. Refus anonyme 401 → initialisation du verrou isolé → statut du modèle → vraie route de réponse → Core/Identity/Tool Gateway/ProviderRouter/adapter/transport → réponse validée → verrouillage → session refusée 401. Le classement conservateur `SENSITIVE_PERSONAL` de la route n’est pas affaibli, bien que la phrase fixe du banc soit publique. Rapport expurgé : jamais prompt, réponse brute, cookie ou phrase de passe.

Essai réel de cette tranche : **14 854 ms**, une requête, réponse marqueur conforme, route authentifiée réussie, refus anonyme et révocation réussis. `browserValidated:false`, `userDataAccessed:false`. Aucune qualification métier ni mesure générale de performance déduite de cet unique cas.

Tests logiciels : **111 tests / 6 fichiers réussis**, couvrant lecture de statut, transport borné et pins, API du réseau, décodage client, régression Windows du lanceur, authentification et audit du banc. Les tests du banc utilisent une inférence simulée ; ils vérifient séparément les événements INFERENCE/ATTEMPT et SUCCEEDED et l’absence de texte/credentials dans l’audit. Ils ne sont pas confondus avec l’essai réel ci-dessus.

Build Web livré ; types API/Web et lint ciblé vérifiés. L’avertissement existant de bundle principal >500 Ko reste présent, sans échec de compilation.
