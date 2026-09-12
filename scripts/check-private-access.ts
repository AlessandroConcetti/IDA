import { fileURLToPath } from "node:url";
import { demoContext } from "../apps/api/src/demo-context.js";
import {
  assessPrivateAccessReadiness,
  inspectPrivateAccessReadiness,
} from "../apps/api/src/private-access-readiness.js";

// Operator CLI for this local project's fixed workspace; no command-line overrides.
// It never prints paths, identities, provider addresses, configuration contents or secrets.
try {
  const report = await inspectPrivateAccessReadiness(
    fileURLToPath(new URL("../.data", import.meta.url)),
    demoContext.workspaceId,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch {
  process.stdout.write(
    `${JSON.stringify(
      assessPrivateAccessReadiness({
        tailscale: "UNKNOWN",
        configuration: "UNKNOWN",
        credential: "NOT_CHECKED",
      }),
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
