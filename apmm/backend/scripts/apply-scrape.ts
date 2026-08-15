/**
 * Zápis výsledků scrapu do katalogu (ShopPaymentOption).
 *
 * Bezpečnostní model: scraper výsledky jen ukládá (ScrapeRun.resultJson),
 * do katalogu je promítá až tento skript. Metody pouze přidává nebo
 * potvrzuje, nikdy neodebírá; odebrání metody je vždy ruční rozhodnutí.
 *
 * Příklady:
 *   npx tsx scripts/apply-scrape.ts --run 12          # náhled, nic nezapíše
 *   npx tsx scripts/apply-scrape.ts --run 12 --write  # zapíše jako VERIFIED_AUTO
 */
import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../src/lib/prisma.js";

const resultSchema = z.array(z.object({ method: z.string(), keyword: z.string(), context: z.string() }));

const { values } = parseArgs({
  options: {
    run: { type: "string" },
    write: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

async function main() {
  if (values.help || !values.run) {
    console.log("Použití: apply-scrape.ts --run <id> [--write]\n  bez --write jen vypíše, co by se změnilo");
    return;
  }

  const run = await prisma.scrapeRun.findUnique({
    where: { id: Number(values.run) },
    include: { source: { include: { shop: true } } },
  });
  if (!run) throw new Error(`ScrapeRun ${values.run} neexistuje.`);
  if (run.status !== "SUCCESS") throw new Error(`ScrapeRun ${run.id} má status ${run.status}, čekám SUCCESS.`);

  const signals = resultSchema.parse(run.resultJson ?? []);
  const shop = run.source.shop;
  console.log(`Obchod: ${shop.name}, běh ${run.id} z ${run.startedAt.toISOString()}, signálů: ${signals.length}`);

  for (const signal of signals) {
    const method = await prisma.paymentMethod.findUnique({ where: { name: signal.method } });
    if (!method) {
      console.log(`  ? ${signal.method}: není v číselníku, přeskakuji`);
      continue;
    }
    const existing = await prisma.shopPaymentOption.findUnique({
      where: { shopId_paymentMethodId: { shopId: shop.id, paymentMethodId: method.id } },
    });
    const action = existing
      ? existing.verificationStatus === "VERIFIED_MANUAL"
        ? "beze změny (ručně ověřeno, nepřepisuji)"
        : "potvrzuji jako VERIFIED_AUTO"
      : "přidávám jako VERIFIED_AUTO";
    console.log(`  + ${signal.method}: ${action}`);

    if (!values.write) continue;
    if (existing?.verificationStatus === "VERIFIED_MANUAL") continue;
    await prisma.shopPaymentOption.upsert({
      where: { shopId_paymentMethodId: { shopId: shop.id, paymentMethodId: method.id } },
      update: { verificationStatus: "VERIFIED_AUTO", lastVerifiedAt: new Date(), sourceId: run.sourceId },
      create: {
        shopId: shop.id,
        paymentMethodId: method.id,
        timing: method.type === "COD" ? "ON_DELIVERY" : "ONLINE_CHECKOUT",
        verificationStatus: "VERIFIED_AUTO",
        lastVerifiedAt: new Date(),
        sourceId: run.sourceId,
      },
    });
  }

  console.log(values.write ? "\nZapsáno." : "\nNáhled, nic nezapsáno. Pro zápis přidej --write.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
