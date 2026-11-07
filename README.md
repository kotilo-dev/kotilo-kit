# Kotilo Kit

**Offline, keyboard-first developer toolbox.** Base64, JSON, JWT, timestamps, regex, hashes and more — in one window, with dev themes. No network calls, no telemetry, no clipboard history.

Goal: **clipboard → result in two keystrokes.** Copy a JWT, press `Ctrl+Shift+K`, hit `Enter` — the decoded payload is on your clipboard.

> **Status: pre-alpha (phase K3).** The core library, all 31 1.0 tools, the CLI, the desktop palette (global shortcut → palette → Enter → clipboard), the full window and Settings › Appearance (7 themes + light pairs, system light/dark, .toml theme import, bundled mono fonts, opacity/radius/density, contrast CI) work today. See the [roadmap](#roadmap).

Part of [Kotilo](https://kotilo.dev) · Türkçe: [aşağıda](#türkçe)

## Install

Installers for Windows (MSI / setup.exe), macOS (universal .dmg) and Linux (.AppImage / .deb) are attached to every [GitHub release](https://github.com/kotilo-dev/kotilo-kit/releases). The MSI, setup.exe, dmg and deb are each ≤ 25 MB (the AppImage embeds WebKitGTK and is ~80 MB). All of them work offline. After 1.0 the package managers follow:

```sh
winget install Kotilo.KotiloKit              # Windows
brew install --cask kotilo-dev/tap/kotilo-kit   # macOS
yay -S kotilo-kit-bin                        # Arch (AUR)
```

The builds are not code-signed yet. On Windows, SmartScreen shows "unknown publisher". On macOS, open the app the first time with right-click › Open. The release process is described in [`packaging/README.md`](packaging/README.md).

## Tools

<!-- tools:start -->
31 built-in tools, generated from the registry by `pnpm readme:tools`.

| Category | Tools |
|---|---|
| Encoding | `base64` Base64 · `url` URL encode · `jwt` JWT decode · `html-entity` HTML entities · `radix` Hex / text / binary · `unicode` Unicode inspector |
| Format | `json` JSON format · `json-convert` JSON ⇄ YAML ⇄ TOML ⇄ XML · `csv` CSV ⇄ JSON ⇄ Markdown · `json-types` JSON to types · `xml` XML format · `sql` SQL format |
| Text | `case` Case converter · `lines` Line tools · `diff` Text diff · `regex` Regex tester · `escape` Escape / unescape · `fake` Fake data · `count` Text counter |
| Time · Number | `timestamp` Unix timestamp · `cron` Cron expression · `duration` Duration calculator · `units` Number bases & units |
| Generate · Crypto | `uuid` UUID / ULID · `hash` Hash · `password` Password generator |
| Web · Network | `url-parse` URL parser · `query` Query string · `http-ref` HTTP status & MIME |
| Color · Visual | `color` Color converter · `theme-palette` Theme palette |
<!-- tools:end -->

Options, examples and detection rules for each tool are in [`docs/04-tool-catalog.md`](docs/04-tool-catalog.md).

## CLI

```sh
pnpm i
pnpm kit list
pnpm kit base64 decode < in.txt
echo '{"b":1,"a":2}' | pnpm kit json --sort-keys
echo 1700000000 | pnpm kit timestamp --tz Europe/Istanbul
echo '*/15 9-17 * * 1-5' | pnpm kit cron
pbpaste | pnpm kit detect            # which tool fits this input?
pnpm kit jwt --help
```

Bare words select option values (`base64 decode` = `base64 --mode decode`). `--json` prints the result with metadata. Errors go to stderr with exit code 1. Messages follow your locale (`KOTILO_LANG=tr` or `--lang tr`).

## Desktop (palette)

```sh
pnpm dev               # Tauri dev: hidden palette window + tray
pnpm build:desktop     # release build
```

Press `Ctrl+Shift+K` (`Cmd+Shift+K` on macOS) anywhere. Tools that recognize your clipboard appear under **Suggested**. `Enter` runs the selected one and puts the result on the clipboard. `Ctrl+Enter` opens the tool in the full window, `Tab` shows its options, and `Alt+letter` switches an option. `Ctrl+1…9` runs a row directly. Clipboard detection asks for consent on first launch, and no clipboard content is ever stored. The full window (tray › Open, or `Ctrl+Enter` from the palette) has every tool in a sidebar with live input → output. `Ctrl+K` searches, and pasting recognized content into the search opens the matching tool. `Ctrl+Shift+C` copies the output and `Ctrl+L` clears the input. Requires the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Writing a tool

Every tool — built-in or plugin — is one `defineTool` module. `run` is a pure function. The UI is declared through `options`, and tools never contain React or HTML.

```ts
import { defineTool } from '@kotilo/kit-core';

export default defineTool<{ mode: 'encode' | 'decode' }>({
  id: 'rot13',
  category: 'encoding',
  name: { en: 'ROT13', tr: 'ROT13' },
  description: { en: 'Rotate letters by 13', tr: 'Harfleri 13 kaydır' },
  detect: () => 0,
  options: [{ key: 'mode', type: 'segmented', values: ['encode', 'decode'], default: 'encode', hotkey: 'm' }],
  run: (input) => ({ output: input.replace(/[a-z]/gi, (c) => /* … */ c) }),
  examples: [{ input: 'abc', output: 'nop' }],
});
```

Clock, time zone and randomness come from `ctx` (`ctx.now`, `ctx.tz`, `ctx.random`), so every tool is deterministic under test. ESLint blocks network, DOM, `fs`, `Date.now()` and `Math.random()` inside tools.

## Development

```sh
pnpm i
pnpm test                              # vitest: core, tools, tools-spec tables, detect fixtures, i18n, CLI
pnpm lint                              # eslint + tsc
pnpm --filter @kotilo/kit-cli build    # apps/cli/dist/kotilo.cjs (single file)
```

```
packages/kit-core    defineTool, registry + search, detect, i18n (EN/TR), config (TOML)
packages/kit-tools   built-in tools: src/<category>/<id>.ts
packages/kit-themes  docs/05-themes.toml → --kit-* CSS variables
packages/kit-ui      React: Palette, Toast, Host interface (shell adapter)
apps/desktop         Tauri shell: windows, global shortcut, tray, clipboard
apps/cli             kotilo kit …
tools-spec/          per-tool acceptance tables read by the tests
docs/                requirements, design, architecture, catalog, themes
```

Contributing: one tool per PR — `src/<category>/<id>.ts`, i18n entries in `packages/kit-core/i18n/{en,tr}.json`, a `tools-spec/<id>.json` table, and a detect fixture. See the checklist in [`docs/04-tool-catalog.md`](docs/04-tool-catalog.md).

## Roadmap

| Phase | Scope |
|---|---|
| **K0** ✓ | Monorepo, `kit-core`, P1 tools, CLI |
| **K1** ✓ | Tauri shell: hidden window, global shortcut, clipboard, tray, palette window |
| **K2** ✓ | Full window: category tree, tool panel, suggestion strip, status bar; all 1.0 tools |
| **K3** ✓ | Theme system: 7 themes (Catppuccin, Gruvbox, Tokyo Night, Everforest, Nord, Rosé Pine, Dracula), settings, contrast CI |
| K4 | Packaging (winget, AUR, Homebrew), generated tool list, GitHub releases → 1.0 tag |
| K5 (1.1) | Pipelines, plugin loader, `kit-tools` repo |

## Türkçe

Kotilo Kit; base64, JSON, JWT, zaman damgası, regex, hash gibi günlük dönüşümleri **tamamen çevrimdışı**, tek pencerede ve dev temalarıyla yapan açık kaynak bir araç kutusu. Arayüz ve hata metinleri EN/TR. Türkçe büyük/küçük harf dönüşümü (İ/ı) ve sıralama `tr-TR` kurallarıyla yapılıyor. Spec belgeleri (`docs/`) Türkçe.

## License

[MIT](LICENSE) © 2026 Kotilo
