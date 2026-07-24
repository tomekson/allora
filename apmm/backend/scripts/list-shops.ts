/**
 * Výpis obchodů v DB včetně platebních metod a stavu verifikace.
 *
 * Spuštění: npm run shop:list
 */
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const shops = await prisma.shop.findMany({
    include: {
      paymentOptions: { include: { paymentMethod: true } },
    },
    orderBy: { name: "asc" },
  });

  if (shops.length === 0) {
    console.log("DB neobsahuje žádné obchody. Spusť npm run db:seed nebo scripts/add-shop.ts.");
    return;
  }

  for (const shop of shops) {
    const alt = shop.paymentOptions.filter((o) => o.paymentMethod.isAlternative);
    const pending = shop.paymentOptions.filter((o) => o.verificationStatus === "PENDING");
    console.log(`\n${shop.name} — ${shop.url}`);
    console.log(`  ${shop.country} | ${shop.assortment} | vracení: ${shop.returnPeriodDays ?? "?"} dní`);
    console.log(
      `  metody (${shop.paymentOptions.length}, alternativních ${alt.length}, neověřených ${pending.length}):`,
    );
    for (const option of shop.paymentOptions) {
      const flags = [
        option.paymentMethod.isAlternative ? "ALT" : null,
        option.verificationStatus,
        option.note,
      ].filter(Boolean);
      console.log(`    - ${option.paymentMethod.name} [${flags.join(" | ")}]`);
    }
  }
  console.log(`\nCelkem obchodů: ${shops.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
