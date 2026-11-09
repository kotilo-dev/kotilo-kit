# 03 — Mimari

## Monorepo (pnpm workspace)
```
kotilo-kit/
  packages/
    kit-core/        defineTool API, registry, detect, pipeline, i18n, config (TOML)
    kit-tools/       yerleşik araçlar, kategori klasörlerinde; her araç tek dosya + test
    kit-themes/      themes.toml → CSS değişkenleri; kontrast testi
    kit-ui/          React paneller: Palette, ToolView, Settings, Sidebar; host adaptörü arayüzü
  apps/
    desktop/         Tauri (Rust) kabuk: pencereler, global kısayol, pano, tray, dosya diyalogları
    cli/             Node tek binary (tsup): kotilo kit …
  docs/              bu spec
  tools-spec/        araç başına kabul tabloları (JSON) — testler bunları okur
```
Çekirdek (`kit-core`, `kit-tools`) tarayıcı/Node/Worker'da çalışır; DOM, Tauri, fs ve ağ API'si **yok** (eslint `no-restricted-globals` ile zorlanır).

## `defineTool` API
```ts
export default defineTool({
  id: 'base64',
  category: 'encoding',                // encoding|format|text|time|generate|web|visual
  name: { en: 'Base64', tr: 'Base64' },
  description: { en: 'Encode or decode Base64', tr: 'Base64 kodla veya çöz' },
  keywords: ['b64', 'encode', 'decode'],
  detect: (input) => looksLikeBase64(input) ? 0.8 : 0,   // 0..1, saf
  options: [
    { key: 'mode', type: 'segmented', values: ['encode', 'decode'], default: 'encode', hotkey: 'm' },
    { key: 'urlSafe', type: 'toggle', default: false, hotkey: 'u' },
    { key: 'wrap', type: 'number', default: 0, min: 0, max: 200 },
  ],
  layout: 'input-output',               // input-output | single | table | preview
  run: (input, opts) => ({ output: ..., mime: 'text/plain', meta: { bytes: 184 } }),
  // ağır işler: runAsync(input, opts, { signal, progress })
  accepts: ['text', 'file'],            // giriş kaynakları
  examples: [{ input: 'hi', opts: { mode: 'encode' }, output: 'aGk=' }],
});
```
- `run` saf ve senkron; 1 MB üstü giriş veya `runAsync` tanımlıysa kabuk Worker'da çalıştırır.
- `options` deklaratiftir; `kit-ui` her tipi (segmented, toggle, number, select, text) kendi bileşeniyle çizer. Araç React/HTML içermez.
- `layout: 'table'` çıktıyı satır dizisi olarak bekler (URL ayrıştır, timestamp); `'preview'` HTML-güvenli önizleme (Markdown, görsel).
- `examples` hem dokümantasyon hem test fixture'ıdır.

## Registry ve arama
- `kit-core/registry` tüm `defineTool` modüllerini toplar (yerleşik + kullanıcı eklentileri), id benzersiz.
- Arama: `fuse.js` ile ad (EN+TR), keywords, kategori; skor + son kullanım ağırlığı.
- Son kullanılanlar `config.toml`'da (`[recent] ids = [...]`, `used = [...]` Unix saniye; palette'teki "2 dk önce" için); içerik değil, yalnızca id ve zaman.

## Pano algılama
- Kabuk pano metnini okur (Tauri `clipboard-manager`), `kit-core/detect` her aracın `detect`'ini çalıştırır (Worker, 20 ms bütçe), ilk 3 skoru döner.
- Sıralama ipuçları: JWT 0.95 (üç nokta ayrılı base64url), JSON 0.9, Unix timestamp 0.85 (10/13 haneli sayı), URL 0.85, base64 0.8, hex 0.6, cron 0.7, UUID 0.9, ISO tarih 0.8, CSV 0.6.
- Pano içeriği belleğin dışına çıkmaz; log/metric yok.

## Tema sistemi (`kit-themes`)
- `themes.toml`: `[themes.<id>]` blokları, `name`, `variant = "dark"|"light"`, `pair` (açık/koyu eşi), 15 token.
- Build'de `themes.css` üretilir: `[data-theme="<id>"] { --kit-crust: …; }`. Runtime'da `document.documentElement.dataset.theme = id`.
- Kullanıcı teması: `~/.config/kotilo/kit/themes/*.toml`, aynı şema; eksik token varsa Catppuccin Mocha'dan dolar ve uyarı loglanır (yerel).
- Test: her tema için kontrast matrisi (`02-design.md`) — başarısız tema build'i kırar.

