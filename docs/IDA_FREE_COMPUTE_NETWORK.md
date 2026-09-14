# IDA — Free Compute Federation

Tranche du 14 septembre 2026. État : **contrats, gouverneur gratuit, registre partagé et tableau de bord implémentés ; activation des fournisseurs cloud PREPARED / NEEDS_REVIEW**. Aucun compte, clé, service payant, modèle local, moteur tiers ou accès réseau ajouté. Tailscale et pairing iPhone restent en pause.

## Ce qui fonctionne maintenant

System affiche **Intelligence Network** : actualisation manuelle, filtres état/emplacement, fiches de présélection, modèles du registre effectivement composé, allocation IDA distincte des quotas fournisseur, dates, coûts, erreurs normalisées et matrice des tâches. L'absence d'observation reste UNKNOWN ; aucune donnée de démonstration ne remplace une API indisponible. La lecture ne lance aucune inférence ni sonde réseau.

`GET /v1/intelligence/network` utilise l'identité, le workspace courant, READ, le Tool Gateway et une revalidation de session. Réponse `{ data: IntelligenceNetwork }`, schéma strict `packages/contracts/src/intelligence-network.ts`, `Cache-Control: no-store`. Aucun identifiant privé, prompt, contenu métier, endpoint configurable ou secret. C'est un état technique de la composition serveur partagée, pas la preuve d'une autorisation d'egress pour l'utilisateur. Aucun POST d'activation, de quota ou de paiement n'existe.

Le registre retourné par la composition du dialogue local est celui inspecté par l'API. Les fiches cloud ne sont **pas** des adapters factices inscrits à ce registre. La localité LOCAL ne signifie ni modèle installé ni service toujours disponible. Le dialogue existant réserve une allocation éphémère par requête ; ce compteur n'est pas une mesure de débit matériel.

## Sélection et coût

Un seul `ProviderRouter` : identité et politique relues avant tentative/fallback/livraison → classes acceptées et consentements → modèles explicitement autorisés → capacités, complexité et enveloppe → santé/allocation → coût connu nul → quota cloud observé → classement local/préférence/complexité/latence.

Dans cette tranche, les modèles payants sont **refusés**, même si un ancien budget positif est présent. Une future autorisation premium nécessitera un contrat de dépense explicite distinct ; elle n'est pas implémentée ici. Aucun achat, carte, crédit, top-up ou passage FREE→PAID. Une estimation nulle n'autorise pas un fournisseur cloud sans preuve de quota et d'arrêt sans dépassement payant. Les coûts locaux d'électricité/matériel ne sont pas des coûts API.

## Quota Manager réutilisé par le registre

`ProviderRegistry.observeFreeQuota()` est une autorité interne serveur, sans endpoint client. Il exige modèles exacts, observation datée et bornée, `noPaidOverage: true`, fenêtres uniques et compteurs valides. Le futur adaptateur devra établir ces valeurs à partir de sources de compte officielles et d'une revue du mode de facturation ; une page tarifaire ne constitue pas cette preuve.

Fenêtres implémentées : requêtes/minute/jour/mois et tokens/minute/jour/mois. Chaque fenêtre doit permettre la tentative. Une allocation commune conservatrice peut couvrir plusieurs modèles : elle n'est jamais multipliée par agent, façade ou clé. La réservation synchrone consomme simultanément l'allocation IDA et les fenêtres gratuites, y compris en cas d'échec. Les tokens sont réservés pessimiste­ment par octets UTF-8 + sortie maximale + marge de 512 ; ce n'est pas un tokenizer universel certifié. Un futur adapter doit qualifier la marge réelle, son propre framing et l'ensemble des quotas applicables avant activation.

Après expiration, passage de reset ou redémarrage : **UNKNOWN**, pas recharge automatique. Les compteurs mémoire ne prétendent pas être un solde persistant du fournisseur. Après 429 : quota mis en retrait ; après panne/réponse malformée/erreur : modèle indisponible jusqu'à requalification serveur. L'historique de succès n'est pas une preuve de santé courante. Les erreurs conservées sont des codes allowlistés, jamais les messages/corps externes. Les événements ATTEMPT/SUCCEEDED/échec continuent d'utiliser l'audit existant.

Les crédits monétaires, neurones Cloudflare, limites à la seconde et politiques de réservoirs glissants restent **PREPARED**. Aucun de ces comptes ne peut être activé en convertissant arbitrairement dollars/neurones en appels ou en omettant une contrainte. Une seule instance autoritaire en mémoire : un déploiement multiprocessus nécessiterait persistance et réservation transactionnelle communes avant activation.

