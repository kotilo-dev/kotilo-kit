import { PLUGIN_CPU_MS, PLUGIN_MEMORY_BYTES, type Locale } from '@kotilo/kit-core';
import { useState } from 'react';
import type { Host } from './host.js';
import { CheckIcon, ShieldIcon } from './icons.js';
import { KitAddDialog } from './KitAddDialog.js';
import { CATEGORY_ACCENT } from './model.js';
import type { Plugins } from './plugins.js';

export interface SettingsPluginsProps {
  host: Host;
  plugins: Plugins;
  locale: Locale;
  tr: (key: string, params?: Record<string, string | number>) => string;
  monoFamily: string;
}

/** docs/02-design.md › 1.1 › Ayarlar › Eklentiler (mockup SettingsPlugins.dc.html). */
export function SettingsPlugins({ host, plugins, locale, tr, monoFamily }: SettingsPluginsProps) {
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [adding, setAdding] = useState(false);
  const failed = plugins.loaded.filter((p) => p.error).length;
  const enabled = plugins.loaded.filter((p) => p.tool && !plugins.disabled.has(p.tool.id)).length;
  const dir = host.plugins?.dir ?? '';

  const remove = async (file: string, label: string) => {
    const source = await plugins.remove(file);
    setNotice({
      text: tr('settings.plugins.removed', { name: label }),
      ...(source !== undefined ? { undo: () => void plugins.restore(file, source).then(() => setNotice(null)) } : {}),
    });
  };

  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.plugins')}</h1>
        <span className="kf-meta">{tr('settings.plugins.summary', { enabled, failed })}</span>
        <span className="kf-spacer" />
        {host.plugins?.openFolder && (
          <button className="kf-btn" onClick={() => host.plugins?.openFolder?.()}>
            {tr('settings.plugins.openFolder')}
          </button>
        )}
        {plugins.canInstall && (
          <button className="kf-btn kf-btn-primary" onClick={() => setAdding(true)}>
            {tr('settings.plugins.add')}
          </button>
        )}
      </div>

      <div className="kf-plugin-info">
        <ShieldIcon />
        <span>{tr('settings.plugins.sandbox', { ms: PLUGIN_CPU_MS, mb: PLUGIN_MEMORY_BYTES / 1024 / 1024 })}</span>
        <span className="kf-spacer" />
        {dir && (
          <code className="kf-plugin-dir" style={{ fontFamily: monoFamily }}>
            {dir}
          </code>
        )}
      </div>

      {notice && (
        <div className="kf-notice kf-notice-ok" role="status">
          {notice.text}
          {notice.undo && (
            <button className="kf-link-btn" onClick={notice.undo}>
              {tr('settings.plugins.undo')}
            </button>
          )}
        </div>
      )}

      {plugins.loading && <p className="kf-settings-empty">{tr('settings.plugins.loading')}</p>}
      {!plugins.loading && plugins.loaded.length === 0 && <p className="kf-settings-empty">{tr('settings.plugins.empty')}</p>}

      <ul className="kf-plugin-list">
        {plugins.loaded.map((p) => {
          const tool = p.tool;
          const label = tool ? tool.name[locale] : p.display.replace(/^tools\//, '').replace(/\.ts$/, '');
          const version = plugins.versionOf(p);
          return (
            <li key={p.file} className={`kf-plugin${p.error ? ' kf-plugin-error' : ''}`}>
              <div className="kf-plugin-main">
                <span
                  className={`kf-plugin-icon${tool ? '' : ' kf-plugin-icon-off'}`}
                  style={tool ? { background: `color-mix(in srgb, var(--kit-${CATEGORY_ACCENT[tool.category]}) 18%, transparent)` } : undefined}
                >
                  <span className="kf-dot" style={tool ? { background: `var(--kit-${CATEGORY_ACCENT[tool.category]})` } : undefined} />
                </span>
                <span className="kf-plugin-text">
                  <span className="kf-plugin-title">
                    <span className="kf-plugin-name">{label}</span>
                    <span className="kf-plugin-id" style={{ fontFamily: monoFamily }}>
                      {tool ? `${tool.id} · ${version ?? p.display}` : p.display}
                    </span>
                  </span>
                  {tool && <span className="kf-plugin-desc">{tool.description[locale]}</span>}
                </span>
                {version ? (
                  <span className="kf-plugin-badge kf-plugin-badge-kit">
                    <CheckIcon />
                    {tr('settings.plugins.kitTools')}
                  </span>
                ) : (
                  <span className="kf-plugin-badge">{tr('settings.plugins.local')}</span>
                )}
                {tool ? (
                  <label className="kf-check">
                    <input type="checkbox" checked={!plugins.disabled.has(tool.id)} onChange={(e) => void plugins.setEnabled(tool.id, e.target.checked)} />
                    {tr('settings.plugins.enabled')}
                  </label>
                ) : (
                  <button className="kf-mini" onClick={plugins.reload}>
                    {tr('settings.plugins.reload')}
                  </button>
                )}
                <button className="kf-mini" aria-label={tr('settings.plugins.removeLabel', { name: label })} onClick={() => void remove(p.file, label)}>
                  {tr('settings.plugins.remove')}
                </button>
              </div>
              {p.error && (
                <div className="kf-plugin-msg" style={{ fontFamily: monoFamily }} role="alert">
                  {tr('settings.plugins.failed', { detail: `${p.error.loc ? `${p.error.loc} ` : ''}${tr(p.error.code, p.error.params)}` })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="kf-plugin-foot">{tr('settings.plugins.footer')}</p>

      {adding && (
        <KitAddDialog
          locale={locale}
          tr={tr}
          monoFamily={monoFamily}
          install={plugins.install}
          onCancel={() => setAdding(false)}
          onDone={(text) => {
            setAdding(false);
            setNotice({ text });
          }}
        />
      )}
    </main>
  );
}
