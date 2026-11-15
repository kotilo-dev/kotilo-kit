import type { KitConfig, Locale } from '@kotilo/kit-core';
import type { Host } from './host.js';
import { SettingRow, type Tr } from './settingsParts.js';

const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'tr', label: 'Türkçe' },
];

/** docs/02-design.md › 1.1.1 › Ayarlar › Genel (mockup SettingsGeneral.dc.html). */
export function SettingsGeneral({ host, config, tr, monoFamily }: { host: Host; config: KitConfig; tr: Tr; monoFamily: string }) {
  const setGeneral = <K extends keyof KitConfig['general']>(key: K, value: KitConfig['general'][K]) =>
    void host.config.update((c) => ({ ...c, general: { ...c.general, [key]: value } }));

  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.general')}</h1>
      </div>

      <section className="kf-settings-card kf-rows">
        <SettingRow title={tr('settings.general.language')} desc={tr('settings.general.languageDesc')}>
          <div className="kf-seg" role="group" aria-label={tr('settings.general.language')}>
            {LOCALES.map((l) => (
              <button
                key={l.id}
                lang={l.id}
                aria-pressed={config.general.locale === l.id}
                className={config.general.locale === l.id ? 'kf-seg-on' : ''}
                onClick={() => setGeneral('locale', l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow title={tr('settings.general.startHidden')} desc={tr('settings.general.startHiddenDesc')} htmlFor="kf-start-hidden">
          <input
            id="kf-start-hidden"
            className="kf-row-check"
            type="checkbox"
            checked={config.general.start_hidden}
            onChange={(e) => setGeneral('start_hidden', e.target.checked)}
          />
        </SettingRow>
      </section>

      {host.configPath && (
        <section className="kf-settings-card">
          <div className="kf-card-head">
            <h2>{tr('settings.general.configFile')}</h2>
            <span className="kf-spacer" />
            {host.openConfigFolder && (
              <button className="kf-btn" onClick={() => host.openConfigFolder?.()}>
                {tr('settings.openFolder')}
              </button>
            )}
          </div>
          <span className="kf-row-desc">{tr('settings.general.configFileDesc')}</span>
          <code className="kf-path" style={{ fontFamily: monoFamily }}>
            {host.configPath}
          </code>
        </section>
      )}
    </main>
  );
}
