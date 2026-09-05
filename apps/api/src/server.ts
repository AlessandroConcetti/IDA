import { createApp } from "./app.js";
import { assertLocalOnlyHost, resolveIdentityMode } from "./runtime-config.js";

const port = Number(process.env.IDA_API_PORT ?? process.env.PORT ?? 8787);
const host = process.env.IDA_API_HOST ?? process.env.HOST ?? "127.0.0.1";
const identityMode = resolveIdentityMode(process.env.IDA_IDENTITY_MODE);

assertLocalOnlyHost(host);

const app = await createApp({ identityMode });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
