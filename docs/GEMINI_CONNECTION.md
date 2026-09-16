# Gemini : authentification vérifiée, Chat cloud encore bloqué par le quota

État au 16 septembre 2026 : la clé Gemini du workspace `wsp_demo_aless` est
présente dans le coffre DPAPI CurrentUser. Un diagnostic réel, sans prompt ni
génération, a obtenu `HTTP 200`, a trouvé `gemini-3.8-flash` et a confirmé
`generateContent` dans les méthodes supportées.

Commande de diagnostic (GET uniquement) :

```powershell
& 'C:/Users/Aless/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --import ./node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/loader.mjs scripts/check-gemini-connection.ts --workspace-id wsp_demo_aless --check-auth
```

La commande lit le secret uniquement via le lecteur DPAPI serveur et ne rend
que l’état, le statut HTTP, l’identifiant du modèle et deux métadonnées de
capacité. Aucun secret, compte, corps d’erreur ou en-tête n’est affiché.

Le Chat Gemini n’est pas annoncé comme actif : le quota gratuit restant et
son expiration n’ont pas été observés côté serveur. Les tarifs ou limites
publiques ne constituent pas une observation de quota et aucune clé Admin,
facturation ou génération de test n’a été ajoutée. Le transport et le routage
restent préparés derrière cette vérification.

Le writer du coffre réutilise une ACL déjà privée. Il n’appelle plus `Set-Acl`
pour chaque fournisseur, car cette opération peut demander
`SeSecurityPrivilege` à un compte Windows standard. Si les ACL existantes ne
sont pas privées pour le compte courant, il s’arrête sans les affaiblir.
