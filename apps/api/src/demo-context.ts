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
