/**
 * Zdroj dat katalogu pro statický build.
 * Zatím čte přímo seed JSON backendu (jediný zdroj pravdy v MVP).
 * Až bude primárním zdrojem DB + scraping, nahradí se exportem z API.
 */
import seed from "../../../backend/data/seed-shops.json";

export interface PaymentMethodInfo {
  name: string;
  type: string;
  isAlternative: boolean;
}

export interface ShopPayment {
  method: PaymentMethodInfo;
  note?: string;
}

export interface CatalogShop {
  slug: string;
  name: string;
  url: string;
  country: string;
  assortment: string;
  returnPeriodDays?: number;
  returnPolicyUrl?: string;
  sourceUrl?: string;
  note?: string;
  payments: ShopPayment[];
  altPayments: ShopPayment[];
}

export const COUNTRY_LABELS: Record<string, string> = {
  CZ: "Česko",
  SK: "Slovensko",
  DE: "Německo",
  AT: "Rakousko",
  PL: "Polsko",
  OTHER_EU: "jinde v EU",
  NON_EU: "mimo EU",
};

export const ASSORTMENT_LABELS: Record<string, string> = {
  CLOTHING: "oblečení a móda",
  ELECTRONICS: "elektronika",
  HOME: "domácnost",
  HOBBY: "hobby",
  SPORTS: "sport a pohyb",
  MIXED: "smíšený sortiment",
  OTHER: "ostatní",
};

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shopSlug(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").replace(/\./g, "-");
}

interface SeedPaymentEntry {
  name?: string;
  note?: string;
}

const methodsByName = new Map<string, PaymentMethodInfo>(
  seed.paymentMethods.map((m) => [m.name, { name: m.name, type: m.type, isAlternative: m.isAlternative }]),
);

export const shops: CatalogShop[] = seed.shops
  .map((shop) => {
    const payments: ShopPayment[] = shop.payments.map((entry: string | SeedPaymentEntry) => {
      const name = typeof entry === "string" ? entry : (entry.name ?? "");
      const note = typeof entry === "string" ? undefined : entry.note;
      const method = methodsByName.get(name);
      if (!method) throw new Error(`Katalog: neznámá platební metoda "${name}" u obchodu ${shop.name}`);
      return { method, note };
    });
    return {
      slug: shopSlug(shop.url),
      name: shop.name,
      url: shop.url,
      country: shop.country,
      assortment: shop.assortment,
      returnPeriodDays: "returnPeriodDays" in shop ? shop.returnPeriodDays : undefined,
      returnPolicyUrl: "returnPolicyUrl" in shop ? shop.returnPolicyUrl : undefined,
      sourceUrl: "sourceUrl" in shop ? shop.sourceUrl : undefined,
      note: "note" in shop ? shop.note : undefined,
      payments,
      altPayments: payments.filter((p) => p.method.isAlternative),
    };
  })
  .sort((a, b) => b.altPayments.length - a.altPayments.length || a.name.localeCompare(b.name, "cs"));

/** Alternativní metody, které má aspoň jeden obchod (pro filtr). */
export const altMethods: { slug: string; method: PaymentMethodInfo; shopCount: number }[] = [
  ...new Map(
    shops.flatMap((s) => s.altPayments).map((p) => [p.method.name, p.method]),
  ).values(),
].map((method) => ({
  slug: slugify(method.name),
  method,
  shopCount: shops.filter((s) => s.altPayments.some((p) => p.method.name === method.name)).length,
})).sort((a, b) => b.shopCount - a.shopCount || a.method.name.localeCompare(b.method.name, "cs"));

export function shopsWithMethod(methodName: string): CatalogShop[] {
  return shops.filter((s) => s.payments.some((p) => p.method.name === methodName));
}
