/**
 * Seed lokální DB z data/seed-shops.json.
 * Idempotentní: metody i obchody se upsertují podle unikátního name/url.
 * Pokud má shop sourceUrl, vytvoří se Source (PAYMENT_PAGE) a naváže se
 * na jeho ShopPaymentOption záznamy.
 *
 * Spuštění: npm run db:seed
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../src/lib/prisma.js";
import { shopInputSchema, upsertShopWithPayments } from "../src/lib/shops.js";

const paymentMethodSchema = z.object({
  name: z.string(),
  type: z.enum(["CARD", "BANK_TRANSFER", "COD", "PAYPAL", "CRYPTO", "WALLET", "BNPL", "OTHER"]),
  isAlternative: z.boolean(),
  detail: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const seedFileSchema = z.object({
  paymentMethods: z.array(paymentMethodSchema),
  shops: z.array(shopInputSchema),
});

async function main() {
  const dataPath = fileURLToPath(new URL("../data/seed-shops.json", import.meta.url));
  const raw = JSON.parse(await readFile(dataPath, "utf8"));
  const data = seedFileSchema.parse(raw);

  for (const method of data.paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { name: method.name },
      update: { type: method.type, isAlternative: method.isAlternative, detail: method.detail },
      create: method,
    });
  }
  console.log(`Platebních metod: ${data.paymentMethods.length}`);

  for (const shop of data.shops) {
    await upsertShopWithPayments(shop);
    console.log(`Shop ${shop.name}: ${shop.payments.length} platebních metod`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
