# Kotilo Kit — Claude Code başlangıç paketi

Bu klasörü yeni repo köküne kopyala (`CLAUDE.md` kökte, `docs/` yanında), sonra Claude Code'u başlat:

    claude "CLAUDE.md ve docs/ altındaki spec'i oku, K0 fazını planla ve monorepoyu kur"

İçerik: CLAUDE.md (agent kuralları) · docs/01 gereksinimler · 02 tasarım · 03 mimari · 04 araç kataloğu · 05 tema TOML · docs/mockup/ artboard kaynakları.

## Geliştirme (K0)

    pnpm i
    pnpm test                              # vitest: core, 16 araç, tools-spec tabloları, detect, i18n, CLI
    pnpm lint                              # eslint (core/araçlarda ağ/DOM/saat/rastgele yasak) + tsc
    pnpm kit list
    pnpm kit base64 decode < in.txt
    echo 1700000000 | pnpm kit detect
    pnpm --filter @kotilo/kit-cli build    # apps/cli/dist/kotilo.cjs (tek dosya)

Yapı: `packages/kit-core` (defineTool, registry, detect, i18n, config) · `packages/kit-tools/src/<kategori>/<id>.ts` · `apps/cli` · `tools-spec/<id>.json` kabul tabloları.
