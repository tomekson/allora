# Allora — architektura

> Statická web app pro učení italštiny (čeština L1, A1→B1).
> Repo: `github.com/tomekson/allora` · Web: `https://tomekson.github.io/allora/`
> Vzor provozu: projekt banánovník (GitHub Pages PWA, free tier, verzování).

## Principy

1. **Žádná databáze, žádný backend.** Všechna data = JSON soubory commitnuté v repu, servírované GitHub Pages jako statické soubory.
2. **Maximum bez tokenů.** Fetch zdrojů, parsování, SRS opakování, TTS, kvízy — vše bez AI. AI (Claude Code na subscription, žádné API klíče) jen tam, kde je nenahraditelná: přepis zpráv do zjednodušené italštiny, generování podcast scriptů a roleplay.
3. **Free tier všeho.** GitHub Pages + GitHub Actions (public repo = zdarma), bezplatné datové zdroje, browser TTS.
4. **Jen pro Tomka.** Žádný auth, progress v localStorage + export/import JSON.

## Vrstvy

```
┌─────────────────────────────────────────────────────────┐
│ 1. SBĚR (GitHub Actions cron, denně, 0 tokenů)          │
│    RSS zprávy IT+CZ → parse → data/news/YYYY-MM-DD.json │
├─────────────────────────────────────────────────────────┤
│ 2. OBOHACENÍ (Claude Code lokálně, subscription)        │
│    /allora session → přepis zpráv dle týdne, podcast    │
│    script, roleplay, drily → data/sessions/*.json       │
├─────────────────────────────────────────────────────────┤
│ 3. APP (statická PWA na Pages, 0 tokenů)                │
│    čtečka zpráv + tap-to-translate · SRS flashcards ·   │
│    TTS (Web Speech API) · drily · progress dashboard    │
└─────────────────────────────────────────────────────────┘
```

## Datový model (vše JSON v repu)

```
data/
├── news/                  ← denní fetch z RSS (Actions)
│   └── 2026-07-03.json    ← [{source, title, summary, url, lang}]
├── sessions/              ← generuje Claude Code (/allora)
│   └── week1-cafe-2026-04-12.json
│       {week, topic, date, notizie[], grammar{}, roleplay{},
│        podcast_script, drills[], vocab[]}
├── vocab.json             ← průběžný slovník (nahrazuje italian-log tabulku)
│   [{it, gender, cz, ipa_cz, week, source, note}]
├── grammar-progress.json  ← probrané gramatické body dle 12týdenního plánu
├── dictionary/            ← offline slovník IT→CZ/EN (build z free dat, viz Zdroje)
│   ├── core.json          ← top ~5000 slov dle frekvence
│   └── verbs.json         ← konjugace nejčastějších sloves
└── curriculum.json        ← 12týdenní plán (gramatika, témata, jazykový poměr)
```

- **Progress uživatele** (SRS intervaly, dokončené sessions, streak) → `localStorage`, klíč `allora-progress`, s tlačítkem export/import JSON (přenos mezi zařízeními).
- **Obsah** (slovník, sessions, zprávy) → repo. Oddělení: obsah se commituje, progress ne.

## Pipeline 1 — sběr zpráv (0 tokenů)

GitHub Actions workflow `fetch-news.yml`:
- **cron denně ráno** (~06:00 UTC) + `workflow_dispatch` pro ruční spuštění
- Node/Python script: stáhne RSS (italské zdroje + české zdroje — viz Zdroje), vytáhne title + description, ořeže HTML, uloží `data/news/YYYY-MM-DD.json`, smaže soubory starší 30 dní, commit + push
- Bez AI — jen parsing. App pak zprávy zobrazuje s tap-to-translate přes offline slovník.
- Pozor: scheduled workflows GitHub po 60 dnech neaktivity repa vypne — commity z workflow samy počítají jako aktivita jen omezeně; řešení = workflow commituje do repa (aktivita) + keepalive step.

## Pipeline 2 — AI obohacení (subscription, žádné API tokeny)

