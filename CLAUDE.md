# Kotilo Kit — Agent Rehberi

Bu repo **Kotilo Kit**'tir: tamamen çevrimdışı, tek pencereli, dev temalı geliştirici araç kutusu (base64, JSON, JWT, timestamp, regex, hash…). Kotilo markasının (kotilo.dev, github.com/kotilo-dev) açık kaynak halkası.

## Başlamadan önce oku
1. `docs/01-requirements.md` — ne yapıyoruz, ne yapmıyoruz, kabul ölçütleri
2. `docs/02-design.md` — tema token'ları, tipografi, palette ve tam pencere yerleşimi, mockup referansı
3. `docs/03-architecture.md` — monorepo, `defineTool` API, pano algılama, pipeline, kabuklar
4. `docs/04-tool-catalog.md` — üretilecek araçların tam listesi, öncelik ve sürüm
5. `docs/05-themes.toml` — 7 tema; **kaynak gerçek budur**, kodda hex yazma

## Değişmez kurallar
- **Ağ yok.** Çekirdek (`packages/kit-core`) ve araçlar hiçbir ağ çağrısı yapmaz. Google Fonts dahil; fontlar paketlenir. Bir araç ağ gerektiriyorsa kapsam dışıdır, yazma.
- **Telemetri yok, pano geçmişi yok.** Pano içeriği hiçbir yere yazılmaz; yalnızca `detect` skoru hesaplanır.
- **Her araç `defineTool` ile.** Yerleşik araçlar da eklenti API'sini kullanır; `run` saf fonksiyondur, UI deklaratiftir (`ui` nesnesi), araç React yazmaz.
- **Renk yalnızca token'dan.** Bileşenlerde `var(--kit-*)` kullan; hex yalnızca `themes.toml`'da. Yeni tema = TOML'a bir blok.
- **EN/TR.** Tüm metinler `packages/kit-core/i18n/{en,tr}.json`; araç adlarında teknik terim İngilizce kalır ("Base64", "JWT").
- **Türkçe karakter doğruluğu.** Case dönüşümü ve sıralama `Intl` + `tr-TR` locale ile; `İ/ı` testleri zorunlu.
- **Ayarlar TOML**, `~/.config/kotilo/kit/config.toml` (Windows: `%APPDATA%\kotilo\kit\config.toml`).
- Mevcut Kotilo projeleriyle (Desktop, Shell, Launcher) **aynı tema token adları** kullanılır; yeni ad icat etme, `docs/02-design.md`'deki tabloya bak.

## Komutlar
```
pnpm i
pnpm dev            # masaüstü kabuğu (Tauri) + core watch
pnpm test           # vitest, tüm paketler
pnpm kit <tool> …   # CLI: pnpm kit base64 decode < in.txt
pnpm lint
```

## Çalışma düzeni
- Fazlar `docs/01-requirements.md` sonunda. Faz bitmeden sonrakine geçme; her faz PR.
- Yeni araç eklerken: `packages/kit-tools/src/<category>/<id>.ts` + test + `i18n` + katalogda işaretle. Araç başına PR.
- Tasarım kararı gerektiren bir şey görürsen durup sor; mockup'ta olmayan ekran icat etme.
- Commit mesajı: `feat(tool): jwt decode`, `feat(shell): palette window`, `chore(theme): add nord`.

## Önerilen skills / plugins
- `frontend-design` (UI işine başlamadan), `design:accessibility-review` (kontrast kontrolü; her tema için 4.5:1), `design:ux-copy` (hata ve boş durum metinleri)
- Tauri + React + TypeScript + Vitest bilgisi varsayılır; Rust yalnızca kabuk (pencere, global kısayol, pano, tray).
