/**
 * Contexte local temporaire de la première tranche Phase 1.
 *
 * L'authentification réelle n'est pas encore livrée. Ces valeurs ne viennent
 * donc jamais d'un header, d'une query string ou du body d'une requête : elles
 * simulent une session propriétaire unique pour permettre d'exercer les
 * contrôles de périmètre dès le départ.
 */
export const demoContext = Object.freeze({
  userId: "usr_demo_aless",
  workspaceId: "wsp_demo_aless",
  membershipRole: "OWNER" as const,
  mode: "LOCAL_DEMO" as const,
});

export const demoWorkspace = Object.freeze({
  id: demoContext.workspaceId,
  name: "Aless — IDA",
  timezone: "Europe/Paris",
  locale: "fr-FR",
});

// Identité technique locale uniquement. Ce sélecteur est fixé côté serveur :
// aucun header, cookie ou paramètre client ne peut choisir cette session.
// Sa longue échéance évite de simuler un flux de renouvellement qui n'existe
// pas encore ; les vraies sessions resteront courtes et rotatives.
export const demoIdentity = Object.freeze({
  clientInstanceId: "cli_demo_windows_web",
  sessionId: "ses_demo_windows_web",
  displayName: "IDA Web local — Windows",
  kind: "WEB_BROWSER" as const,
  platform: "WINDOWS" as const,
  accessLevel: "TRUSTED" as const,
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2099-12-31T23:59:59.999Z",
});