- `/allora [week] [topic]` v Claude Code zůstává, ale místo 8 markdown souborů generuje **jeden session JSON** do `data/sessions/` (+ volitelně markdown pro čtení).
- Skill si vezme čerstvé zprávy z `data/news/` (už stažené, žádný WebFetch nutný), přepíše je do italštiny dle týdenní úrovně z `curriculum.json`, vygeneruje podcast script, roleplay opener, drily, 5 slovíček → append do `vocab.json`.
- Commit + push = deploy (Pages). Session se objeví v app.
- **Výhled MCP:** stejné generování půjde volat přes MCP server / claude.ai — skill jen čte a zapisuje JSON, takže rozhraní je datové, ne konverzační.

## Pipeline 3 — app (statická PWA, 0 tokenů)

Stack jako banánovník: **vanilla HTML+CSS+JS, žádný build step** (Opus/Sonnet pak snadno spravují), PWA se service workerem pro offline.

Moduly (SPA taby):

| Modul | Co dělá | Bez AI? |
|-------|---------|---------|
| 📰 Notizie | denní zprávy; IT zdroje přímo, CZ zprávy s AI přepisem ze session; tap na slovo → překlad z offline slovníku | ✅ (AI jen přepis CZ→IT) |
| 🃏 Slovíčka | SRS flashcards (SM-2 algoritmus) nad `vocab.json` + `dictionary/core.json`, TTS výslovnost | ✅ |
| 🎧 Ascolto | přehrání podcast scriptu přes Web Speech API (IT hlas), rychlost 0.7–1.0; náhrada NotebookLM pro pasivní poslech | ✅ |
| 🔊 Pronuncia | drily z sessions, minimal pairs pro česká interference (r/ř, gli, délky) + nahrání vlastního hlasu (MediaRecorder) pro porovnání | ✅ |
| 📚 Grammatica | 12týdenní kurikulum, probrané body, cvičení ze sessions (doplňovačky — vyhodnocení stringovým porovnáním) | ✅ |
| 🗣️ Roleplay | zobrazí opener k copy-paste do claude.ai voice (jako dnes) | AI vně app |
| 📊 Progresso | streak, počet slov, SRS statistiky, týden kurikula | ✅ |

**TTS:** `speechSynthesis` s `lang: it-IT` — zdarma, offline, funguje i na iOS WebKit. Fallback: zvýraznění textu pro hlasité čtení.

## Verzování a deploy (převzato z banánovníku)

- 3 soubory synchronně: `index.html` (`APP_VERSION`), `sw.js` (`CACHE = 'allora-vX.XX'`), `version.json`
- +0.01 drobnost · +0.10 menší UI změna · +1.00 nová funkce/velký obsah — velikost určuje Tomek
- Update banner uvnitř PWA přes `visibilitychange` + `version.json`
- Deploy = push na `main`, Pages servíruje root (nebo `/docs`)

## Struktura repa

```
allora/
├── index.html          ← celá SPA (jako banánovník)
├── app.js / style.css  ← pokud index.html přeroste, rozdělit
├── sw.js               ← service worker (offline cache)
├── manifest.json       ← PWA manifest
├── version.json
├── data/               ← viz Datový model
├── scripts/
│   ├── fetch-news.mjs  ← RSS → JSON (běží v Actions)
│   └── build-dict.mjs  ← jednorázový build offline slovníku ze zdrojů
├── .github/workflows/fetch-news.yml
├── CLAUDE.md           ← instrukce pro Opus/Sonnet (vývoj a deploy)
├── ARCHITECTURE.md     ← tento soubor
└── MANUAL.md           ← návod pro Tomka
```

## Zdroje dat (free, ověřeno 2026-07-03)

### Zprávy

