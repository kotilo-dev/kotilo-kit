import { describe, expect, it } from 'vitest';
import { cask, fromGh, pick, renderAll, type Asset } from '../render.js';

const base = 'https://github.com/kotilo-dev/kotilo-kit/releases/download/v1.0.0';
const sha = (c: string) => c.repeat(64);
const gh = {
  assets: [
    { name: 'Kotilo.Kit_1.0.0_x64_en-US.msi', url: `${base}/Kotilo.Kit_1.0.0_x64_en-US.msi`, digest: `sha256:${sha('a')}` },
    { name: 'Kotilo.Kit_1.0.0_x64-setup.exe', url: `${base}/Kotilo.Kit_1.0.0_x64-setup.exe`, digest: `sha256:${sha('b')}` },
    { name: 'Kotilo.Kit_1.0.0_universal.dmg', url: `${base}/Kotilo.Kit_1.0.0_universal.dmg`, digest: `sha256:${sha('c')}` },
    { name: 'Kotilo.Kit_1.0.0_amd64.deb', url: `${base}/Kotilo.Kit_1.0.0_amd64.deb`, digest: `sha256:${sha('d')}` },
    { name: 'Kotilo.Kit_1.0.0_amd64.AppImage', url: `${base}/Kotilo.Kit_1.0.0_amd64.AppImage`, digest: `sha256:${sha('e')}` },
  ],
};

describe('packaging manifests', () => {
  const files = renderAll('1.0.0', fromGh(gh));

  it('renders winget, AUR and Homebrew files', () => {
    expect(Object.keys(files).sort()).toEqual([
      'aur/.SRCINFO',
      'aur/PKGBUILD',
      'homebrew/Casks/kotilo-kit.rb',
      'winget/Kotilo.KotiloKit.installer.yaml',
      'winget/Kotilo.KotiloKit.locale.en-US.yaml',
      'winget/Kotilo.KotiloKit.yaml',
    ]);
  });

  it('winget points at the MSI with an upper-case hash', () => {
    const inst = files['winget/Kotilo.KotiloKit.installer.yaml']!;
    expect(inst).toContain(`InstallerUrl: ${base}/Kotilo.Kit_1.0.0_x64_en-US.msi`);
    expect(inst).toContain(`InstallerSha256: ${sha('A')}`);
    expect(inst).toContain('PackageVersion: 1.0.0');
    expect(files['winget/Kotilo.KotiloKit.locale.en-US.yaml']).toContain('License: MIT');
  });

  it('AUR repackages the .deb', () => {
    expect(files['aur/PKGBUILD']).toContain('pkgver=1.0.0');
    expect(files['aur/PKGBUILD']).toContain(`sha256sums_x86_64=('${sha('d')}')`);
    expect(files['aur/PKGBUILD']).toContain('bsdtar -xf data.tar.gz -C "${pkgdir}"');
    expect(files['aur/.SRCINFO']).toContain(`source_x86_64 = kotilo-kit-1.0.0.deb::${base}/Kotilo.Kit_1.0.0_amd64.deb`);
  });

  it('the cask uses #{version} in the URL', () => {
    const rb = files['homebrew/Casks/kotilo-kit.rb']!;
    expect(rb).toContain('version "1.0.0"');
    expect(rb).toContain(`sha256 "${sha('c')}"`);
    expect(rb).toContain('url "https://github.com/kotilo-dev/kotilo-kit/releases/download/v#{version}/Kotilo.Kit_#{version}_universal.dmg"');
    expect(rb).toContain('app "Kotilo Kit.app"');
  });

  it('fails loudly on missing, ambiguous or unhashed assets and bad versions', () => {
    const assets: Asset[] = fromGh(gh);
    expect(() => pick(assets.slice(1), /_x64_en-US\.msi$/)).toThrow(/found none/);
    expect(() => pick([...assets, assets[0]!], /_x64_en-US\.msi$/)).toThrow(/exactly one/);
    expect(() => fromGh({ assets: [{ name: 'x', url: 'u' }] })).toThrow(/no sha256/);
    expect(() => renderAll('v1.0', assets)).toThrow(/invalid version/);
    expect(cask('1.0.0', assets[2]!)).toContain('zap trash');
  });
});
