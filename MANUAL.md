# Italský systém — Jak na to

## Co je `/allora`

Každý den spustíš `/allora [týden] [téma]` v Claude Code (terminál nebo app).  
Příklady:
```
/allora              → týden 1, café (defaulty)
/allora 3 food       → týden 3, jídlo
/allora 7 transport  → týden 7, doprava
```

Claude automaticky:
- Stáhne dnešní české zprávy a přepíše je do italštiny
- Vygeneruje celou session
- Uloží soubor sem do `~/allora/session-week[X]-[téma]-[datum].md`
- V chatu ukáže jen Quick Start tabulku

---

## Jak číst Quick Start tabulku

Po spuštění `/allora` uvidíš v chatu tabulku:

```
┌────────────┬──────────────────┬──────────────────────────────────────────┐
│ Čas        │ Aplikace         │ Sekce v souboru (Ctrl+F)                 │
├────────────┼──────────────────┼──────────────────────────────────────────┤
│ 0:00–0:05  │ soubor           │ ## 📰 Section 2 — Notizie                │
│ 0:05–0:12  │ claude.ai        │ ## 🔧 Section 5 → blok CLAUDE            │
│ ...        │ ...              │ ...                                      │
└────────────┴──────────────────┴──────────────────────────────────────────┘
```

**Jak ji používat:**
1. Otevři session soubor (viz níže jak ho otevřít)
2. Tabulka ti říká: v kolik minut jdi do jaké aplikace a co v souboru hledat
3. Ctrl+F + název sekce (např. `Section 4`) tě přeskočí přesně tam

---

## Jak otevřít session soubory

Po spuštění `/allora` se vytvoří složka ve formátu:
```
~/allora/week1-cafe-2026-04-12/
```

Každá section = **samostatný soubor**. Otevřeš jen ten, co zrovna potřebuješ.

```
week1-cafe-2026-04-12/
├── notizie.md          ← čteš nahlas (zprávy v italštině)
├── plan.md             ← 30min časový plán
├── notebooklm.md       ← celý script → Cmd+A, Cmd+C → NotebookLM
├── claude-gramatika.md ← grammar prompt → Cmd+A, Cmd+C → claude.ai
├── gemini.md           ← pronunciation prompt → Cmd+A, Cmd+C → Gemini
├── roleplay.md         ← roleplay opener → Cmd+A, Cmd+C → Claude voice
├── perplexity.md       ← resources prompt → Cmd+A, Cmd+C → Perplexity
└── pronunciation.md    ← výslovnostní drily → čteš nahlas
```

**Jak otevřít:**
- **Finder** → složka `allora` v domovském adresáři → otevři složku session → klikni na soubor
- **VS Code** — `code ~/allora/` otevře celou složku, soubory vidíš v postranním panelu
- **Obsidian** — vault na `~/allora/`, každý soubor = nota

---

## Sekce po sekcích — co s nimi dělat

---

### 📰 Section 2 — Notizie dal mondo ceco
**Kdy:** 0:00–0:05 · **Kde:** v tomto souboru

Dnešní české zprávy přepsané do italštiny. Přečti je nahlas.

**Jak na to:**
1. Přečti italské věty pomalu nahlas
2. Zaměř se na slova označená `💡` nebo tučně — to jsou klíčová slovíčka
3. Zkus stínovat (shadow): přečti česky, pak hned italsky
4. Slovíčka na konci sekce si zapiš nebo ofotografuj — vrátí se v pronunciation drill

---

