import { stringifyPipeline, type Locale, type PipelineDef } from '@kotilo/kit-core';
import { useState } from 'react';
import type { Host } from './host.js';
import { CATEGORY_ACCENT } from './model.js';
import { uniqueName, type Pipelines } from './pipelines.js';

export interface SettingsPipelinesProps {
  host: Host;
  pipelines: Pipelines;
  locale: Locale;
  tr: (key: string, params?: Record<string, string | number>) => string;
  monoFamily: string;
  /** Open the editor (`def` absent = a new, empty pipeline). */
  onEdit: (def?: PipelineDef) => void;
}

/** Shown in "File format" until the user has a pipeline of their own. */
const EXAMPLE: PipelineDef = {
  name: 'jwt-scopes',
  palette: true,
  steps: [
    { tool: 'base64', opts: { mode: 'decode', urlSafe: true } },
    { tool: 'json', opts: { query: '$.scopes[*]' } },
  ],
};

/** docs/02-design.md › 1.1 › Ayarlar › Pipeline'lar (mockup SettingsPipelines.dc.html). */
export function SettingsPipelines({ host, pipelines, locale, tr, monoFamily, onEdit }: SettingsPipelinesProps) {
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const files = pipelines.loaded;
  const taken = (n: string) => Boolean(pipelines.registry.get(n)) || files.some((p) => p.name === n);
  const sample = files.find((p) => p.def && !p.issues.length)?.def ?? EXAMPLE;
  const dir = host.pipelines?.dir;
  const sep = dir?.includes('\\') ? '\\' : '/';

  const setPalette = (def: PipelineDef, palette: boolean) => void pipelines.save({ ...def, palette });
  const duplicate = (def: PipelineDef) => void pipelines.save({ ...def, name: uniqueName(`${def.name}-copy`, taken) });
  const remove = async (name: string, file: string) => {
    // keep the exact source so "Undo" restores the file byte for byte
    const source = (await host.pipelines?.list().catch(() => []))?.find((f) => f.file === file)?.source;
    await pipelines.remove(name);
    setNotice({
      text: tr('settings.pipelines.deleted', { name }),
      ...(source !== undefined ? { undo: () => void pipelines.restore(name, source).then(() => setNotice(null)) } : {}),
    });
  };

  return (
    <main className="kf-settings">
      <div className="kf-settings-head">
        <h1>{tr('settings.nav.pipelines')}</h1>
        <span className="kf-meta">{tr('settings.pipelines.files', { n: files.length })}</span>
        <span className="kf-spacer" />
        {host.pipelines?.openFolder && (
          <button className="kf-btn" onClick={() => host.pipelines?.openFolder?.()}>
            {tr('settings.pipelines.openFolder')}
          </button>
        )}
        <button className="kf-btn kf-btn-primary" onClick={() => onEdit()} disabled={!pipelines.available}>
          {tr('settings.pipelines.new')}
        </button>
      </div>
      <p className="kf-settings-intro">
        {tr('settings.pipelines.intro')}{' '}
        <code style={{ fontFamily: monoFamily }}>{`kotilo kit ${sample.name} < in.txt`}</code>
      </p>
      {notice && (
        <div className="kf-notice kf-notice-ok" role="status">
          {notice.text}
          {notice.undo && (
            <button className="kf-link-btn" onClick={notice.undo}>
              {tr('settings.pipelines.undo')}
            </button>
          )}
        </div>
      )}

      {files.length === 0 && <p className="kf-settings-empty">{tr('settings.pipelines.empty')}</p>}
      <ul className="kf-pipe-list">
        {files.map((p) => {
          const broken = p.issues.length > 0;
          const def = p.def;
          const missing = new Set(p.issues.filter((i) => i.code === 'error.pipeline.unknownTool').map((i) => i.step - 1));
          return (
            <li key={p.file} className={`kf-pipe-row${broken ? ' kf-pipe-row-error' : ''}`}>
              <div className="kf-pipe-row-main">
                <span className={`kf-dot kf-dot-pipe${broken ? ' kf-dot-pipe-off' : ''}`} />
                <span className="kf-pipe-row-name" style={{ fontFamily: monoFamily }}>
                  {p.name}
                </span>
                <span className="kf-pipe-chain">
                  {def?.steps.map((s, i) => {
                    const tool = pipelines.base.get(s.tool);
                    return (
                      <span key={i} className="kf-pipe-chain-step">
                        {i > 0 && <span className="kf-sep">→</span>}
                        {missing.has(i) || !tool ? (
                          <span className="kf-pipe-chain-missing" style={{ fontFamily: monoFamily }}>
                            {s.tool}
                          </span>
                        ) : (
                          <>
                            <span className="kf-dot" style={{ background: `var(--kit-${CATEGORY_ACCENT[tool.category]})` }} />
                            {tool.name[locale]}
                          </>
                        )}
                      </span>
                    );
                  })}
                </span>
                <label className="kf-check">
                  <input
                    type="checkbox"
                    checked={Boolean(def?.palette) && !broken}
                    disabled={broken || !def}
                    onChange={(e) => def && setPalette(def, e.target.checked)}
                  />
                  {tr('settings.pipelines.palette')}
                </label>
                <button className="kf-mini" disabled={!def} onClick={() => def && onEdit(def)}>
                  {tr('settings.pipelines.edit')}
                </button>
                <button className="kf-mini" disabled={!def} onClick={() => def && duplicate(def)}>
                  {tr('settings.pipelines.duplicate')}
                </button>
                <button className="kf-mini" aria-label={tr('settings.pipelines.deleteLabel', { name: p.name })} onClick={() => void remove(p.name, p.file)}>
                  {tr('settings.pipelines.delete')}
                </button>
              </div>
              {broken && (
                <div className="kf-pipe-row-msg">
                  {tr(p.issues[0]!.code, p.issues[0]!.params)} {tr('settings.pipelines.hidden')}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="kf-panel kf-pipe-format">
        <div className="kf-panel-head">
          <h2 className="kf-panel-title">{tr('settings.pipelines.fileFormat')}</h2>
          <span className="kf-meta" style={{ fontFamily: monoFamily }}>
            {dir ? `${dir}${sep}${sample.name}.toml` : `${sample.name}.toml`}
          </span>
        </div>
        <pre className="kf-pipe-toml" style={{ fontFamily: monoFamily }}>
          {stringifyPipeline(sample)}
        </pre>
      </section>
    </main>
  );
}