| Zdroj | URL | Poznámka |
|-------|-----|----------|
| **ANSA** (IT) ✅ | `https://www.ansa.it/sito/ansait_rss.xml` | primární IT zprávy; sekce dle vzoru `ansa.it/<sezione>/notizie/<sezione>_rss.xml`. **Licence: jen osobní použití** — nepublikovat texty veřejně, v app zobrazovat jen zpracované/přepsané výstupy |
| **EasyItalianNews** ✅ | easyitaliannews.com | zjednodušená italština pro studenty + MP3 s rodilým mluvčím (S3), út/čt/so, zdarma (donation). Bez RSS — Actions scrapuje archiv (od 2018). **Nejlepší graded-reader zdroj** |
| **iRozhlas** (CZ) ✅ | `https://www.irozhlas.cz/rss/irozhlas` (+ `/section/zpravy-domov` atd.) | zdroj pro AI přepis CZ→IT |
| **ČT24** (CZ) ✅ | `https://ct24.ceskatelevize.cz/rss/hlavni-zpravy` | záloha CZ zpráv |
| Il Post (IT) 🔶 | `https://www.ilpost.it/feed/` | backup — blokuje boty, Actions musí použít normální User-Agent |
| Easy News Italian podcast 🔶 | easynewsitalian.com | backup — free podcast s transkripty |
| ~~RaiNews RSS~~ ❌ | — | nepodařilo se ověřit funkční feed |
| ~~News in Slow Italian~~ ❌ | — | paywall |

Všechny feedy tahat přes **GitHub Actions** (CORS v browseru nespolehlivý).

### Slovník a jazyková data

| Zdroj | Co | Licence | Použití |
|-------|-----|---------|---------|
| **kaikki.org Wiktextract** ✅ | IT→EN slovník, JSONL ~637 MB | CC-BY-SA | Actions stáhne jednou, `build-dict.mjs` vyfiltruje top slova dle frekvence → slim `dictionary/core.json` do repa. IT→CS neexistuje |
| **hermitdave/FrequencyWords** ✅ | `.../content/2018/it/it_50k.txt` (`slovo počet`) | MIT | frekvenční řazení, proxy pro CEFR úrovně (oficiální free CEFR list neexistuje) |
| **Tatoeba** ✅ | IT↔CS věty (export TSV z tatoeba.org/downloads) | CC-BY | příkladové věty; IT↔CS bude řídké (tisíce max) → doplnit IT↔EN |
| FreeDict ita-ces 🔶 | jediný přímý IT→CS slovník | GPL/CC | backup — před použitím ověřit pokrytí (malý/starší) |
| **verb-data / verbecc** ✅ | konjugace IT sloves jako JSON | MIT/open (ověřit per repo) | vendorovat do `dictionary/verbs.json` |
| ~~dictionaryapi.dev~~ ❌ | — | — | italština fakticky prázdná |

### TTS

**Web Speech API** (`speechSynthesis`, `it-IT`) — $0, client-side, funguje na iOS WebKit (všechny iOS browsery). Kritická omezení:
- `speak()` na iOS **musí být spuštěn tapnutím** (user gesture), jinak WebKit potichu zahodí → každé přehrání = tlačítko
- `getVoices()` může být napoprvé prázdné → poslouchat `voiceschanged`; hlas vybírat přes `lang.startsWith('it')`, nikdy hard-code jména hlasu
- Lidský hlas navíc zdarma: MP3 z EasyItalianNews

### GitHub Actions (free tier)

- Public repo = **neomezené minuty zdarma**; cron min. interval 5 min (doporučeno ≥15), spouští se s 5–15min zpožděním — nespoléhat na přesný čas
- **60denní auto-disable** scheduled workflows při neaktivitě repa: běhy workflow se nepočítají, ale **commit fetchnutých dat z workflow ano** → náš fetch-news s commit-back se udržuje naživu sám

## Fáze vývoje (pro Opus/Sonnet)

1. **v1.0 — skeleton:** SPA + PWA + verzování, `curriculum.json`, ruční import stávajícího `vocab` z `italian-log.md`, SRS flashcards, TTS
2. **v2.0 — news pipeline:** Actions fetch RSS → Notizie modul + tap-to-translate (slovník build)
3. **v3.0 — sessions:** úprava `/allora` skillu na JSON výstup, moduly Ascolto/Pronuncia/Grammatica
4. **v4.0 — MCP:** generování sessions přes MCP, případně sync progressu
