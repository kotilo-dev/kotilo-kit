import type { KitConfig } from '@kotilo/kit-core';
import { primaryThemes, themes, themesToToml, withUserThemes, type Theme } from '@kotilo/kit-themes';
import { useState } from 'react';
import type { Host } from './host.js';
import { MONO_FONTS, parseUserThemes } from './theme.js';

/** Settings sidebar (docs/02-design.md › Ayarlar). Only Appearance has a screen in the mockup so far. */
export const SETTINGS_SECTIONS = ['general', 'appearance', 'shortcuts', 'clipboard', 'plugins', 'pipelines', 'privacy', 'about'] as const;
const ACCENTS = ['blue', 'mauve', 'green', 'yellow', 'peach', 'red', 'teal'] as const;

export interface SettingsProps {
  host: Host;
  config: KitConfig;
  /** Built-in + user themes. */
  list: readonly Theme[];
  tr: (key: string, params?: Record<string, string | number>) => string;
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

export function SettingsNav({ tr }: { tr: SettingsProps['tr'] }) {
  return (
    <nav className="kf-nav kf-settings-nav" aria-label={tr('settings.title')}>
      {SETTINGS_SECTIONS.map((s) =>
        s === 'appearance' ? (
          <a key={s} href="#appearance" className="kf-tool kf-tool-on" aria-current="page" onClick={(e) => e.preventDefault()}>
            <span className="kf-tool-name">{tr(`settings.nav.${s}`)}</span>
          </a>
        ) : (
          <span key={s} className="kf-tool kf-tool-off" aria-disabled="true" title={tr('settings.soon')}>
            <span className="kf-tool-name">{tr(`settings.nav.${s}`)}</span>
          </span>
        ),
      )}
    </nav>
  );
}

export function SettingsAppearance({ host, config, list, tr }: SettingsProps) {
  const [notice, setNotice] = useState<Notice>(null);
  const theme = config.theme;
  const set = <K extends keyof KitConfig['theme']>(key: K, value: KitConfig['theme'][K]) =>
    void host.config.update((c) => ({ ...c, theme: { ...c.theme, [key]: value } }));

  // 7 built-in cards (dark variants; their light pair is used by "follow system") + every user theme
  const builtinIds = new Set(themes.map((t) => t.id));
  const cards = [...primaryThemes, ...list.filter((t) => !builtinIds.has(t.id))];
  // config may hold a built-in light variant (e.g. catppuccin-latte): its dark card is the selected one
  const selectedId = cards.find((c) => c.id === theme.id)?.id ?? cards.find((c) => c.pair === theme.id)?.id;

  const importTheme = async () => {
    setNotice(null);
    if (!host.userThemes) return;
    const file = await host.openFile().catch(() => null);
    if (!file) return;
    const parsed = parseUserThemes(await file.text());
    if (!parsed.themes.length) {
      setNotice({ kind: 'error', text: tr('settings.importFailed', { detail: parsed.warnings[0] ?? tr('settings.noThemes') }) });
      return;
    }
    const { skipped } = withUserThemes(parsed.themes);
    const fresh = parsed.themes.filter((t) => !skipped.includes(t.id));
    if (!fresh.length) {
      setNotice({ kind: 'error', text: tr('settings.importBuiltin', { ids: skipped.join(', ') }) });
      return;
    }
    // existing user themes, with same-id ones replaced by the imported version
    const current = parseUserThemes(await host.userThemes.read().catch(() => '')).themes;
    const merged = [...current.filter((t) => !fresh.some((f) => f.id === t.id)), ...fresh];
    await host.userThemes.write(themesToToml(merged));
    set('id', fresh[0]!.id);
    const warn = parsed.warnings.length ? ` ${tr('settings.importWarnings', { n: parsed.warnings.length, first: parsed.warnings[0]! })}` : '';
    setNotice({ kind: parsed.warnings.length ? 'error' : 'ok', text: tr('settings.imported', { n: fresh.length }) + warn });
  };

  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.theme')}</h1>
        <span className="kf-spacer" />
        <label className="kf-check">
          <input type="checkbox" checked={theme.follow_system} onChange={(e) => set('follow_system', e.target.checked)} />
          {tr('settings.followSystem')}
        </label>
        <button className="kf-btn" onClick={() => void importTheme()} disabled={!host.userThemes}>
          {tr('settings.importTheme')}
        </button>
      </div>
      {notice && (
        <div className={`kf-notice kf-notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </div>
      )}

      <div className="kf-cards" role="radiogroup" aria-label={tr('settings.theme')}>
        {cards.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={t.id === selectedId}
            className={`kf-card${t.id === selectedId ? ' kf-card-on' : ''}`}
            onClick={() => set('id', t.id)}
          >
            {/* data-theme scopes the --kit-* variables to this card: its own colors, no hex in code */}
            <span className="kf-card-preview" data-theme={t.id}>
              <span className="kf-card-lines">
                <span className="kf-card-line kf-card-line-text" />
                <span className="kf-card-line kf-card-line-sub" />
              </span>
              <span className="kf-card-swatches">
                {ACCENTS.map((a) => (
                  <span key={a} className="kf-swatch" style={{ background: `var(--kit-${a})` }} />
                ))}
              </span>
            </span>
            <span className="kf-card-label">
              <span className="kf-card-name">{t.name}</span>
              <span className="kf-card-id">{t.id}</span>
            </span>
          </button>
        ))}
        <button className="kf-card-add" onClick={() => void importTheme()} disabled={!host.userThemes}>
          {tr('settings.customTheme')}
        </button>
      </div>

      <div className="kf-settings-grid">
        <section className="kf-settings-card">
          <h2>{tr('settings.font')}</h2>
          <label className="kf-setting">
            <span className="kf-setting-label">{tr('settings.mono')}</span>
            <select aria-label={tr('settings.mono')} value={theme.font} onChange={(e) => set('font', e.target.value)}>
              {MONO_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="kf-setting">
            <span className="kf-setting-label">{tr('settings.size')}</span>
            <input aria-label={tr('settings.size')} type="range" min={11} max={18} value={theme.size} onChange={(e) => set('size', e.target.valueAsNumber)} />
            <span className="kf-setting-value">{theme.size}</span>
          </label>
          <label className="kf-check">
            <input type="checkbox" checked={theme.ligatures} onChange={(e) => set('ligatures', e.target.checked)} />
            {tr('settings.ligatures')}
          </label>
        </section>
        <section className="kf-settings-card">
          <h2>{tr('settings.window')}</h2>
          <label className="kf-setting">
            <span className="kf-setting-label">{tr('settings.paletteOpacity')}</span>
            <input
              aria-label={tr('settings.paletteOpacity')}
              type="range"
              min={60}
              max={100}
              value={theme.palette_opacity}
              onChange={(e) => set('palette_opacity', e.target.valueAsNumber)}
            />
            <span className="kf-setting-value">{theme.palette_opacity}</span>
          </label>
          <label className="kf-setting">
            <span className="kf-setting-label">{tr('settings.radius')}</span>
            <input aria-label={tr('settings.radius')} type="range" min={0} max={16} value={theme.radius} onChange={(e) => set('radius', e.target.valueAsNumber)} />
            <span className="kf-setting-value">{theme.radius}</span>
          </label>
          <label className="kf-check">
            <input type="checkbox" checked={theme.compact} onChange={(e) => set('compact', e.target.checked)} />
            {tr('settings.compact')}
          </label>
        </section>
      </div>
    </main>
  );
}
