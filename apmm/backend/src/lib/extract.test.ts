import { describe, expect, it } from "vitest";
import { extractPaymentSignals } from "./extract.js";

/** Pomocná funkce: seznam nalezených metod (bez pořadí garance ve výstupu API). */
function methodsOf(text: string): string[] {
  return extractPaymentSignals(text).map((s) => s.method);
}

describe("extractPaymentSignals", () => {
  describe("běžné metody (karta, převod, dobírka)", () => {
    const text =
      "Zboží můžete uhradit platební kartou Visa nebo Mastercard, bankovním " +
      "převodem na účet, nebo na dobírku (příplatek 30 Kč). Platba kartou " +
      "online je zabezpečena 3D Secure.";

    it("najde platební kartu, bankovní převod a dobírku", () => {
      const found = methodsOf(text);
      expect(new Set(found)).toEqual(
        new Set(["Platební karta", "Bankovní převod", "Dobírka"]),
      );
    });

    it("vrátí každou metodu nejvýše jednou, i když se v textu vyskytuje víckrát", () => {
      const found = extractPaymentSignals(text);
      const cardMatches = found.filter((s) => s.method === "Platební karta");
      expect(cardMatches).toHaveLength(1);
    });

    it("context obsahuje klíčové slovo pro Dobírku", () => {
      const found = extractPaymentSignals(text);
      const signal = found.find((s) => s.method === "Dobírka");
      expect(signal).toBeDefined();
      expect(signal!.context).toContain(signal!.keyword);
      expect(signal!.context.toLowerCase()).toContain("dobírk");
    });

    it("context obsahuje klíčové slovo pro Bankovní převod", () => {
      const found = extractPaymentSignals(text);
      const signal = found.find((s) => s.method === "Bankovní převod");
      expect(signal).toBeDefined();
      expect(signal!.context).toContain(signal!.keyword);
    });
  });

  describe("kryptoměny (styl Alza)", () => {
    const text =
      "Nově přijímáme platby kryptoměnami. Podporujeme Bitcoin (BTC) jak přes " +
      "Lightning Network, tak klasickou on-chain transakci. Přijímáme také " +
      "stablecoiny USDT (Tether) a USDC (USD Coin).";

    it("najde Bitcoin (Lightning) i Bitcoin (on-chain) zároveň, když text zmiňuje obojí", () => {
      const found = methodsOf(text);
      expect(found).toContain("Bitcoin (Lightning)");
      expect(found).toContain("Bitcoin (on-chain)");
    });

    it("najde stablecoiny Tether (USDT) a USD Coin (USDC)", () => {
      const found = methodsOf(text);
      expect(found).toContain("Tether (USDT)");
      expect(found).toContain("USD Coin (USDC)");
    });

    it("vrátí přesně očekávanou množinu metod bez falešných pozitiv (Ethereum/Solana/Tron)", () => {
      const found = methodsOf(text);
      expect(new Set(found)).toEqual(
        new Set([
          "Bitcoin (Lightning)",
          "Bitcoin (on-chain)",
          "Tether (USDT)",
          "USD Coin (USDC)",
        ]),
      );
    });

    it("context pro Bitcoin (Lightning) obsahuje klíčové slovo Lightning", () => {
      const signal = extractPaymentSignals(text).find(
        (s) => s.method === "Bitcoin (Lightning)",
      );
      expect(signal).toBeDefined();
      expect(signal!.keyword.toLowerCase()).toContain("lightning");
      expect(signal!.context).toContain(signal!.keyword);
    });
  });

  describe("wallety a BNPL", () => {
    const text =
      "Za nákup můžete zaplatit přes Apple Pay nebo Google Pay přímo z mobilu. " +
      "Oblíbená je také platba na fakturu přes Twisto nebo rozložení platby " +
      "pomocí Skip Pay či Klarna. Samozřejmě podporujeme i PayPal.";

    it("najde všechny wallety a BNPL metody", () => {
      const found = methodsOf(text);
      expect(new Set(found)).toEqual(
        new Set([
          "Apple Pay",
          "Google Pay",
          "Twisto",
          "Skip Pay",
          "Klarna",
          "PayPal",
        ]),
      );
    });

    it("context pro Twisto obsahuje klíčové slovo", () => {
      const signal = extractPaymentSignals(text).find(
        (s) => s.method === "Twisto",
      );
      expect(signal).toBeDefined();
      expect(signal!.context).toContain(signal!.keyword);
      expect(signal!.context.toLowerCase()).toContain("twisto");
    });

    it("neplete si Apple Pay s Google Pay ani s PayPal", () => {
      const found = extractPaymentSignals(text);
      expect(found.filter((s) => s.method === "Apple Pay")).toHaveLength(1);
      expect(found.filter((s) => s.method === "Google Pay")).toHaveLength(1);
      expect(found.filter((s) => s.method === "PayPal")).toHaveLength(1);
    });
  });

  describe("text bez platebních informací", () => {
    const text =
      "Náš obchod byl založen v roce 2015 a specializuje se na prodej " +
      "zahradního nábytku. Nabízíme širokou škálu produktů od předních " +
      "evropských výrobců. Doprava probíhá po celé České republice.";

    it("vrátí prázdný výsledek", () => {
      expect(extractPaymentSignals(text)).toEqual([]);
    });

    it("vrátí prázdné pole i pro prázdný řetězec", () => {
      expect(extractPaymentSignals("")).toEqual([]);
    });
  });

  describe("diakritika a různá velikost písmen", () => {
    const text =
      "ZBOŽÍ UHRADÍTE PLATEBNÍ KARTOU (VISA NEBO MASTERCARD), BANKOVNÍM " +
      "PŘEVODEM NA ÚČET, NEBO NA DOBÍRKU (POPLATEK 30 KČ). PLATBU LZE " +
      "PROVÉST TAKÉ PŘES paypal ČI ApplePay.";

    it("rozpozná metody nezávisle na velikosti písmen a s diakritikou", () => {
      const found = methodsOf(text);
      expect(new Set(found)).toEqual(
        new Set([
          "Platební karta",
          "Bankovní převod",
          "Dobírka",
          "PayPal",
          "Apple Pay",
        ]),
      );
    });

    it("keyword pro Platební kartu zachovává původní (velké) písmo z textu", () => {
      const signal = extractPaymentSignals(text).find(
        (s) => s.method === "Platební karta",
      );
      expect(signal).toBeDefined();
      expect(signal!.keyword.toUpperCase()).toBe(signal!.keyword);
      expect(signal!.context).toContain(signal!.keyword);
    });

    it("najde ApplePay psané dohromady bez mezery", () => {
      const signal = extractPaymentSignals(text).find(
        (s) => s.method === "Apple Pay",
      );
      expect(signal).toBeDefined();
      expect(signal!.keyword.toLowerCase()).toBe("applepay");
    });
  });
});
