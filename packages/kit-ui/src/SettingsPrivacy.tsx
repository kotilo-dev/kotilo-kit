import type { KitConfig } from '@kotilo/kit-core';
import type { Host } from './host.js';
import { ShieldIcon } from './icons.js';
import { configFolder, type Tr } from './settingsParts.js';

const FILES: [string, string][] = [
  ['config.toml', 'settings.privacy.fileConfig'],
  ['themes.toml', 'settings.privacy.fileThemes'],
  ['pipelines/', 'settings.privacy.filePipelines'],
  ['tools/', 'settings.privacy.fileTools'],
];

/** docs/02-design.md › 1.1.1 › Ayarlar › Gizlilik (mockup SettingsPrivacy.dc.html). */
export function SettingsPrivacy({ host, config, tr, monoFamily }: { host: Host; config: KitConfig; tr: Tr; monoFamily: string }) {
  const recent = config.recent.ids;
  const folder = configFolder(host.configPath);
  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.privacy')}</h1>
      </div>

      <div className="kf-settings-grid kf-grid-3">
        {(['network', 'telemetry', 'history'] as const).map((k) => (
          <section key={k} className="kf-settings-card">
            <h2 className="kf-pledge">
              <ShieldIcon />
              {tr(`settings.privacy.${k}`)}
            </h2>
            <span className="kf-row-desc">{tr(`settings.privacy.${k}Desc`)}</span>
          </section>
        ))}
      </div>

      <section className="kf-settings-card">
        <div className="kf-card-head">
          <h2>{tr('settings.privacy.recent')}</h2>
          <span className="kf-spacer" />
          <button
            className="kf-btn"
            disabled={!recent.length}
            onClick={() => void host.config.update((c) => ({ ...c, recent: { ids: [], used: [] } }))}
          >
            {tr('settings.privacy.clearRecent')}
          </button>
        </div>
        <span className="kf-row-desc">{tr('settings.privacy.recentDesc')}</span>
        {recent.length ? (
          <ul className="kf-chips" aria-label={tr('settings.privacy.recent')} style={{ fontFamily: monoFamily }}>
            {recent.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        ) : (
          <span className="kf-row-desc kf-muted">{tr('settings.privacy.recentEmpty')}</span>
        )}
      </section>

      <section className="kf-settings-card">
        <div className="kf-card-head">
          <h2>{tr('settings.privacy.onDisk')}</h2>
          <span className="kf-spacer" />
          {host.openConfigFolder && (
            <button className="kf-btn" onClick={() => host.openConfigFolder?.()}>
              {tr('settings.openFolder')}
            </button>
          )}
        </div>
        <dl className="kf-keylist kf-filelist">
          {FILES.map(([file, label]) => (
            <div key={file}>
              <dt style={{ fontFamily: monoFamily }}>{file}</dt>
              <dd>{tr(label)}</dd>
            </div>
          ))}
        </dl>
        {folder && (
          <code className="kf-path-plain" style={{ fontFamily: monoFamily }}>
            {folder}
          </code>
        )}
      </section>
    </main>
  );
}
