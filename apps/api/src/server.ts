import { createApp } from "./app.js";

const app = await createApp();
const port = Number(process.env.IDA_API_PORT ?? process.env.PORT ?? 8787);
const host = process.env.IDA_API_HOST ?? process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
