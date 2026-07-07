# Prompt pro Claude Code v repu ¡pues! (~/pues)

Zkopíruj do nové session (nejlépe otevřené v adresáři ~/pues, ať Claude pracuje ve správném repu).

---

Pracuješ na ¡pues! (~/pues, repo github.com/tomekson/pues) — sesterský projekt k allora (~/allora), stejná pipeline denních zpráv (Wikipedia + EU/statistické zdroje → DeepL s fallbackem na MyMemory → `data/news/daily.json`), jen ve španělštině místo italštiny. Než začneš, přečti `~/pues/ARCHITECTURE.md` a `~/pues/CLAUDE.md` — projekt je záměrně minimální (jen denní zprávy, žádné lekce/slovíčka/progress), takže nic z toho nepřidávej navíc.

V sesterském projektu allora (~/allora) jsme právě vyřešili dva problémy, které pravděpodobně existují identicky i tady, protože kód pipeline je z allory adaptovaný:

## 1) Denní zprávy se přepisují, historie se ztrácí

`scripts/fetch-news.mjs` každý den přepíše `data/news/daily.json` novým obsahem — včerejší zprávy a jejich překlady zmizí beze stopy. To je škoda, chceme je uchovávat.

Řešení, které jsme implementovali v allora (zkopíruj stejný přístup, uprav jen cesty/nic španělsky specifického se měnit nemusí):

- Na konci scriptu, po zápisu `daily.json`, přidat zápis trvalé kopie do `data/news/archive/<YYYY-MM-DD>.json` (stačí `{date, stories, article}` — stejná data co v `daily.json`, ne oříznutá)
- Udržovat `data/news/archive/index.json` — pole `[{date, count}]`, seřazené od nejnovějšího, při každém běhu se záznam pro dnešek buď přidá, nebo nahradí (kdyby script běžel dvakrát za den)
- V `.github/workflows/fetch-news.yml` přidat do kroku commitu `git add data/news/daily.json data/news/archive/`
- V appce (pravděpodobně `app.js`) přidat na konec zobrazení denních zpráv odkaz „Archivo — días anteriores" (nebo obdobně španělsky), který otevře nový pohled:
  - načte `data/news/archive/index.json`
  - zobrazí dny pod sebou (datum + počet zpráv), řazeno od nejnovějšího
  - **stránkování po 14 dnech** (tlačítka Novější/Starší, resp. španělsky)
  - klepnutím na den se lazy-loadne `data/news/archive/<date>.json` a zprávy se zobrazí stejným stylem jako v hlavním pohledu (tap = rozbalit češtinu, 🔊 = přehrát)
- Nezapomeň na hash routing, pokud ho appka používá (allora má `#archivio` jako samostatnou „stránku" dostupnou jen přes odkaz, ne přes spodní menu — stejný vzor by seděl i tady)
- Po nasazení zpětně vytvoř archivní záznam pro dnešek z aktuálního `daily.json` (ať archiv nezačíná prázdný) — jednoduchý jednorázový node příkaz, ne součást pipeline

## 2) Ranní automatická aktualizace zpráv chybí/mešká

Cron u allory (`schedule: "30 4 * * *"`) se v reálu spouští s klidně několikahodinovým zpožděním — to je zdokumentované chování GitHub Actions scheduled workflows na veřejných repozitářích (nejde to spolehlivě opravit, jen zmírnit). V allora jsme přidali druhý záložní cron čas o pár hodin později:

```yaml
on:
  schedule:
    - cron: "30 4 * * *"   # hlavní pokus
    - cron: "0 7 * * *"    # záložní pokus, kdyby první meškal
  workflow_dispatch:
```

Zkontroluj `~/pues/.github/workflows/fetch-news.yml`, jestli má stejný jednoduchý cron, a přidej tam analogický záložní čas. Ověř přes `gh run list --repo tomekson/pues --workflow=fetch-news.yml --limit 10` historii běhů — jestli se scheduled běhy opožďují podobně jako u allory, druhý cron to zmírní.

## Na závěr

Po implementaci obojího ověř na živém webu (https://tomekson.github.io/pues/), že archiv funguje a stránkuje správně, a připomeň uživateli GitHub Pages quirk zapsaný v paměti projektu — po pushi je potřeba ručně spustit build (`gh api repos/tomekson/pues/pages/builds -X POST`), protože auto-deploy tomuhle repu nespolehlivě selhává.

---