## Kabuklar ve host adaptörü
`kit-ui` bir `Host` arayüzü ister; her kabuk kendi uygulamasını verir:
```ts
interface Host {
  readClipboard(): Promise<string>; writeClipboard(text: string): Promise<void>;
  saveFile(name: string, data: Blob): Promise<void>; openFile(): Promise<File | null>;
  notify(msg: string): void; openFull(toolId: string, input: string): void; close(): void;
  config: ConfigStore; theme: ThemeStore; locale: 'en' | 'tr';
}
```
- **desktop (Tauri):** iki pencere — `palette` (gizli, çerçevesiz, always-on-top, odak kaybında gizlenir) ve `main`. Global kısayol `tauri-plugin-global-shortcut`; tray menüsü (Aç, Palette, Tema ›, Çıkış). Rust tarafı yalnızca OS köprüsü; iş mantığı yok.
- **cli:** `Host` yerine stdin/stdout; `--json` çıktısı.
- **Kotilo Shell / Launcher (gelecek):** aynı `kit-ui` Palette bileşeni, kendi `Host`'u.

## Pipeline (1.1)
- `kit-core/pipeline`: `{ name, palette, steps: [{ tool, opts }] }`, her adımın çıktısı sonrakinin girişi. Tablo çıktısı sonraki adıma TSV (başlık + satırlar) olarak geçer; `bytes` yalnızca `accepts: ['file']` olan adıma taşınır.
- Dosya `<config>/pipelines/<name>.toml`; `name` yoksa dosya adı kullanılır, `palette` varsayılan `true`:
  ```toml
  name = "jwt-scopes"
  palette = true

  [[steps]]
  tool = "base64"
  opts = { mode = "decode", urlSafe = true }

  [[steps]]
  tool = "json"
  opts = { query = "$.scopes[*]" }
  ```
- `registryWithPipelines(tools, files)` her geçerli dosyayı `pipelineTool` ile `defineTool`'a sarar (`category: 'pipeline'`, açıklama "Base64 → JSON format") ve registry'ye ekler. Bilinmeyen araç/seçenek, araç id'siyle çakışan ad ya da bozuk TOML: pipeline kaydedilmez, sorun adım numarasıyla raporlanır (`error.pipeline.*`; Ayarlar › Pipeline'lar ve `kotilo kit list` gösterir). Pipeline başka pipeline'ı adım olarak kullanamaz.
- Hata veren adım `error.pipeline.step` ile adım numarası, araç adı ve aracın kendi mesajını taşır ("2. adım (JSON biçimlendir): …").
- Kabuk dosyaları okur (`cli/main.ts`, masaüstünde Tauri); `kit-core` dosya sistemine dokunmaz.

## Eklenti yükleme (1.1)
- `~/.config/kotilo/kit/tools/*.ts` Sucrase ile JS'e çevrilir (yalnızca tip/JSX soyma; ~200 KB, esbuild-wasm ~11 MB olduğu için 25 MB bütçesini korumak adına seçildi — 1.1 kararı), `new Function` değil; QuickJS-wasm sandbox'ta çalışır (ağ/fs/DOM yok, 50 ms CPU bütçesi, bellek 32 MB). Eklenti tek dosyadır; `@kotilo/kit-core`'dan yalnızca `defineTool` ve `fail` import edebilir, başka import yoktur.
- `kotilo kit add <name>`: `kotilo-dev/kit-tools` deposundan tek dosya indirir — uygulamadaki tek ağ çağrısı, her seferinde kullanıcı onayı, imza (ed25519) doğrulanır.

## Config
`~/.config/kotilo/kit/config.toml`:
```toml
[general]  locale = "tr"  hotkey = "Ctrl+Shift+K"  start_hidden = true
[clipboard] detect = true  # varsayılan açık? → ilk açılışta sorulur
[theme] id = "catppuccin-mocha"  follow_system = true  font = "JetBrains Mono"  size = 13  ligatures = true  palette_opacity = 96  radius = 12  compact = false
[recent] ids = ["jwt", "base64", "timestamp"]  used = [1762512000, 1762500000, 1762400000]
```

## Test
- Vitest; her araç `examples` + `tools-spec/<id>.json` tabloları; TR locale testleri; detect skor testleri (fixture metinleri); kontrast testi; CLI snapshot testleri.
- Tauri e2e (WebDriver) yalnızca K1/K3'te: kısayol → palette → Enter → pano.
