import {
  createContext,
  resolveOptions,
  resultText,
  runPipelineSteps,
  t as translate,
  type Locale,
  type OptionValue,
  type PipelineDef,
  type Tool,
  type ToolResult,
} from '@kotilo/kit-core';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Host } from './host.js';
import { CopyIcon, SmallSearchIcon } from './icons.js';
import { CATEGORY_ACCENT, summarizeOutput, utf8Length } from './model.js';
import { OptionControl } from './OptionControl.js';
import { changedOptions, nameProblem, type Pipelines } from './pipelines.js';

export interface EditorSeed {
  def: PipelineDef;
  /** Name of the file being edited; absent for a new pipeline. */
  previousName?: string;
  input?: string;
}

export interface PipelineEditorProps {
  host: Host;
  pipelines: Pipelines;
  seed: EditorSeed;
  locale: Locale;
  tr: (key: string, params?: Record<string, string | number>) => string;
  mono: CSSProperties;
  nf: Intl.NumberFormat;
  onClose: () => void;
}

interface StepState {
  key: number;
  tool: string;
  /** Full option values (defaults filled in); only changed ones are saved. */
  opts: Record<string, OptionValue>;
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const isBlank = (r: ToolResult) => !r.bytes && (typeof r.output === 'string' ? r.output === '' : r.output.rows.length === 0);

/** docs/02-design.md › 1.1 › Pipeline düzenleyici (mockup PipelineEditor.dc.html). */
export function PipelineEditor({ host, pipelines, seed, locale, tr, mono, nf, onClose }: PipelineEditorProps) {
  const { base } = pipelines;
  const nextKey = useRef(0);
  const toState = (s: PipelineDef['steps'][number]): StepState => {
    const tool = base.get(s.tool);
    return { key: nextKey.current++, tool: s.tool, opts: tool ? resolveOptions(tool.options, s.opts) : { ...s.opts } };
  };

  const [name, setName] = useState(seed.def.name);
  const [palette, setPalette] = useState(seed.def.palette);
  const [steps, setSteps] = useState<StepState[]>(() => seed.def.steps.map(toState));
  const [selected, setSelected] = useState(Math.max(0, seed.def.steps.length - 1));
  const [previousName, setPreviousName] = useState(seed.previousName);
  const [input, setInput] = useState(seed.input ?? '');
  const [shownStep, setShownStep] = useState<number | null>(null); // null = last
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState({ query: '', sel: 0 });
  const [notice, setNotice] = useState<Notice>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) pickRef.current?.focus();
  }, [adding]);

  const toolOf = (id: string): Tool<any> | undefined => base.get(id);
  const def = (): PipelineDef => ({
    name,
    palette,
    steps: steps.map((s) => {
      const tool = toolOf(s.tool);
      return { tool: s.tool, opts: tool ? changedOptions(tool, s.opts) : s.opts };
    }),
  });

  // ---------- live run ----------
  const deferredInput = useDeferredValue(input);
  const runKey = JSON.stringify(steps.map((s) => [s.tool, s.opts]));
  const run = useMemo(() => {
    const d: PipelineDef = { name: 'editor', palette: true, steps: steps.map((s) => ({ tool: s.tool, opts: s.opts })) };
    if (!d.steps.length) return null;
    return runPipelineSteps(d, base, deferredInput, createContext({ locale, now: host.now() }));
    // runKey stands for the step list by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, base, deferredInput, locale, host]);

  // steps whose output can be shown: those that ran, plus the one that failed (or is invalid)
  const failIdx = run?.error ? Math.max(0, run.error.step - 1) : -1;
  const available = run ? [...run.steps.map((_, j) => j), ...(failIdx >= run.steps.length ? [failIdx] : [])] : [];
  const lastIndex = available.length ? available[available.length - 1]! : -1;
  const shown = shownStep !== null && available.includes(shownStep) ? shownStep : lastIndex;
  const shownResult = run?.steps[shown]?.result;
  const shownError = run?.error && shown === failIdx ? translate(locale, run.error.code, run.error.params) : null;
  const blank = !deferredInput.trim();
  const outcome: 'empty' | 'ok' | 'error' =
    !run ? 'empty' : shownError ? (blank ? 'empty' : 'error') : shownResult ? (blank && isBlank(shownResult) ? 'empty' : 'ok') : 'empty';

  // ---------- steps ----------
  const updateStep = (i: number, key: string, value: OptionValue) =>
    setSteps((list) => list.map((s, j) => (j === i ? { ...s, opts: { ...s.opts, [key]: value } } : s)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      setSelected(j);
      return copy;
    });
  const removeStep = (i: number) => {
    setSteps((list) => list.filter((_, j) => j !== i));
    setSelected((s) => Math.max(0, s > i ? s - 1 : Math.min(s, steps.length - 2)));
    setShownStep(null);
  };

  const pickList = useMemo(() => {
    const q = pick.query.trim();
    const all = q ? base.search(q, { limit: 8 }).map((h) => h.tool) : base.tools.slice(0, 8);
    return all.filter((tool) => tool.category !== 'pipeline');
  }, [pick.query, base]);

  const addStep = (tool: Tool<any>) => {
    setSteps((list) => [...list, { key: nextKey.current++, tool: tool.id, opts: resolveOptions(tool.options, {}) }]);
    setSelected(steps.length);
    setShownStep(null);
    setAdding(false);
    setPick({ query: '', sel: 0 });
  };

  const onPickKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = pickList.length;
      if (n) setPick((p) => ({ ...p, sel: (p.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const tool = pickList[Math.min(pick.sel, pickList.length - 1)];
      if (tool) addStep(tool);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAdding(false);
    }
  };

  // ctrl/⌘ + Enter opens the step picker (mockup's "ctrl ↵" badge)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = host.platform === 'mac' ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host]);

  // ---------- save ----------
  const problem = nameProblem(name, pipelines, previousName) ?? (steps.length ? null : 'pipeline.noSteps');
  const sep = host.pipelines?.dir?.includes('\\') ? '\\' : '/';
  const filePath = host.pipelines?.dir ? `${host.pipelines.dir}${sep}${name || '…'}.toml` : `${name}.toml`;

  const save = async () => {
    if (problem) {
      setNotice({ kind: 'error', text: tr(problem) });
      return;
    }
    try {
      await pipelines.save(def(), previousName);
      setPreviousName(name);
      setNotice({ kind: 'ok', text: tr('pipeline.saved', { file: filePath }) });
    } catch (e) {
      setNotice({ kind: 'error', text: tr('pipeline.saveFailed', { detail: e instanceof Error ? e.message : String(e) }) });
    }
  };

  const copy = async () => {
    if (outcome !== 'ok' || !shownResult) return;
    await host.writeClipboard(resultText(shownResult));
    host.notify(tr('ui.copied'));
  };

  const flowLabel = (r: ToolResult | undefined) =>
    tr(r?.bytes ? 'pipeline.flowBytes' : r && typeof r.output !== 'string' ? 'pipeline.flowTable' : 'pipeline.flowText');

  let outMeta = '';
  if (outcome === 'ok' && shownResult) {
    const s = summarizeOutput(shownResult);
    const size =
      s.kind === 'binary'
        ? tr('ui.binaryMeta', { bytes: nf.format(s.bytes) })
        : s.kind === 'rows'
          ? tr('ui.rowsMeta', { rows: nf.format(s.rows) })
          : tr('ui.charsMeta', { chars: nf.format(s.chars) });
    outMeta = tr('pipeline.outMeta', { size, ms: nf.format(Math.round(run!.steps[shown]!.ms)) });
  }

  return (
    <main className="kf-main">
      <div className="kf-head">
        <span className="kf-pipe-crumb">{tr('pipeline.crumb')}</span>
        <span className="kf-crumb-sep">/</span>
        <input
          className="kf-pipe-name"
          aria-label={tr('pipeline.nameLabel')}
          aria-invalid={nameProblem(name, pipelines, previousName) ? true : undefined}
          value={name}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          style={{ fontFamily: mono.fontFamily }}
        />
        <span className="kf-meta">{tr('pipeline.meta', { n: steps.length })}</span>
        <span className="kf-spacer" />
        <label className="kf-check">
          <input type="checkbox" checked={palette} onChange={(e) => setPalette(e.target.checked)} />
          {tr('pipeline.showInPalette')}
        </label>
        <button className="kf-btn" onClick={onClose}>
          {tr('pipeline.cancel')}
        </button>
        <button className="kf-btn kf-btn-primary" onClick={() => void save()}>
          {tr('pipeline.save')}
        </button>
      </div>
      {notice && (
        <div className={`kf-notice kf-notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </div>
      )}

      <div className="kf-pipe-grid">
        <section className="kf-panel" aria-label={tr('pipeline.steps')}>
          <div className="kf-panel-head">
            <span className="kf-panel-title">{tr('pipeline.steps')}</span>
            <span className="kf-meta">{tr('pipeline.stepsHint')}</span>
          </div>
          <ol className="kf-steps">
            {steps.length === 0 && <li className="kf-steps-empty">{tr('pipeline.emptySteps')}</li>}
            {steps.map((s, i) => {
              const tool = toolOf(s.tool);
              const failed = run?.error && run.error.step === i + 1;
              return [
                i > 0 && (
                  <li key={`flow-${s.key}`} className="kf-flow" aria-hidden="true">
                    {flowLabel(run?.steps[i - 1]?.result)}
                  </li>
                ),
                <li
                  key={s.key}
                  className={`kf-step${i === selected ? ' kf-step-on' : ''}${failed || !tool ? ' kf-step-error' : ''}`}
                  onFocusCapture={() => setSelected(i)}
                  onClick={() => setSelected(i)}
                >
                  <div className="kf-step-head">
                    <span className="kf-step-num">{i + 1}</span>
                    {tool ? (
                      <span className="kf-dot" style={{ background: `var(--kit-${CATEGORY_ACCENT[tool.category]})` }} />
                    ) : (
                      <span className="kf-dot kf-dot-missing" />
                    )}
                    <span className={`kf-step-name${tool ? '' : ' kf-step-missing'}`}>{tool ? tool.name[locale] : s.tool}</span>
                    <button className="kf-step-btn" aria-label={tr('pipeline.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button
                      className="kf-step-btn"
                      aria-label={tr('pipeline.moveDown')}
                      disabled={i === steps.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button className="kf-step-btn" aria-label={tr('pipeline.removeStep')} onClick={() => removeStep(i)}>
                      ×
                    </button>
                  </div>
                  {!tool && <div className="kf-step-msg">{tr('pipeline.unknownTool', { tool: s.tool })}</div>}
                  {tool && tool.options.length > 0 && (
                    <div className="kf-step-opts">
                      {tool.options.map((o) => (
                        <OptionControl
                          key={o.key}
                          option={o}
                          value={s.opts[o.key] ?? o.default}
                          onChange={(v) => updateStep(i, o.key, v)}
                          label={tr(`tool.${tool.id}.opt.${o.key}`)}
                          valueLabel={(v) => tr(`tool.${tool.id}.opt.${o.key}.${v}`)}
                          monoFamily={String(mono.fontFamily)}
                        />
                      ))}
                    </div>
                  )}
                </li>,
              ];
            })}
            <li className="kf-step-add-wrap">
              {adding ? (
                <div className="kf-pick">
                  <div className="kf-pick-search">
                    <SmallSearchIcon />
                    <input
                      ref={pickRef}
                      aria-label={tr('pipeline.addStepSearch')}
                      placeholder={tr('pipeline.addStepSearch')}
                      value={pick.query}
                      spellCheck={false}
                      onChange={(e) => setPick({ query: e.target.value, sel: 0 })}
                      onKeyDown={onPickKey}
                      onBlur={() => setTimeout(() => setAdding(false), 150)}
                    />
                  </div>
                  <div role="listbox" aria-label={tr('pipeline.addStep')} className="kf-pick-list">
                    {pickList.length === 0 && <div className="kf-pick-empty">{tr('pipeline.noMatch')}</div>}
                    {pickList.map((tool, j) => (
                      <button
                        key={tool.id}
                        role="option"
                        aria-selected={j === pick.sel}
                        className={`kf-pick-item${j === pick.sel ? ' kf-pick-on' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addStep(tool)}
                      >
                        <span className="kf-dot" style={{ background: `var(--kit-${CATEGORY_ACCENT[tool.category]})` }} />
                        <span className="kf-pick-name">{tool.name[locale]}</span>
                        <span className="kf-pick-desc">{tool.description[locale]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button className="kf-step-add" onClick={() => setAdding(true)}>
                  <span className="kf-step-add-plus">+</span>
                  <span className="kf-spacer">{tr('pipeline.addStep')}</span>
                  <span className="kf-kbd">{host.platform === 'mac' ? '⌘ ↵' : 'ctrl ↵'}</span>
                </button>
              )}
            </li>
          </ol>
          <div className="kf-steps-foot" style={{ fontFamily: mono.fontFamily }}>
            {filePath}
          </div>
        </section>

        <div className="kf-pipe-io">
          <section className="kf-panel">
            <div className="kf-panel-head">
              <span className="kf-panel-title">{tr('ui.input')}</span>
              <span className="kf-meta">{tr('ui.textMeta', { bytes: nf.format(utf8Length(input)) })}</span>
              <span className="kf-spacer" />
              <button className="kf-mini" onClick={() => void host.readClipboard().then(setInput)}>
                {tr('ui.paste')}
              </button>
              <button className="kf-mini" onClick={() => setInput('')}>
                {tr('ui.clear')}
              </button>
            </div>
            <textarea
              className="kf-textarea"
              style={mono}
              aria-label={tr('ui.input')}
              value={input}
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
            />
          </section>

          <section className={`kf-panel${outcome === 'error' ? ' kf-panel-error' : ''}`}>
            <div className="kf-panel-head">
              <span className="kf-panel-title">{tr('ui.output')}</span>
              {lastIndex >= 0 && (
                <label className="kf-field">
                  <span className="kf-sr">{tr('pipeline.outputStep')}</span>
                  <select value={shown} onChange={(e) => setShownStep(Number(e.target.value) === lastIndex ? null : Number(e.target.value))}>
                    {[...available].reverse().map((j) => {
                      const tool = toolOf(steps[j]?.tool ?? '');
                      const label = tool ? tool.name[locale] : (steps[j]?.tool ?? '');
                      return (
                        <option key={j} value={j}>
                          {tr(j === steps.length - 1 ? 'pipeline.stepLast' : 'pipeline.stepOption', { n: j + 1, name: label })}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
              <span className="kf-meta">{outMeta}</span>
              <span className="kf-spacer" />
              <button className="kf-mini kf-mini-primary" disabled={outcome !== 'ok'} onClick={() => void copy()}>
                <CopyIcon />
                {tr('ui.copy')}
              </button>
            </div>
            {outcome === 'empty' && <div className="kf-empty">{tr('ui.emptyInput')}</div>}
            {outcome === 'error' && (
              <div className="kf-out" style={mono}>
                <div className="kf-error" role="alert">
                  {shownError}
                </div>
              </div>
            )}
            {outcome === 'ok' && shownResult && (
              <div className="kf-out kf-fade" style={mono} tabIndex={0}>
                {resultText(shownResult)}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
