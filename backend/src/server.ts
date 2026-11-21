import { createApp } from "./app";
import { env } from "./config/env";
import { startRatesScheduler } from "./services/rates";
import { startQuoteCleanup } from "./services/paymentQuote";
import { backfillUploads } from "./services/uploads";

async function start() {
  // Pull any logos left on disk by older deploys into durable storage so they
  // keep working after the next container replacement.
  await backfillUploads();

  const app = createApp();
  startRatesScheduler();
  startQuoteCleanup();

  app.listen(env.port, () => {
    console.log(`[billing-portal] API listening on http://localhost:${env.port}`);
    console.log(`[billing-portal] environment: ${env.square.environment}`);
  });
}

void start();
