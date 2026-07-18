/**
 * Seed lokální DB z data/seed-shops.json.
 * Idempotentní: metody i obchody se upsertují podle unikátního name/url.
 *
 * Spuštění: npm run db:seed
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../src/lib/prisma.js";

const paymentMethodSchema = z.object({
  name: z.string(),
  type: z.enum(["CARD", "BANK_TRANSFER", "COD", "PAYPAL", "CRYPTO", "WALLET", "BNPL", "OTHER"]),
  isAlternative: z.boolean(),
  detail: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const shopSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  language: z.string().default("cs"),
  country: z.enum(["CZ", "SK", "DE", "AT", "PL", "OTHER_EU", "NON_EU"]),
  assortment: z.enum(["CLOTHING", "ELECTRONICS", "HOME", "HOBBY", "SPORTS", "MIXED", "OTHER"]),
  hasReturnPolicy: z.boolean().default(false),
  returnPeriodDays: z.number().int().positive().optional(),
  returnPolicyUrl: z.string().url().optional(),
  payments: z.array(z.string()),
});

const seedFileSchema = z.object({
  paymentMethods: z.array(paymentMethodSchema),
  shops: z.array(shopSchema),
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
    const { payments, ...shopData } = shop;
    const created = await prisma.shop.upsert({
      where: { url: shop.url },
      update: shopData,
      create: shopData,
    });

    for (const methodName of payments) {
      const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { name: methodName } });
      await prisma.shopPaymentOption.upsert({
        where: { shopId_paymentMethodId: { shopId: created.id, paymentMethodId: method.id } },
        update: {},
        create: {
          shopId: created.id,
          paymentMethodId: method.id,
          timing: method.type === "COD" ? "ON_DELIVERY" : "ONLINE_CHECKOUT",
          verificationStatus: "PENDING",
        },
      });
    }
    console.log(`Shop ${shop.name}: ${payments.length} platebních metod`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
