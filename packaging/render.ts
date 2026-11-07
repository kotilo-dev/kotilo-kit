/**
 * Package-manager manifests (docs/01-requirements.md K4: winget, AUR, Homebrew) rendered from the
 * assets of a GitHub release. Runs in .github/workflows/release.yml after the installers are built:
 *
 *   tsx packaging/render.ts <version> <assets.json> <out-dir>
 *
 * `assets.json` is `gh release view v<version> --json assets` (name, url, digest "sha256:…").
 * Nothing is submitted here — submitting to winget-pkgs / AUR / the Homebrew tap is a separate,
 * explicitly approved step (see packaging/README.md).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Asset {
  name: string;
  url: string;
  sha256: string;
}

const REPO = 'https://github.com/kotilo-dev/kotilo-kit';
const DESCRIPTION = 'Offline, single-window developer toolbox: Base64, JSON, JWT, timestamps, regex, hashes and more.';

/** Pick the release asset for one installer type; exactly one must match. */
export function pick(assets: readonly Asset[], suffix: RegExp): Asset {
  const found = assets.filter((a) => suffix.test(a.name));
  if (found.length !== 1) throw new Error(`expected exactly one asset matching ${suffix}, found ${found.map((a) => a.name).join(', ') || 'none'}`);
  return found[0]!;
}

export function installers(assets: readonly Asset[]) {
  return {
    msi: pick(assets, /_x64_en-US\.msi$/),
    dmg: pick(assets, /_universal\.dmg$/),
    deb: pick(assets, /_amd64\.deb$/),
  };
}

export function winget(version: string, msi: Asset): Record<string, string> {
  const id = 'Kotilo.KotiloKit';
  const head = (type: string) => `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.1.6.0.schema.json\n`;
  return {
    [`${id}.yaml`]:
      head('version') +
      `PackageIdentifier: ${id}\nPackageVersion: ${version}\nDefaultLocale: en-US\nManifestType: version\nManifestVersion: 1.6.0\n`,
    [`${id}.installer.yaml`]:
      head('installer') +
      `PackageIdentifier: ${id}\nPackageVersion: ${version}\nInstallerType: wix\nScope: user\nInstallers:\n` +
      `  - Architecture: x64\n    InstallerUrl: ${msi.url}\n    InstallerSha256: ${msi.sha256.toUpperCase()}\n` +
      `ManifestType: installer\nManifestVersion: 1.6.0\n`,
    [`${id}.locale.en-US.yaml`]:
      head('defaultLocale') +
      `PackageIdentifier: ${id}\nPackageVersion: ${version}\nPackageLocale: en-US\nPublisher: Kotilo\nPublisherUrl: https://kotilo.dev\n` +
      `PackageName: Kotilo Kit\nPackageUrl: ${REPO}\nLicense: MIT\nLicenseUrl: ${REPO}/blob/main/LICENSE\n` +
      `ShortDescription: ${DESCRIPTION}\nTags:\n  - developer-tools\n  - base64\n  - json\n  - jwt\n  - offline\n` +
      `ReleaseNotesUrl: ${REPO}/releases/tag/v${version}\nManifestType: defaultLocale\nManifestVersion: 1.6.0\n`,
  };
}

/** AUR `kotilo-kit-bin`: repackages the .deb from the release. */
export function pkgbuild(version: string, deb: Asset): string {
  return `# Maintainer: Kotilo <https://kotilo.dev>
pkgname=kotilo-kit-bin
pkgver=${version}
pkgrel=1
pkgdesc="${DESCRIPTION}"
arch=('x86_64')
url="${REPO}"
license=('MIT')
depends=('webkit2gtk-4.1' 'gtk3' 'libayatana-appindicator')
provides=('kotilo-kit')
conflicts=('kotilo-kit')
source_x86_64=("kotilo-kit-\${pkgver}.deb::${deb.url}")
sha256sums_x86_64=('${deb.sha256}')

package() {
  bsdtar -xf data.tar.gz -C "\${pkgdir}"
}
`;
}

export function srcinfo(version: string, deb: Asset): string {
  return `pkgbase = kotilo-kit-bin
\tpkgdesc = ${DESCRIPTION}
\tpkgver = ${version}
\tpkgrel = 1
\turl = ${REPO}
\tarch = x86_64
\tlicense = MIT
\tdepends = webkit2gtk-4.1
\tdepends = gtk3
\tdepends = libayatana-appindicator
\tprovides = kotilo-kit
\tconflicts = kotilo-kit
\tsource_x86_64 = kotilo-kit-${version}.deb::${deb.url}
\tsha256sums_x86_64 = ${deb.sha256}

pkgname = kotilo-kit-bin
`;
}

/** Homebrew cask for the kotilo-dev/homebrew-tap tap. */
export function cask(version: string, dmg: Asset): string {
  const url = dmg.url.replaceAll(version, '#{version}');
  return `cask "kotilo-kit" do
  version "${version}"
  sha256 "${dmg.sha256}"

  url "${url}"
  name "Kotilo Kit"
  desc "Offline developer toolbox"
  homepage "${REPO}"

  depends_on macos: ">= :catalina"

  app "Kotilo Kit.app"

  zap trash: [
    "~/.config/kotilo/kit",
    "~/Library/Caches/dev.kotilo.kit",
    "~/Library/WebKit/dev.kotilo.kit",
  ]
end
`;
}

/** Map `gh release view --json assets` output (digest "sha256:…") to Asset[]. */
export function fromGh(json: { assets: { name: string; url: string; digest?: string }[] }): Asset[] {
  return json.assets.map((a) => {
    if (!a.digest?.startsWith('sha256:')) throw new Error(`${a.name}: release asset has no sha256 digest`);
    return { name: a.name, url: a.url, sha256: a.digest.slice('sha256:'.length) };
  });
}

export function renderAll(version: string, assets: readonly Asset[]): Record<string, string> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid version "${version}"`);
  const { msi, dmg, deb } = installers(assets);
  const out: Record<string, string> = {};
  for (const [file, text] of Object.entries(winget(version, msi))) out[`winget/${file}`] = text;
  out['aur/PKGBUILD'] = pkgbuild(version, deb);
  out['aur/.SRCINFO'] = srcinfo(version, deb);
  out['homebrew/Casks/kotilo-kit.rb'] = cask(version, dmg);
  return out;
}

const [, script, version, assetsFile, outDir] = process.argv;
if (script?.endsWith('render.ts') && version && assetsFile && outDir) {
  const files = renderAll(version, fromGh(JSON.parse(readFileSync(assetsFile, 'utf8'))));
  for (const [rel, text] of Object.entries(files)) {
    const path = join(outDir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
    console.log(path);
  }
}
