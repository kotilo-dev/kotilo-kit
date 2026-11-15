import { defaultConfig, type KitConfig } from '@kotilo/kit-core';
import { useState, type KeyboardEvent } from 'react';
import type { Host, Platform } from './host.js';
import { acceleratorFromEvent, acceleratorParts } from './hotkey.js';
import { SettingRow, type Tr } from './settingsParts.js';

const NODE_PLATFORM: Record<Platform, string> = { mac: 'darwin', windows: 'win32', linux: 'linux' };

/** In-app keys (Palette.tsx, FullWindow.tsx). `mod` = Ctrl, ⌘ on macOS. */
const PALETTE_KEYS: [string, string][] = [
  ['↑ ↓', 'settings.shortcuts.select'],
  ['Enter', 'settings.shortcuts.run'],
  ['mod Enter', 'settings.shortcuts.openFull'],
  ['mod 1–9', 'settings.shortcuts.runNth'],
  ['Tab', 'settings.shortcuts.options'],
  ['Alt …', 'settings.shortcuts.option'],
  ['Esc', 'settings.shortcuts.close'],
];
const FULL_KEYS: [string, string][] = [
  ['mod K', 'settings.shortcuts.search'],
  ['mod Shift C', 'settings.shortcuts.copy'],
  ['mod L', 'settings.shortcuts.clear'],
  ['Alt …', 'settings.shortcuts.option'],
  ['Esc', 'settings.shortcuts.back'],
];

type Status = { kind: 'idle' } | { kind: 'recording' } | { kind: 'error'; combo: string };

/** docs/02-design.md › 1.1.1 › Ayarlar › Kısayollar (mockup SettingsShortcuts.dc.html). */
export function SettingsShortcuts({ host, config, tr, monoFamily }: { host: Host; config: KitConfig; tr: Tr; monoFamily: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const mac = host.platform === 'mac';
  const current = config.general.hotkey;
  const fallback = defaultConfig({ platform: NODE_PLATFORM[host.platform] }).general.hotkey;
  const keys = (spec: string) => spec.replace(/\bmod\b/g, mac ? '⌘' : 'Ctrl').replace(/\bAlt\b/g, mac ? '⌥' : 'Alt');

  const apply = async (combo: string) => {
    if (combo === current) {
      setStatus({ kind: 'idle' });
      return;
    }
    try {
      await host.setHotkey?.(combo);
    } catch {
      setStatus({ kind: 'error', combo });
      return;
    }
    setStatus({ kind: 'idle' });
    await host.config.update((c) => ({ ...c, general: { ...c.general, hotkey: combo } }));
  };

  const onRecordKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (status.kind !== 'recording') return;
    e.preventDefault();
    // keep Esc from also leaving Settings (FullWindow listens on window)
    e.stopPropagation();
    if (e.key === 'Escape') {
      setStatus({ kind: 'idle' });
      return;
    }
    const combo = acceleratorFromEvent(e, host.platform);
    if (combo) void apply(combo);
  };

  const recording = status.kind === 'recording';
  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.shortcuts')}</h1>
      </div>

      <section className="kf-settings-card">
        <SettingRow title={tr('settings.shortcuts.palette')} desc={tr(host.setHotkey ? 'settings.shortcuts.paletteDesc' : 'settings.shortcuts.paletteFixed')}>
          <span className="kf-keys" style={{ fontFamily: monoFamily }} aria-label={current}>
            {recording ? (
              <span className="kf-keys-wait">{tr('settings.shortcuts.press')}</span>
            ) : (
              acceleratorParts(current, host.platform).map((p, i) => <kbd key={i}>{p}</kbd>)
            )}
          </span>
          {host.setHotkey && (
            <>
              <button
                className={`kf-btn${recording ? ' kf-btn-primary' : ''}`}
                aria-pressed={recording}
                onClick={() => setStatus(recording ? { kind: 'idle' } : { kind: 'recording' })}
                onKeyDown={onRecordKey}
                onBlur={() => recording && setStatus({ kind: 'idle' })}
              >
                {tr(recording ? 'settings.shortcuts.cancel' : 'settings.shortcuts.change')}
              </button>
              <button className="kf-btn kf-btn-ghost" disabled={current === fallback} onClick={() => void apply(fallback)}>
                {tr('settings.shortcuts.default')}
              </button>
            </>
          )}
        </SettingRow>
        {status.kind === 'error' && (
          <div className="kf-alert" role="alert">
            {tr('settings.shortcuts.conflict', { combo: status.combo, current })}
          </div>
        )}
      </section>

      <div className="kf-settings-grid">
        {(
          [
            ['settings.shortcuts.paletteKeys', PALETTE_KEYS],
            ['settings.shortcuts.fullKeys', FULL_KEYS],
          ] as const
        ).map(([title, list]) => (
          <section key={title} className="kf-settings-card">
            <h2>{tr(title)}</h2>
            <dl className="kf-keylist">
              {list.map(([spec, label]) => (
                <div key={spec + label}>
                  <dt style={{ fontFamily: monoFamily }}>{keys(spec)}</dt>
                  <dd>{tr(label)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="kf-settings-foot">{tr(mac ? 'settings.shortcuts.footMac' : 'settings.shortcuts.foot')}</p>
    </main>
  );
}
