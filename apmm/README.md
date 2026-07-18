# APMM – Alternative Payment Methods Monitor

Katalog e‑shopů dodávajících zboží do ČR s přehledem **alternativních platebních metod**, které přijímají: kryptoměny (Bitcoin, Lightning, stablecoiny), PayPal, digitální peněženky (Apple Pay, Google Pay, Revolut, Twisto) a další moderní payment kanály.

Běžné metody (dobírka, bankovní převod, karta) evidujeme jen doplňkově. Zajímají nás obchody prodávající **vratné zboží** (oblečení, elektronika, domácnost, hobby). Typicky nevratné položky (knihy, spodní prádlo, digitální obsah) zahrnujeme jen tehdy, když má obchod jasně definované podmínky vracení i pro ně.

> Projekt není finanční poradenství. Jde o veřejný katalog možností, data ověřujeme, ale garantovat je nemůžeme.

## Umístění v repu

APMM dočasně žije jako podadresář `apmm/` v repu `tomekson/allora` (jediné repo dostupné v této session). Až bude mít projekt vlastní repo, vyčlení se historie takto:

```bash
git subtree split --prefix=apmm -b apmm-standalone
# a poté push apmm-standalone do nového repa
```

## Stack

| Vrstva    | Technologie                                  |
|-----------|----------------------------------------------|
| Backend   | Node.js 22+, TypeScript, Fastify (REST API)  |
| DB        | MySQL 8 (Docker), Prisma ORM + migrace       |
| Scraping  | Playwright + Cheerio/Zod (Fáze 3)            |
| Frontend  | Astro (SSG, SEO friendly, česky)             |
| Infra     | docker-compose, později deploy na Rozhled.cz |
| Testy     | Vitest, Playwright E2E                       |

## Struktura

```
apmm/
├── backend/          # API, Prisma schema, migrace, seed a CLI skripty
│   ├── prisma/       # schema.prisma (doménový model)
│   ├── src/          # Fastify server
│   ├── scripts/      # seed + budoucí CLI pro správu shopů
│   └── data/         # ruční seed data (JSON)
├── frontend/         # Astro katalog (Fáze 2)
└── infra/            # docker-compose (MySQL + Adminer), env šablony
```

## Jak to rozběhnout lokálně

```bash
# 1. DB (MySQL 8 + Adminer na http://localhost:8080)
cd apmm/infra
cp .env.example .env
docker compose up -d

# 2. Backend
cd ../backend
cp .env.example .env
npm install
npx prisma migrate dev --name init   # vytvoří tabulky
npm run db:seed                      # nahraje ukázková data z data/seed-shops.json
npm run dev                          # API na http://localhost:3000 (GET /health, GET /api/shops)

# 3. Frontend (zatím placeholder)
cd ../frontend
npm install
npm run dev                          # http://localhost:4321
```

## Doménový model

- **Shop** – obchod: název, URL, jazyk, země sídla, typ sortimentu, politika vracení (lhůta, výjimky, URL podmínek).
- **PaymentMethod** – platební metoda: typ (card / bank_transfer / cod / paypal / crypto / wallet / bnpl / other), detail (konkrétní měna či provider), příznak `isAlternative` (to, co primárně sledujeme).
- **ShopPaymentOption** – vazba Shop × PaymentMethod: dostupnost pro CZ zákazníky, zda jde o online úhradu nebo platbu při převzetí, poznámky (registrace, minimální částka), stav ověření a čas poslední verifikace.
- **Source** – odkud informace pochází (stránka „Platba", obchodní podmínky, FAQ).
- **ScrapeRun** – jednotlivé běhy scraperu nad Source: čas, status, surový výstup.

Schema je navržené pro filtrování („obchody v ČR s PayPal + BTC"), budoucí scoring modernosti a historii změn (ScrapeRun + timestampy na ShopPaymentOption).

## Roadmapa

- [x] **Fáze 0** – projektový skeleton (backend / frontend / infra, README)
- [x] **Fáze 1 (část)** – Prisma schema, docker-compose DB, seed skript + testovací data
- [x] **Fáze 1 (CLI)** – `npm run shop:add` a `npm run shop:list` pro ruční správu obchodů
- [ ] **Fáze 1 (zbytek)** – rozšíření seedu na desítky ověřených obchodů
- [x] **Fáze 2** – veřejný katalog (Astro): listing, detail obchodu, filtr podle metod (data se při buildu berou ze seed JSON, po Fázi 3 z DB/API)
- [x] **Fáze 3 (část)** – REST API s filtry (`/api/shops?method=PayPal&country=CZ&alt=true`, `/api/shops/:id`, `/api/scrapes`) + scraping: `npm run scrape -- --page <url>` (Playwright, respektuje robots.txt, extrakce metod přes klíčová slova, `--shop <url> --save` uloží ScrapeRun)
- [x] **Fáze 3 (zbytek)** – `npm run scrape:apply -- --run <id> [--write]` promítne výsledky scrapu do katalogu (jen přidává/potvrzuje, ručně ověřené záznamy nepřepisuje); příklad plánování v `infra/cron.example`
- [x] **Fáze 4** – deploy: Dockerfily, `infra/docker-compose.prod.yml` (MySQL + API + Caddy s automatickým HTTPS), návod níže
- [ ] Post-MVP: scoring, historie změn, exporty, alerty, kurátorské vrstvy

## Nasazení do produkce (Fáze 4)

Na serveru s Dockerem (např. Rozhled.cz):

```bash
git clone <repo> /opt/apmm-repo && cd /opt/apmm-repo/apmm/infra
cp prod.env.example .env        # doplň doménu a silná hesla
docker compose -f docker-compose.prod.yml up -d --build

# první inicializace DB (tabulky + seed)
docker compose -f docker-compose.prod.yml exec api npx prisma db push
docker compose -f docker-compose.prod.yml exec api node dist/scripts/seed.js
```

- DNS: A záznam domény z `APMM_DOMAIN` nasměruj na server; HTTPS certifikát
  (Let's Encrypt) si Caddy vyřídí sám při prvním požadavku.
- Web běží na doméně, API na `/api/*` (reverse proxy na kontejner `api`).
- Statický katalog se peče do image při buildu; po změně dat spusť znovu
  `docker compose -f docker-compose.prod.yml up -d --build web`.
- Scraping spouštěj mimo API kontejner (lokálně nebo na serveru s
  nainstalovaným Playwright), viz `infra/cron.example`.
- Logy: `docker compose -f docker-compose.prod.yml logs -f api web`.

## Zásady scrapingu (Fáze 3)

- Respektovat `robots.txt` a rozumné rate limity (žádný agresivní scraping).
- Scrapovat jen veřejné informační stránky (platba, doprava, obchodní podmínky, FAQ).
- Každý údaj má Source + timestamp verifikace, podezřelá data se označují, ne mažou.
