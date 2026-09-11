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

/** A second local entry point is not authorization to expose LOCAL_LOCK online. */
export function resolveLocalWebOrigin(value: string): string {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("Origine web locale invalide.");
  }
  if (
    origin.origin !== value ||
    origin.protocol !== "http:" ||
    origin.username ||
    origin.password ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  )
    throw new Error("Le frontend compilé reste limité à une origine HTTP loopback exacte.");
  return origin.origin;
}
