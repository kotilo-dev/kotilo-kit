import type { KitConfig, Locale, Registry } from '@kotilo/kit-core';
import type { Host } from './host.js';
import { CheckIcon } from './icons.js';
import { CATEGORY_ACCENT } from './model.js';
import { SettingRow, type Tr } from './settingsParts.js';

/** A JWT: shows what "Suggested" looks like without touching the real clipboard. */
const SAMPLE = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.4pcPyMD09olPSyXnrXCjTwXyr4BsezdI1AVTmud2fU4';

/** docs/02-design.md › 1.1.1 › Ayarlar › Pano algılama (mockup SettingsClipboard.dc.html). */
export function SettingsClipboard({
  host,
  config,
  registry,
  locale,
  tr,
  monoFamily,
}: {
  host: Host;
  config: KitConfig;
  registry: Registry;
  locale: Locale;
  tr: Tr;
  monoFamily: string;
}) {
  const hits = registry.detect(SAMPLE, { limit: 3 });
  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.clipboard')}</h1>
      </div>

      <section className="kf-settings-card">
        <SettingRow title={tr('settings.clipboard.toggle')} desc={tr('settings.clipboard.toggleDesc')} htmlFor="kf-detect">
          <input
            id="kf-detect"
            className="kf-row-check"
            type="checkbox"
            checked={config.clipboard.detect === true}
            onChange={(e) => void host.config.update((c) => ({ ...c, clipboard: { detect: e.target.checked } }))}
          />
        </SettingRow>
      </section>

      <section className="kf-settings-card">
        <h2>{tr('settings.clipboard.howTitle')}</h2>
        <ul className="kf-facts">
          {['settings.clipboard.how1', 'settings.clipboard.how2', 'settings.clipboard.how3'].map((k) => (
            <li key={k}>
              <CheckIcon />
              {tr(k)}
            </li>
          ))}
        </ul>
      </section>

      <section className="kf-settings-card">
        <h2>{tr('settings.clipboard.example')}</h2>
        <div className="kf-sample">
          <div className="kf-sample-col">
            <span className="kf-sample-label">{tr('settings.clipboard.inClipboard')}</span>
            <code className="kf-path kf-sample-clip" style={{ fontFamily: monoFamily }}>
              {SAMPLE}
            </code>
          </div>
          <div className="kf-sample-col">
            <span className="kf-sample-label">{tr('ui.suggested')}</span>
            <ul className="kf-sample-list">
              {hits.map((h, i) => (
                <li key={h.tool.id} className={i === 0 ? 'kf-sample-on' : ''}>
                  <span className="kf-dot" style={{ background: `var(--kit-${CATEGORY_ACCENT[h.tool.category]})` }} />
                  <span className="kf-sample-name">{h.tool.name[locale]}</span>
                  <span className="kf-sample-score" style={{ fontFamily: monoFamily }}>
                    {h.score.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