## Confidentialité et capacités

PUBLIC/INTERNAL restent soumis aux consentements cloud, même à coût nul. Les noms existants PRIVATE_CREATIVE et SENSITIVE_PERSONAL sont conservés pour compatibilité. PERSONAL/SENSITIVE/HIGHLY_SENSITIVE sont ajoutés sans remplacer les classifications métier. Chaque manifeste doit explicitement accepter chaque classe ; aucune conversion vers une classe moins sensible. HIGHLY_SENSITIVE est refusé au cloud ; SECRET est refusé à tout modèle. Le Context Broker et la validation métier restent les autorités : l'UI ne choisit jamais la classe d'une demande.

Le port d'inférence demeure **textuel**. TEXT/REASONING/CODE/STRUCTURED_OUTPUT/TOOL_CALLING/LONG_CONTEXT sont des exigences de sélection, pas des permissions d'exécution. Les propositions restent validées par le contrat métier. Les payloads vision, audio, embeddings et médias sont PREPARED, pas acceptés comme simples prompts. Recherche web et actions agentiques nécessitent toujours leurs outils autorisés ; aucun outil externe ajouté ici.

## Audit officiel et distinctions de produit

Les vérifications datées, quotas publiés, inconnues, modèles candidats, authentification, CB, expiration, entraînement, conditions commerciales et sources se trouvent dans :

- [Gemini, Mistral API et Vibe](free-compute-audit-europe.md).
- [Qwen/Alibaba, QwenCloud, Z.ai et ModelScope](free-compute-audit-china.md).
- [Groq, Cerebras, OpenRouter, Cloudflare et Hugging Face](free-compute-audit-platforms.md).

Ces audits sont documentaires, sans lecture de compte. WEB FREE, API FREE selon quota, essai temporaire, Coding Plan et poids locaux ne sont jamais interchangeables. Les restrictions régionales, licences et droit d'intégration restent à qualifier ; cet audit ne constitue pas une validation juridique.

Cas OpenAI : la [fiche officielle GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), ouverte le 14/09/2026, indique l'absence de support du palier API Free. IDA le montre premium bloqué, sans déduire un accès API gratuit de l'abonnement Codex. Le skill OpenAI Docs a guidé cette vérification et le refus d'assimiler accès produit et autorisation de dépense.

## Activation future : étapes bloquantes explicites

1. Revue du service, modèle/version, juridiction, droits d'intégration et confidentialité ; aucune installation Vibe automatique.
2. Autorisation du propriétaire pour un compte précis ; clé côté serveur dans le coffre, jamais dans le navigateur/modèle.
3. Preuve du quota effectif et de l'arrêt sans facturation ; quotas de toutes dimensions pris en charge.
4. Adapter officiel à endpoint fixe avec timeout, réponses validées et erreurs normalisées ; pas de scraping, rotation de comptes, CAPTCHA ou accès web consommateur automatisé.
5. Egress, consentements, contexte minimal, tests synthétiques puis essai réel explicitement autorisé. Aucun test réel exécuté dans cette tranche.

La stratégie de fallback ne peut choisir qu'un autre fournisseur déjà admissible et compatible. Aucun résultat de refus/validation/timeout ambigu ne déclenche un retry automatique. Si aucun candidat n'existe, `NO_COMPATIBLE_MODEL` ; jamais un faux succès.

## Vérification / retour arrière

Tests ciblés domaine/API : coût inconnu/payant, quotas atomiques, reset, exhaustion, token envelope, modèle incompatible, secret, consentement/identité révoqués, panne, réponse malformée, timeout, audit et route en lecture seule. Le test existant d'alignement de la roue distingue désormais La Fabrique documentaire des profils de cerveau ; aucun cerveau ajouté pour satisfaire le test.

Résultat de cette tranche : 203 tests ciblés passés, types API/Web/contrats/domaine vérifiés et lint des nouveaux composants/contrats/routeur passé. Aperçu navigateur documentaire isolé : filtres appliqués puis effacés, disposition étroite vérifiée à 480 pixels CSS. Ce n'est pas un essai réel sur iPhone ni un test d'inférence cloud.

Aucune migration de données pour cette tranche. Retour arrière : retirer la section UI et la route de métadonnées ; conserver les blocages free-only ou désactiver les modèles. Ne pas restaurer automatiquement une ancienne politique permettant les appels payants. Aucun fournisseur externe n'a besoin d'être déconnecté puisqu'aucun n'a été activé.
