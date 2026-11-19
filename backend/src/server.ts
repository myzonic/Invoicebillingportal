import { createApp } from "./app";
import { env } from "./config/env";
import { startRatesScheduler } from "./services/rates";
import { startQuoteCleanup } from "./services/paymentQuote";

const app = createApp();
startRatesScheduler();
startQuoteCleanup();

app.listen(env.port, () => {
  console.log(`[billing-portal] API listening on http://localhost:${env.port}`);
  console.log(`[billing-portal] environment: ${env.square.environment}`);
});
