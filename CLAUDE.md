# allora. (Italian Learning Project)

## Pravidlo názvu

Projekt se jmenuje **`allora.`** a píše se VŽDY malými písmeny s tečkou na konci, napříč kódem, UI texty i dokumentací. Nikdy "Allora", nikdy "allora" bez tečky (výjimka: technické identifikátory jako název repa, složky, cache klíče).

## Pravidla textů v UI

- Žádné pomlčky (—) v uživatelsky viditelných textech
- Žádné technické detaily ani vysvětlování záměru návrhu, jen co má uživatel udělat
- Slovo "kurikulum" nepoužívat (týdenní plán = viaggio / tappa)
- Shadow věta v lekci musí tematicky odpovídat tématu lekce (caffè lekce = věta z baru, ne z novin)

## Kontext

Tento adresář je **allora.** (dříve `~/italian`), Italian immersion learning projekt: generování session souborů, tracking progress, vocabulary + statická web app na GitHub Pages.

- **Repo:** github.com/tomekson/allora, branch main, GitHub Pages
- **URL:** https://tomekson.github.io/allora/
- **Architektura:** viz `ARCHITECTURE.md` — statická PWA, JSON místo databáze, GitHub Actions na fetch zdrojů, AI jen přes Claude Code (subscription, žádné API tokeny)

## Progress log

Ukládej a čti progress z `~/allora/italian-log.md` (NE z `~/.claude/italian-log.md`).

## Auto-memory

Memories z Italian sessions (vocabulary progress, grammar coverage, session history) ukládej do auto-memory — budou automaticky isolovány do tohoto projektu díky CWD.

## Instrukce pro /allora skill

Skill je definován v `~/.claude/skills/allora/SKILL.md`. Spouštěj ho normálně přes `/allora [week] [topic]`.
