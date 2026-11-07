# Packaging (K4)

How a Kotilo Kit release gets from a tag to winget, the AUR and Homebrew.

## 1. Tag → draft release (automatic)

```
# bump the version everywhere first (tauri.conf.json, Cargo.toml, apps/*/package.json, packages/*/package.json)
git tag v1.0.0 && git push origin v1.0.0
```

`.github/workflows/release.yml`:

- checks that the tag matches every version field;
- builds on Windows (MSI + NSIS `.exe`), macOS (universal `.dmg`) and Linux (`.AppImage` + `.deb`);
- runs the tests and fails if an MSI, setup.exe, dmg or deb is larger than **25 MB** (the AppImage embeds WebKitGTK, ~80 MB, and is only reported);
- attaches everything, plus the single-file CLI (`kotilo-kit-cli-v1.0.0.cjs`), to a **draft** release.

GitHub shows a sha256 digest next to every asset.

## 2. Publish (manual)

Review the draft (smoke-test the installers), edit the notes, press **Publish**.

## 3. Manifests (automatic)

Publishing runs `.github/workflows/packaging.yml`. It renders the manifests from the published asset
URLs and digests (`packaging/render.ts`) and attaches `kotilo-kit-manifests-v1.0.0.tar.gz`:

| File | Goes to |
|---|---|
| `winget/Kotilo.KotiloKit*.yaml` | PR to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) under `manifests/k/Kotilo/KotiloKit/<version>/` |
| `aur/PKGBUILD`, `aur/.SRCINFO` | push to `ssh://aur@aur.archlinux.org/kotilo-kit-bin.git` |
| `homebrew/Casks/kotilo-kit.rb` | push to `kotilo-dev/homebrew-tap` (`brew install kotilo-dev/tap/kotilo-kit`) |

To re-render for an existing release: run the workflow by hand with the tag, or locally:

```
gh release view v1.0.0 --json assets > assets.json
pnpm exec tsx packaging/render.ts 1.0.0 assets.json out
```

## 4. Submit (manual, per channel)

Submitting is outward-facing and stays a manual, reviewed step. No workflow holds AUR keys or
cross-repo tokens.

- **winget:** `wingetcreate submit` or a PR with the three YAML files. The first submission is
  reviewed by Microsoft.
- **AUR:** `makepkg --printsrcinfo` must match `.SRCINFO`; `namcap PKGBUILD`; commit and push.
- **Homebrew:** copy the cask into the tap; check it with `brew audit --cask --strict kotilo-dev/tap/kotilo-kit`.

## Signing

The installers are **unsigned** for now:

- Windows SmartScreen shows "unknown publisher".
- macOS Gatekeeper blocks the first launch. Use right-click › Open, or `xattr -dr com.apple.quarantine "/Applications/Kotilo Kit.app"`.

Signing needs a Windows code-signing certificate and an Apple Developer ID plus notarization. Both are
added to `release.yml` as secrets when they become available.
