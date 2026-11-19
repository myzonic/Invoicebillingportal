/**
 * Focused verification of the USD conversion rules used for Square charges.
 * Run with: npm run verify:currency
 *
 * This exercises the real, pure conversion function — no DB or network needed.
 */
process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/verify";

async function main() {
  const { computeUsdConversion, CURRENCIES } = await import("../src/services/rates");

  let passed = 0;
  let failed = 0;
  const check = (name: string, fn: () => void) => {
    try {
      fn();
      passed++;
      console.log(`  ok  ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
    }
  };
  const eq = (actual: unknown, expected: unknown) => {
    if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
  };
  const throws = (fn: () => void) => {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected an error");
  };

  const updatedAt = "2026-11-19T00:00:00.000Z";
  const live = { AUD: 1.5, GBP: 0.8, CAD: 1.35, EUR: 0.92 };
  const snapshot = {
    rates: { USD: 1, ...live },
    live,
    overrides: {} as Record<string, number>,
    provider: "Frankfurter (ECB)",
    updatedAt,
  };

  console.log("Currency conversion:");

  check("AUD 1,500 at 1.5 AUD/USD charges USD 1,000", () => {
    const r = computeUsdConversion(1500, "AUD", snapshot);
    eq(r.amount, 1000);
    eq(r.rate, 1.5);
    eq(r.provider, "Frankfurter (ECB)");
    eq(r.rateAt.toISOString(), updatedAt);
  });

  check("GBP 800 at 0.8 GBP/USD charges USD 1,000", () => {
    eq(computeUsdConversion(800, "GBP", snapshot).amount, 1000);
  });

  check("CAD 1,350 at 1.35 charges USD 1,000 (2dp precision)", () => {
    eq(computeUsdConversion(1350, "CAD", snapshot).amount, 1000);
  });

  check("USD is 1:1 and does not need a live rate", () => {
    const r = computeUsdConversion(1234.56, "usd", snapshot);
    eq(r.amount, 1234.56);
    eq(r.rate, 1);
    eq(r.provider, "base");
  });

  check("manual override wins over live rate and is labelled", () => {
    // getRates() merges overrides into `rates`, so the effective rate is 2.
    const overrides = { AUD: 2 };
    const r = computeUsdConversion(1500, "AUD", {
      ...snapshot,
      rates: { ...snapshot.rates, ...overrides },
      overrides,
    });
    eq(r.amount, 750);
    eq(r.rate, 2);
    eq(r.provider, "Manual override");
  });

  check("rounds to Square cents", () => {
    eq(computeUsdConversion(100, "AUD", { ...snapshot, live: { AUD: 3 }, rates: { USD: 1, AUD: 3 } }).amount, 33.33);
  });

  check("refuses unknown currency (fails closed)", () => {
    throws(() => computeUsdConversion(100, "XYZ", snapshot));
  });

  check("refuses missing live rate instead of converting 1:1", () => {
    throws(() => computeUsdConversion(100, "AUD", { ...snapshot, live: {}, rates: { USD: 1, AUD: 1 } }));
  });

  check("refuses zero or negative amounts", () => {
    throws(() => computeUsdConversion(0, "USD", snapshot));
    throws(() => computeUsdConversion(-5, "AUD", snapshot));
  });

  check("CURRENCIES includes all client-facing examples", () => {
    for (const c of ["USD", "AUD", "GBP", "CAD"]) eq(CURRENCIES.includes(c), true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