### 📝 Section 5, blok CLAUDE — Gramatika
**Kdy:** 0:05–0:12 · **Kde:** [claude.ai](https://claude.ai) (nový chat)

**Jak na to:**
1. Otevři nový chat na claude.ai
2. V souboru najdi `## 🔧 Section 5` → sekci `── CLAUDE (gramatika) ──`
3. Zkopíruj celý blok textu v ``` ``` ``` uvozovkách
4. Vlož do Claude a odešli
5. Claude ti vysvětlí gramatiku česky + dá cvičení
6. Odpověz mu — opraví tě a vysvětlí chyby

**Tip:** Nezavírej ten chat — doptávej se, dokud gramatika není jasná.

---

### 🔊 Section 5, blok GEMINI — Výslovnost
**Kdy:** 0:12–0:18 · **Kde:** [gemini.google.com](https://gemini.google.com)

**Jak na to:**
1. Otevři Gemini (web nebo app)
2. V souboru najdi `── GEMINI (výslovnost) ──`
3. Zkopíruj celý blok a vlož do Gemini
4. Gemini ti dá IPA přepis + vysvětlení problémů pro česky mluvící
5. Zkus říct stínové věty nahlas — a pak mu napiš, co ti nešlo

**Kalibrační test:** Řekni nahlas `"Vorrei un caffè, per favore."` — pokud tě Claude voice pochopí správně, výslovnost je OK.

---

### 🎙️ Section 4 — NotebookLM Podcast Script
**Kdy:** 0:25–0:30 (generování může trvat, spusť dřív) · **Kde:** [notebooklm.google.com](https://notebooklm.google.com)

**Jak na to:**
1. Otevři NotebookLM
2. Vytvoř **nový notebook** (tlačítko `+` / `New notebook`)
3. Klikni na `+ Add source` → vyber `Copied text`
4. V souboru najdi `## 🎙️ Section 4`
5. Zkopíruj **celý obsah** od `=== NOTEBOOKLM UPLOAD` až po poslední řádek `OUTRO`
6. Vlož do NotebookLM a potvrď
7. Vpravo nahoře klikni na `Audio Overview` → `Generate`
8. Generování trvá 1–3 minuty — jdi mezitím na roleplay
9. Poslouchej podcast při chůzi, vaření, cestě MHD

**Proč je to důležité:** Podcast je pasivní poslech — mozek zpracovává jazyk jinak než při aktivním učení. Tohle je náhrada za Pingo listening mód.

---

### 🗣️ Section 6 — Roleplay Opener
**Kdy:** 0:18–0:25 · **Kde:** [claude.ai](https://claude.ai) voice mode nebo nový text chat

**Jak na to:**
1. Otevři Claude — buď voice mode (mikrofon) nebo nový text chat
2. V souboru najdi `## 🗣️ Section 6`
3. Zkopíruj **celý blok** (od `Act as a friendly barista...` až po `Start: greet me...`)
4. Vlož jako první zprávu a odešli
5. Claude se stane Marcem — reaguj italsky!

**Tipy pro voice mode:**
- Mluv pomalu a zřetelně
- Když nevíš slovo, zkus to opsat: *"Come si dice... jídlo?"*
- Po skončení požádej: *"Napiš mi 3 věty, které jsem řekl špatně"*

**Tipy pro text mode:**
- Stejný prompt funguje textově — piš italsky, Marco odpoví
- Výhoda: vidíš opravy v `[forma corretta]` přímo v textu

---

### 🔧 Section 5, blok PERPLEXITY — Zdroje
**Kdy:** kdykoliv (není časově vázaný) · **Kde:** [perplexity.ai](https://perplexity.ai)

**Jak na to:**
1. Otevři Perplexity
2. V souboru najdi `── PERPLEXITY (zdroje) ──`
3. Zkopíruj blok, vlož, odešli
4. Perplexity najde YouTube videa, podcasty a zdroje pro daný týden/téma
5. Uložit si odkazy na nejlepší videa — používat je místo NotebookLM pokud chceš autentičtější audio

---

### 🔊 Section 7 — Pronunciation Drill
**Kdy:** kdykoliv (doporučeno po Gemini slotu nebo večer) · **Kde:** v tomto souboru, nahlas

**Jak na to:**
1. V souboru najdi `## 🔊 Section 7`
2. Každý drill má: Shadow list → Czech trap → Fix
3. Přečti shadow list 3× — pomalu, středně, normálně
4. Zaměř se vždy jen na **jeden drill** — hloubka > šíře
5. Nemusíš dělat všechny 3 drily najednou — jeden stačí

---

## Jak sledovat pokrok

Po každé session Claude automaticky aktualizuje:
```
~/allora/italian-log.md
```

Tento soubor obsahuje:
- Seznam všech sessions (datum, týden, téma)
- Průběžný slovník (všechna naučená slova)
- Gramatické body, které již byly probrány

Podívej se na něj kdykoliv — uvidíš jak daleko jsi došel/a.

---

## Týdenní plán — co se učíš kdy

| Týden | Gramatika | Téma | Jazyk podcastu |
|-------|-----------|------|----------------|
| 1 | essere + pozdravy + il/la | Café, bar | 70% CZ/EN |
| 2 | avere + členy | Jídlo, rodina | 70% CZ/EN |
| 3 | Přítomný čas (-are) | Denní rutina | 65% CZ/EN |
| 4 | Přítomný čas (-ere/-ire) + zápor | Restaurace | 60% CZ/EN |
| 5 | Shoda přídavných jmen | Popis míst | 50/50 |
| 6 | Předložky + směry | Doprava, město | 50/50 |
| 7 | Minulý čas (s avere) | Cestování | 60% IT |
| 8 | Minulý čas (s essere) + zájmena | Výlety, jídlo | 65% IT |
| 9 | Imperfetto (popis, zvyk) | Vzpomínky | 80% IT |
| 10 | Budoucí čas + kondicionál | Plány, přání | 85% IT |
| 11 | Konjunktiv (úvod) | Názory | 90% IT |
| 12 | Volná konverzace | Vše | 100% IT |

---

## Rychlé reference

| Chci... | Jdu do... |
|---------|-----------|
| Nové slovíčka z dnešních zpráv | Section 2 |
| Gramatické cvičení | Section 5 → CLAUDE |
| Opravu výslovnosti | Section 5 → GEMINI + Section 7 |
| Podcast pro pasivní poslech | Section 4 → NotebookLM |
| Konverzační trénink | Section 6 → Claude voice |
| YouTube/podcasty k tématu | Section 5 → PERPLEXITY |
| Co jsem se dosud naučil/a | `~/allora/italian-log.md` |

---

## Nejčastější chyby Čechů v italštině (rychlý reminder)

| Problém | Czech trap | Fix |
|---------|-----------|-----|
| `r` vs `ř` | říkáš „voříei" | r jako v „rak", nikdy ř |
| Délka samohlásek | říkáš „lúna", „pízza" | vše krátce — délka nemění meaning |
| Měkké `t/n` | říkáš „importan-ťe" | vždy tvrdé jako před a/o/u |
| `gli` | říkáš „gl-i" dvě hlásky | jedna palatální hláska, jako „million" |
| `c` před a/o/u | přidáváš českou frikatívu | čisté K, žádné chh |
| `il problema` | myslíš ženský rod (končí -a) | je mužský! il problema |
