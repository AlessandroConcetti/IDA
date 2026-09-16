# ElevenLabs — préparation du connecteur vocal

État vérifié le 17 septembre 2026 : **credential stocké / TTS non activé**.

ElevenLabs est un fournisseur de synthèse vocale, pas un modèle LLM. Son credential
reste donc séparé du `ProviderRegistry` texte (Ollama, Mistral, Gemini, etc.). Le
script de coffre accepte `elevenlabs` et écrit uniquement le fichier DPAPI du
workspace courant :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\set-intelligence-secret.ps1" -Provider elevenlabs -WorkspaceId wsp_demo_aless
```

La clé est saisie masquée dans le terminal Windows et n'est jamais passée en
argument, variable d'environnement, log, frontend ou conversation. `Bypass` ne
s'applique qu'à cette exécution du processus PowerShell ; la stratégie globale
n'est pas modifiée. Le fichier attendu est
`.data/connector-secrets/wsp_demo_aless.elevenlabs.dpapi`.

La présence de ce fichier a été vérifiée sans déchiffrement : fichier régulier,
sans lien symbolique, 652 octets. Sa valeur n'a pas été lue ni affichée.

Cette étape ne contacte pas ElevenLabs et ne prouve pas que la clé est valide.
Le connecteur TTS reste à implémenter derrière un contrat dédié (texte borné,
voix explicite, sortie audio privée, quota et consentement). La lecture locale
du navigateur reste le repli actuel ; aucune voix distante n'est appelée
automatiquement.

Références fournisseur : [authentification ElevenLabs](https://elevenlabs.io/docs/api-reference/authentication)
et [conversion texte vers parole](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

Ne colle jamais la clé dans le chat. Si le script signale que le coffre n'est
pas déjà privé, arrête-toi : il faut corriger les ACL explicitement avant toute
saisie, sans désactiver les protections.
