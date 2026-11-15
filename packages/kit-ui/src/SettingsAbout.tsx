import type { Host } from './host.js';
import type { Tr } from './settingsParts.js';

const LINKS: [string, string][] = [
  ['settings.about.website', 'kotilo.dev'],
  ['settings.about.source', 'github.com/kotilo-dev/kotilo-kit'],
  ['settings.about.issues', 'github.com/kotilo-dev/kotilo-kit/issues'],
];

/** docs/02-design.md › 1.1.1 › Ayarlar › Hakkında (mockup SettingsAbout.dc.html). Kit opens no browser: links are copied. */
export function SettingsAbout({
  host,
  version,
  counts,
  tr,
  monoFamily,
}: {
  host: Host;
  version: string;
  counts: { tools: number; plugins: number; pipelines: number };
  tr: Tr;
  monoFamily: string;
}) {
  const copy = async (text: string) => {
    await host.writeClipboard(text);
    host.notify(tr('ui.copied'));
  };
  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.about')}</h1>
      </div>

      <section className="kf-settings-card kf-about">
        <span className="kf-logo kf-logo-lg" aria-hidden="true" />
        <span className="kf-row-text">
          <span className="kf-about-title">
            <span className="kf-about-name">Kotilo Kit</span>
            <span className="kf-about-version" style={{ fontFamily: monoFamily }}>
              {version}
            </span>
          </span>
          <span className="kf-row-desc">{tr('settings.about.summary', counts)}</span>
        </span>
        <span className="kf-plugin-badge" style={{ fontFamily: monoFamily }}>
          <span className="kf-offline-dot" />
          {tr('settings.about.offline')}
        </span>
        <button className="kf-btn" onClick={() => void copy(`Kotilo Kit ${version} (${host.platform})`)}>
          {tr('settings.about.copyVersion')}
        </button>
      </section>

      <section className="kf-settings-card">
        <h2>{tr('settings.about.links')}</h2>
        <span className="kf-row-desc">{tr('settings.about.linksDesc')}</span>
        <dl className="kf-links">
          {LINKS.map(([label, url]) => (
            <div key={url}>
              <dt>{tr(label)}</dt>
              <dd style={{ fontFamily: monoFamily }}>{url}</dd>
              <button className="kf-mini" aria-label={tr('settings.about.copyLink', { name: tr(label) })} onClick={() => void copy(`https://${url}`)}>
                {tr('settings.about.copy')}
              </button>
            </div>
          ))}
        </dl>
      </section>

      <section className="kf-settings-card">
        <h2>{tr('settings.about.license')}</h2>
        <span className="kf-row-desc">{tr('settings.about.licenseMit')}</span>
        <span className="kf-row-desc">{tr('settings.about.licenseFonts')}</span>
      </section>
    </main>
  );
}
