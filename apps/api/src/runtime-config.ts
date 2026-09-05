import type { LocalAuthMode } from "./local-auth.js";

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function resolveIdentityMode(value: string | undefined): LocalAuthMode {
  const mode = value ?? "LOCAL_DEMO";

  if (mode !== "LOCAL_DEMO" && mode !== "LOCAL_LOCK") {
    throw new Error("IDA_IDENTITY_MODE doit être LOCAL_DEMO ou LOCAL_LOCK.");
  }

  return mode;
}

export function assertLocalOnlyHost(host: string): void {
  if (!loopbackHosts.has(host.toLocaleLowerCase("en-US"))) {
    throw new Error("Ce runtime IDA local refuse toute écoute hors boucle locale.");
  }
}
