/**
 * CLI pro ruční přidání nebo editaci obchodu (upsert podle URL).
 *
 * Příklad:
 *   npx tsx scripts/add-shop.ts \
 *     --name "Můj obchod" --url https://www.mujobchod.cz \
 *     --country CZ --assortment ELECTRONICS \
 *     --return-days 14 --source-url https://www.mujobchod.cz/platba \
 *     --payment "PayPal" --payment "Dobírka:Poplatek 30 Kč"
 */
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma.js";
import { ASSORTMENTS, COUNTRIES, shopInputSchema, upsertShopWithPayments } from "../src/lib/shops.js";

const HELP = `Přidání/editace obchodu (upsert podle --url).

Povinné:
  --name <text>            Název obchodu
  --url <url>              URL obchodu (unikátní klíč)
  --country <kód>          ${COUNTRIES.join(" | ")}
  --assortment <typ>       ${ASSORTMENTS.join(" | ")}

Volitelné:
  --language <kód>         Jazyk webu (výchozí: cs)
  --return-days <číslo>    Lhůta vrácení ve dnech
  --return-url <url>       URL podmínek vracení
  --source-url <url>       URL stránky s platebními informacemi (vytvoří Source)
  --note <text>            Poznámka k obchodu
  --payment "Název[:pozn]" Platební metoda dle číselníku, lze opakovat
  -h, --help               Tato nápověda
`;

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    url: { type: "string" },
    country: { type: "string" },
    assortment: { type: "string" },
    language: { type: "string" },
    "return-days": { type: "string" },
    "return-url": { type: "string" },
    "source-url": { type: "string" },
    note: { type: "string" },
    payment: { type: "string", multiple: true },
    help: { type: "boolean", short: "h" },
  },
});

async function main() {
  if (values.help) {
    console.log(HELP);
    return;
  }

  const payments = (values.payment ?? []).map((entry) => {
    const idx = entry.indexOf(":");
    return idx === -1
      ? entry
      : { name: entry.slice(0, idx).trim(), note: entry.slice(idx + 1).trim() };
  });

  const returnDays = values["return-days"] ? Number(values["return-days"]) : undefined;

  const parsed = shopInputSchema.safeParse({
    name: values.name,
    url: values.url,
    country: values.country,
    assortment: values.assortment,
    language: values.language ?? "cs",
    hasReturnPolicy: Boolean(returnDays || values["return-url"]),
    returnPeriodDays: returnDays,
    returnPolicyUrl: values["return-url"],
    note: values.note,
    sourceUrl: values["source-url"],
    payments,
  });

  if (!parsed.success) {
    console.error("Neplatný vstup:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error(`\n${HELP}`);
    process.exitCode = 1;
    return;
  }

  const shop = await upsertShopWithPayments(parsed.data);
  console.log(`Uloženo: ${shop.name} (id ${shop.id}), platebních metod: ${payments.length}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
