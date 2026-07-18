/**
 * Extrakce signálů o platebních metodách z textu stránky
 * (typicky "Platba a doprava", obchodní podmínky, FAQ).
 *
 * Čistá funkce bez síťových závislostí, aby šla snadno testovat.
 * Názvy metod odpovídají číselníku PaymentMethod (data/seed-shops.json).
 */

export interface PaymentSignal {
  /** Název metody dle číselníku PaymentMethod */
  method: string;
  /** Klíčové slovo, které signál spustilo */
  keyword: string;
  /** Okolní text pro ruční kontrolu (max ~120 znaků) */
  context: string;
}

/** Pořadí je významné: specifičtější vzory (Lightning) před obecnými (Bitcoin). */
const SIGNAL_PATTERNS: { method: string; pattern: RegExp }[] = [
  // U názvů kryptoměn povolujeme české koncovky (Bitcoinem, Solanou, Ethereem...)
  { method: "Bitcoin (Lightning)", pattern: /lightning(?:\s+network)?/gi },
  { method: "Bitcoin (on-chain)", pattern: /\bbitcoin\p{L}*|\bbtc\b/giu },
  { method: "Tether (USDT)", pattern: /\btether\p{L}*|\busdt\b/giu },
  { method: "USD Coin (USDC)", pattern: /\busdc\b|usd\s+coin\p{L}*/giu },
  { method: "Ethereum", pattern: /\bethere\p{L}+|\beth\b/giu },
  { method: "Solana", pattern: /\bsolan\p{L}+|\bsol\b/giu },
  { method: "Tron", pattern: /\btron\p{L}*|\btrx\b/giu },
  { method: "PayPal", pattern: /pay\s*pal/gi },
  { method: "Apple Pay", pattern: /apple\s*pay/gi },
  { method: "Google Pay", pattern: /(?:google\s*pay|\bg\s?pay\b)/gi },
  { method: "Twisto", pattern: /\btwisto\b/gi },
  { method: "Skip Pay", pattern: /skip\s*pay/gi },
  { method: "Klarna", pattern: /\bklarna\b/gi },
  { method: "Platební karta", pattern: /platebn\p{L}+\s+kart\p{L}+|kartou\s+online|\bvisa\b|master\s?card/giu },
  { method: "Bankovní převod", pattern: /bankovn\p{L}+\s+převod\p{L}*|převodem\s+na\s+účet|qr\s+platb\p{L}+/giu },
  { method: "Dobírka", pattern: /dobírk\p{L}+|na\s+dobírku/giu },
];

const CONTEXT_RADIUS = 55;

/**
 * Vrátí nalezené platební metody. Každou metodu nejvýše jednou,
 * s prvním výskytem jako kontextem.
 */
export function extractPaymentSignals(text: string): PaymentSignal[] {
  const normalized = text.replace(/\s+/g, " ");
  const found: PaymentSignal[] = [];

  for (const { method, pattern } of SIGNAL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalized);
    if (!match) continue;
    const start = Math.max(0, match.index - CONTEXT_RADIUS);
    const end = Math.min(normalized.length, match.index + match[0].length + CONTEXT_RADIUS);
    found.push({
      method,
      keyword: match[0].trim(),
      context: normalized.slice(start, end).trim(),
    });
  }

  return found;
}
