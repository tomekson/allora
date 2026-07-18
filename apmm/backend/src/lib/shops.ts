import { z } from "zod";
import { prisma } from "./prisma.js";

export const COUNTRIES = ["CZ", "SK", "DE", "AT", "PL", "OTHER_EU", "NON_EU"] as const;
export const ASSORTMENTS = ["CLOTHING", "ELECTRONICS", "HOME", "HOBBY", "SPORTS", "MIXED", "OTHER"] as const;

export const shopPaymentSchema = z.union([
  z.string(),
  z.object({ name: z.string(), note: z.string().optional() }),
]);

export const shopInputSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  language: z.string().default("cs"),
  country: z.enum(COUNTRIES),
  assortment: z.enum(ASSORTMENTS),
  hasReturnPolicy: z.boolean().default(false),
  returnPeriodDays: z.number().int().positive().optional(),
  returnPolicyUrl: z.string().url().optional(),
  note: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  payments: z.array(shopPaymentSchema),
});

export type ShopInput = z.infer<typeof shopInputSchema>;

/**
 * Idempotentní zápis obchodu: upsert podle URL, volitelně Source
 * (PAYMENT_PAGE) a platební opce se stavem PENDING.
 */
export async function upsertShopWithPayments(input: ShopInput) {
  const { payments, sourceUrl, ...shopData } = input;
  const shop = await prisma.shop.upsert({
    where: { url: input.url },
    update: shopData,
    create: shopData,
  });

  let sourceId: number | undefined;
  if (sourceUrl) {
    const existing = await prisma.source.findFirst({
      where: { shopId: shop.id, url: sourceUrl },
    });
    const source =
      existing ??
      (await prisma.source.create({
        data: { shopId: shop.id, url: sourceUrl, kind: "PAYMENT_PAGE" },
      }));
    sourceId = source.id;
  }

  for (const payment of payments) {
    const { name, note } = typeof payment === "string" ? { name: payment, note: undefined } : payment;
    const method = await prisma.paymentMethod.findUnique({ where: { name } });
    if (!method) {
      const known = await prisma.paymentMethod.findMany({ select: { name: true }, orderBy: { name: "asc" } });
      throw new Error(
        `Neznámá platební metoda "${name}". Dostupné metody: ${known.map((m) => m.name).join(", ")}`,
      );
    }
    await prisma.shopPaymentOption.upsert({
      where: { shopId_paymentMethodId: { shopId: shop.id, paymentMethodId: method.id } },
      update: { note, sourceId },
      create: {
        shopId: shop.id,
        paymentMethodId: method.id,
        timing: method.type === "COD" ? "ON_DELIVERY" : "ONLINE_CHECKOUT",
        verificationStatus: "PENDING",
        note,
        sourceId,
      },
    });
  }

  return shop;
}
