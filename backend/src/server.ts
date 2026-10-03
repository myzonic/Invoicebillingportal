import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  console.log(`[billing-portal] API listening on http://localhost:${env.port}`);
  console.log(`[billing-portal] environment: ${env.square.environment}`);
});
