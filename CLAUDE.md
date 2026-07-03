# Allora — Italian Learning Project

## Kontext

Tento adresář je **allora** (dříve `~/italian`) — Italian immersion learning projekt: generování session souborů, tracking progress, vocabulary + statická web app na GitHub Pages.

- **Repo:** github.com/tomekson/allora, branch main, GitHub Pages
- **URL:** https://tomekson.github.io/allora/
- **Architektura:** viz `ARCHITECTURE.md` — statická PWA, JSON místo databáze, GitHub Actions na fetch zdrojů, AI jen přes Claude Code (subscription, žádné API tokeny)

## Progress log

Ukládej a čti progress z `~/allora/italian-log.md` (NE z `~/.claude/italian-log.md`).

## Auto-memory

Memories z Italian sessions (vocabulary progress, grammar coverage, session history) ukládej do auto-memory — budou automaticky isolovány do tohoto projektu díky CWD.

## Instrukce pro /allora skill

Skill je definován v `~/.claude/skills/allora/SKILL.md`. Spouštěj ho normálně přes `/allora [week] [topic]`.
