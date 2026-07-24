/**
 * Scraping jedné stránky s platebními informacemi.
 *
 * Stáhne stránku přes Playwright (Chromium), extrahuje signály
 * o platebních metodách a volitelně uloží ScrapeRun do DB.
 * Respektuje robots.txt a dělá jediný požadavek na stránku.
 *
 * Příklady:
 *   npx tsx scripts/scrape-shop.ts --page https://www.zoot.cz/doprava-a-platba/
 *   npx tsx scripts/scrape-shop.ts --shop https://www.zoot.cz --save
 *
 * --shop vezme obchod z DB (podle URL) a scrapuje jeho Source
 * (PAYMENT_PAGE); --save vyžaduje --shop a zapíše výsledek do DB.
 */
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma.js";
import { extractPaymentSignals } from "../src/lib/extract.js";
import { isPathAllowed } from "../src/lib/robots.js";

const USER_AGENT = "APMM-bot/0.1 (katalog platebnich metod; kontakt v repu)";

const { values } = parseArgs({
  options: {
    page: { type: "string" },
    shop: { type: "string" },
    save: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

async function isAllowedByRobots(pageUrl: string): Promise<boolean> {
  const url = new URL(pageUrl);
  if (url.protocol === "file:") return true;
  const robotsUrl = `${url.origin}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, { headers: { "user-agent": USER_AGENT } });
    if (!res.ok) return true; // bez robots.txt předpokládáme povolení
    return isPathAllowed(await res.text(), url.pathname + url.search, USER_AGENT);
  } catch {
    return true;
  }
}

async function fetchPageText(pageUrl: string): Promise<string> {
  const browser = await chromium.launch({
    executablePath: process.env.APMM_CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await page.evaluate(() => {
      const doc = (globalThis as { document?: { body?: { innerText?: string } } }).document;
      return doc?.body?.innerText ?? "";
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  if (values.help || (!values.page && !values.shop)) {
    console.log(
      "Použití: scrape-shop.ts --page <url> | --shop <shopUrl> [--save]\n" +
        "  --page  scrapne konkrétní URL a vypíše nalezené metody\n" +
        "  --shop  vezme obchod z DB podle URL a scrapne jeho Source (PAYMENT_PAGE)\n" +
        "  --save  uloží ScrapeRun s výsledkem do DB (jen s --shop)",
    );
    return;
  }

  let pageUrl = values.page;
  let sourceId: number | undefined;

  if (values.shop) {
    const shop = await prisma.shop.findUnique({
      where: { url: values.shop },
      include: { sources: { where: { kind: "PAYMENT_PAGE" }, take: 1 } },
    });
    if (!shop) throw new Error(`Obchod s URL ${values.shop} v DB není. Přidej ho přes shop:add.`);
    const source = shop.sources[0];
    if (!source) throw new Error(`Obchod ${shop.name} nemá Source typu PAYMENT_PAGE. Doplň sourceUrl.`);
    pageUrl = pageUrl ?? source.url;
    sourceId = source.id;
  }
  if (!pageUrl) throw new Error("Chybí URL stránky.");

  if (!(await isAllowedByRobots(pageUrl))) {
    console.error(`robots.txt scraping ${pageUrl} zakazuje, končím.`);
    if (values.save && sourceId) {
      await prisma.scrapeRun.create({
        data: { sourceId, status: "BLOCKED", finishedAt: new Date(), error: "robots.txt disallow" },
      });
    }
    process.exitCode = 2;
    return;
  }

  console.log(`Stahuji: ${pageUrl}`);
  const startedAt = new Date();
  const text = await fetchPageText(pageUrl);
  const signals = extractPaymentSignals(text);

  console.log(`\nNalezené metody (${signals.length}):`);
  for (const s of signals) {
    console.log(`  - ${s.method} (klíč: "${s.keyword}")`);
    console.log(`      …${s.context}…`);
  }
  if (signals.length === 0) {
    console.log("  žádné. Zkontroluj, zda jde o stránku s platebními informacemi.");
  }

  if (values.save && sourceId) {
    await prisma.scrapeRun.create({
      data: {
        sourceId,
        status: "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        rawExcerpt: text.slice(0, 4000),
        resultJson: signals.map((s) => ({ method: s.method, keyword: s.keyword, context: s.context })),
      },
    });
    console.log("\nScrapeRun uložen. Zápis do ShopPaymentOption zatím dělej ručně po kontrole.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
