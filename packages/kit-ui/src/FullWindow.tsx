import {
  createContext,
  errorMessage,
  pushRecent,
  resolveOptions,
  resultText,
  runTool,
  t,
  type OptionDef,
  type OptionValues,
  type Registry,
  type TableOutput,
  type Tool,
  type ToolResult,
} from '@kotilo/kit-core';
import { getTheme, primaryThemes } from '@kotilo/kit-themes';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { Host } from './host.js';
import {
  CaptionIcon,
  CopyIcon,
  LogoMark,
  PipelineIcon,
  SettingsIcon,
  ShieldIcon,
  SmallSearchIcon,
  ThemeIcon,
} from './icons.js';
import { CATEGORY_ACCENT, groupTools, intlLocale, summarizeOutput, utf8Length } from './model.js';

export interface FullWindowProps {
  host: Host;
  registry: Registry;
  /** App version for the status bar. */
  version: string;
  /** Installed plugins (status bar count). Plugins arrive in 1.1. */
  pluginCount?: number;
}

type Outcome = { kind: 'empty' } | { kind: 'ok'; result: ToolResult } | { kind: 'error'; message: string };

interface LoadedFile {
  name: string;
  bytes: Uint8Array;
}

/** Options rendered as a pane under the input instead of in the header (e.g. diff's text B). */
const isPaneOption = (o: OptionDef) => o.type === 'text' && o.multiline === true;
const letterOf = (e: KeyboardEvent | ReactKeyboardEvent) =>
  e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();

function isEmptyResult(r: ToolResult): boolean {
  if (r.bytes) return false;
  return typeof r.output === 'string' ? r.output === '' : r.output.rows.length === 0;
}

export function FullWindow({ host, registry, version, pluginCount = 0 }: FullWindowProps) {
  const [config, setConfig] = useState(() => host.config.get());
  const locale = config.general.locale;
  const tr = useCallback((key: string, params?: Record<string, string | number>) => t(locale, key, params), [locale]);
  const nf = useMemo(() => new Intl.NumberFormat(intlLocale(locale)), [locale]);
  const upper = (s: string) => s.toLocaleUpperCase(intlLocale(locale));

  const [toolId, setToolId] = useState(() => {
    const first = config.recent.ids.find((id) => registry.get(id));
    return first ?? registry.tools[0]!.id;
  });
  const tool = registry.get(toolId) ?? registry.tools[0]!;
  const [input, setInput] = useState('');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [overrides, setOverrides] = useState<Record<string, OptionValues>>({});
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => host.config.subscribe(setConfig), [host]);

  const selectTool = useCallback(
    (id: string) => {
      if (!registry.get(id)) return;
      setToolId(id);
      const nowSec = Math.floor(host.now().getTime() / 1000);
      void host.config.update((c) => pushRecent(c, id, nowSec));
    },
    [host, registry],
  );

  // palette ctrl+Enter hand-off
  useEffect(
    () =>
      host.onOpenFull?.((id, text) => {
        if (registry.get(id)) setToolId(id);
        setFile(null);
        setInput(text);
      }),
    [host, registry],
  );

  const opts = resolveOptions(tool.options, overrides[tool.id]);
  const setOption = (key: string, value: string | number | boolean) =>
    setOverrides((o) => ({ ...o, [tool.id]: { ...resolveOptions(tool.options, o[tool.id]), [key]: value } }));

  const deferredInput = useDeferredValue(input);
  const deferredOpts = useDeferredValue(opts);
  const outcome: Outcome = useMemo(() => {
    const blank = !deferredInput.trim() && !file;
    try {
      const result = runTool(
        tool,
        deferredInput,
        deferredOpts,
        createContext({ locale, now: host.now(), ...(file ? { bytes: file.bytes } : {}) }),
      );
      return blank && isEmptyResult(result) ? { kind: 'empty' } : { kind: 'ok', result };
    } catch (e) {
      return blank ? { kind: 'empty' } : { kind: 'error', message: errorMessage(locale, e) };
    }
    // deferredOpts is a fresh object each render; compare by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, deferredInput, JSON.stringify(deferredOpts), file, locale, host]);

  // other tools that recognise the input (suggestion strip)
  const suggestions = useMemo(
    () => (deferredInput.trim() ? registry.detect(deferredInput).filter((d) => d.tool.id !== tool.id).slice(0, 3) : []),
    [registry, deferredInput, tool.id],
  );

  const groups = useMemo(() => groupTools(registry.tools, locale, search), [registry.tools, locale, search]);
  const visibleTools = groups.flatMap((g) => g.tools);

  // ---------- actions ----------
  const outputText = outcome.kind === 'ok' ? resultText(outcome.result) : '';

  const copyOutput = async () => {
    if (outcome.kind !== 'ok') return;
    await host.writeClipboard(outputText);
    host.notify(tr('ui.copied'));
  };

  const saveOutput = async () => {
    if (outcome.kind !== 'ok') return;
    const { result } = outcome;
    const data = result.bytes
      ? new Blob([result.bytes as BlobPart], { type: result.mime ?? 'application/octet-stream' })
      : new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const ext = result.bytes ? 'bin' : typeof result.output === 'string' ? 'txt' : 'tsv';
    await host.saveFile(`${tool.id}.${ext}`, data).catch((e) => console.warn('[kit] save failed', e));
  };

  const pasteInput = async () => {
    setFile(null);
    setInput(await host.readClipboard());
  };

  const openFile = async () => {
    const f = await host.openFile().catch(() => null);
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    setFile({ name: f.name, bytes });
    setInput(new TextDecoder().decode(bytes));
  };

  const clearInput = () => {
    setFile(null);
    setInput('');
    inputRef.current?.focus();
  };

  /** "Send to tool ›": output becomes the input; the suggestion strip and search pick the next tool. */
  const sendToTool = () => {
    if (outcome.kind !== 'ok' || outcome.result.bytes) return;
    setFile(null);
    setInput(outputText);
    setSearch('');
    searchRef.current?.focus();
  };

  const nextTheme = () => {
    const ids = primaryThemes.map((th) => th.id);
    const current = getTheme(config.theme.id);
    const base = current?.variant === 'light' ? (current.pair ?? config.theme.id) : config.theme.id;
    const next = ids[(ids.indexOf(base) + 1) % ids.length]!;
    void host.theme.set(next);
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = host.platform === 'mac' ? e.metaKey : e.ctrlKey;
      if (mod && !e.shiftKey && letterOf(e) === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (mod && e.shiftKey && letterOf(e) === 'c') {
        e.preventDefault();
        void copyOutput();
      } else if (mod && !e.shiftKey && letterOf(e) === 'l') {
        e.preventDefault();
        clearInput();
      } else if (e.altKey && !mod) {
        const key = letterOf(e);
        const opt = tool.options.find((o) => o.hotkey === key);
        if (!opt) return;
        e.preventDefault();
        if (opt.type === 'toggle') setOption(opt.key, !opts[opt.key]);
        else if (opt.type === 'segmented' || opt.type === 'select') {
          const i = opt.values.indexOf(String(opts[opt.key]));
          setOption(opt.key, opt.values[(i + 1) % opt.values.length]!);
        } else document.getElementById(`kf-opt-${opt.key}`)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && visibleTools[0]) {
      e.preventDefault();
      selectTool(visibleTools[0].id);
      setSearch('');
      inputRef.current?.focus();
    } else if (e.key === 'Escape') {
      setSearch('');
      inputRef.current?.focus();
    }
  };

  /** "Search tools or paste from clipboard…": pasted content that a tool recognises opens it as input. */
  const onSearchPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const best = registry.detect(text)[0];
    if (!best || best.score < 0.5) return;
    e.preventDefault();
    selectTool(best.tool.id);
    setFile(null);
    setInput(text);
    setSearch('');
    inputRef.current?.focus();
  };

  // ---------- render helpers ----------
  const mono = { fontFamily: `"${config.theme.font}", "JetBrains Mono", monospace`, fontSize: config.theme.size };
  const theme = getTheme(config.theme.id);
  const accent = (category: Tool<any>['category']) => `var(--kit-${CATEGORY_ACCENT[category]})`;
  const optLabel = (key: string) => tr(`tool.${tool.id}.opt.${key}`);
  const valueLabel = (key: string, v: string) => tr(`tool.${tool.id}.opt.${key}.${v}`);

  const inputMeta = file
    ? tr('ui.fileMeta', { name: file.name, bytes: nf.format(file.bytes.length) })
    : tr('ui.textMeta', { bytes: nf.format(utf8Length(input)) });

  let outputMeta = '';
  if (outcome.kind === 'ok') {
    const s = summarizeOutput(outcome.result);
    outputMeta =
      s.kind === 'binary'
        ? tr('ui.binaryMeta', { bytes: nf.format(s.bytes) })
        : s.kind === 'rows'
          ? tr('ui.rowsMeta', { rows: nf.format(s.rows) })
          : tr('ui.charsMeta', { chars: nf.format(s.chars) });
  }

  const headerOptions = tool.options.filter((o) => !isPaneOption(o));
  const paneOptions = tool.options.filter(isPaneOption);
  const controls = host.windowControls;

  return (
    <div className={`kf${host.platform === 'mac' ? ' kf-mac' : ''}`} lang={locale}>
      {/* ---------- title bar ---------- */}
      <header className="kf-titlebar" data-tauri-drag-region>
        <span className="kf-brand" data-tauri-drag-region>
          <span className="kf-logo">
            <LogoMark />
          </span>
          <span className="kf-brand-name">Kotilo Kit</span>
        </span>
        <div className="kf-search-wrap" data-tauri-drag-region>
          <div className="kf-search">
            <SmallSearchIcon />
            <input
              ref={searchRef}
              aria-label={tr('ui.searchLabel')}
              placeholder={tr('ui.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              onPaste={onSearchPaste}
              spellCheck={false}
            />
            <span className="kf-kbd">{host.platform === 'mac' ? '⌘ K' : 'ctrl K'}</span>
          </div>
        </div>
        <button className="kf-icon-btn" aria-label={tr('ui.theme')} title={tr('ui.themeNext')} onClick={nextTheme}>
          <ThemeIcon />
        </button>
        <button className="kf-icon-btn" aria-label={tr('ui.settings')} title={tr('ui.settingsSoon')} disabled>
          <SettingsIcon />
        </button>
        {controls && (
          <span className="kf-caption">
            <button aria-label={tr('ui.minimize')} onClick={controls.minimize}>
              <CaptionIcon kind="min" />
            </button>
            <button aria-label={tr('ui.maximize')} onClick={controls.toggleMaximize}>
              <CaptionIcon kind="max" />
            </button>
            <button className="kf-caption-close" aria-label={tr('ui.closeWindow')} onClick={controls.close}>
              <CaptionIcon kind="close" />
            </button>
          </span>
        )}
      </header>

      <div className="kf-body">
        {/* ---------- sidebar ---------- */}
        <nav className="kf-nav" aria-label={tr('ui.categories')}>
          {groups.map((g, gi) => (
            <div key={g.category} role="group" aria-labelledby={`kf-cat-${g.category}`}>
              <div id={`kf-cat-${g.category}`} className={`kf-cat${gi === 0 ? ' kf-cat-first' : ''}`}>
                {upper(tr(`category.${g.category}`))}
              </div>
              {g.tools.map((item) => (
                <a
                  key={item.id}
                  title={item.name[locale]}
                  href={`#${item.id}`}
                  className={`kf-tool${item.id === tool.id ? ' kf-tool-on' : ''}`}
                  aria-current={item.id === tool.id ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    selectTool(item.id);
                  }}
                >
                  <span className="kf-dot" style={{ background: accent(item.category) }} />
                  <span className="kf-tool-name">{item.name[locale]}</span>
                </a>
              ))}
            </div>
          ))}
          {groups.length === 0 && <div className="kf-nav-empty">{tr('ui.noResults')}</div>}
        </nav>

        {/* ---------- tool panel ---------- */}
        <main className="kf-main">
          <div className="kf-head">
            <h1>{tool.name[locale]}</h1>
            {headerOptions.map((o) => {
              const value = opts[o.key];
              const hint = o.hotkey ? `alt ${o.hotkey}` : undefined;
              switch (o.type) {
                case 'segmented':
                  return (
                    <div key={o.key} className="kf-seg" role="group" aria-label={optLabel(o.key)} title={hint}>
                      {o.values.map((v) => (
                        <button
                          key={v}
                          aria-pressed={value === v}
                          className={value === v ? 'kf-seg-on' : ''}
                          onClick={() => setOption(o.key, v)}
                        >
                          {valueLabel(o.key, v)}
                        </button>
                      ))}
                    </div>
                  );
                case 'toggle':
                  return (
                    <label key={o.key} className="kf-check" title={hint}>
                      <input type="checkbox" checked={Boolean(value)} onChange={(e) => setOption(o.key, e.target.checked)} />
                      {optLabel(o.key)}
                    </label>
                  );
                case 'select':
                  return (
                    <label key={o.key} className="kf-field" title={hint}>
                      {optLabel(o.key)}
                      <select id={`kf-opt-${o.key}`} value={String(value)} onChange={(e) => setOption(o.key, e.target.value)}>
                        {o.values.map((v) => (
                          <option key={v} value={v}>
                            {valueLabel(o.key, v)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                case 'number':
                  return (
                    <label key={o.key} className="kf-field" title={hint}>
                      {optLabel(o.key)}
                      <input
                        id={`kf-opt-${o.key}`}
                        type="number"
                        className="kf-num"
                        value={Number(value)}
                        min={o.min}
                        max={o.max}
                        step={o.step ?? 1}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          if (!Number.isNaN(n)) setOption(o.key, n);
                        }}
                      />
                    </label>
                  );
                case 'text':
                  return (
                    <label key={o.key} className="kf-field" title={hint}>
                      {optLabel(o.key)}
                      <input
                        id={`kf-opt-${o.key}`}
                        className="kf-text"
                        style={{ fontFamily: mono.fontFamily }}
                        value={String(value)}
                        spellCheck={false}
                        onChange={(e) => setOption(o.key, e.target.value)}
                      />
                    </label>
                  );
              }
            })}
            <span className="kf-spacer" />
            <button className="kf-btn" disabled title={tr('ui.pipelineSoon')}>
              <PipelineIcon />
              {tr('ui.addToPipeline')}
            </button>
          </div>

          <div className="kf-grid">
            <div className="kf-col">
              <section className="kf-panel">
                <div className="kf-panel-head">
                  <span className="kf-panel-title">{tr('ui.input')}</span>
                  <span className="kf-meta">{inputMeta}</span>
                  <span className="kf-spacer" />
                  <button className="kf-mini" onClick={() => void pasteInput()}>
                    {tr('ui.paste')}
                  </button>
                  {tool.accepts.includes('file') && (
                    <button className="kf-mini" onClick={() => void openFile()}>
                      {tr('ui.file')}
                    </button>
                  )}
                  <button className="kf-mini" onClick={clearInput} title={host.platform === 'mac' ? '⌘ L' : 'ctrl L'}>
                    {tr('ui.clear')}
                  </button>
                </div>
                <textarea
                  ref={inputRef}
                  className="kf-textarea"
                  style={mono}
                  aria-label={tr('ui.input')}
                  value={input}
                  readOnly={file !== null}
                  spellCheck={false}
                  onChange={(e) => setInput(e.target.value)}
                />
              </section>
              {paneOptions.map((o) => (
                <section key={o.key} className="kf-panel">
                  <div className="kf-panel-head">
                    <span className="kf-panel-title">{optLabel(o.key)}</span>
                    {o.hotkey && <span className="kf-meta">alt {o.hotkey}</span>}
                  </div>
                  <textarea
                    id={`kf-opt-${o.key}`}
                    className="kf-textarea"
                    style={mono}
                    aria-label={optLabel(o.key)}
                    value={String(opts[o.key])}
                    spellCheck={false}
                    onChange={(e) => setOption(o.key, e.target.value)}
                  />
                </section>
              ))}
            </div>

            <section className={`kf-panel${outcome.kind === 'error' ? ' kf-panel-error' : ''}`}>
              <div className="kf-panel-head">
                <span className="kf-panel-title">{tr('ui.output')}</span>
                <span className="kf-meta">{outputMeta}</span>
                <span className="kf-spacer" />
                <button
                  className="kf-mini kf-mini-primary"
                  disabled={outcome.kind !== 'ok'}
                  onClick={() => void copyOutput()}
                  title={host.platform === 'mac' ? '⌘ ⇧ C' : 'ctrl shift C'}
                >
                  <CopyIcon />
                  {tr('ui.copy')}
                </button>
                <button className="kf-mini" disabled={outcome.kind !== 'ok'} onClick={() => void saveOutput()}>
                  {tr('ui.save')}
                </button>
                <button
                  className="kf-mini"
                  disabled={outcome.kind !== 'ok' || Boolean(outcome.result.bytes)}
                  onClick={sendToTool}
                >
                  {tr('ui.sendToTool')}
                </button>
              </div>
              <Output outcome={outcome} mono={mono} emptyText={tr('ui.emptyInput')} />
            </section>
          </div>

          {suggestions.length > 0 && (
            <div className="kf-suggest">
              <ShieldIcon />
              <span className="kf-suggest-lead">
                {tr('ui.inputDetected', { name: tr(`kind.${suggestions[0]!.tool.id}`) })}
              </span>
              {suggestions.map((d, i) => (
                <span key={d.tool.id} className="kf-suggest-item">
                  {i > 0 && <span className="kf-sep">·</span>}
                  <a
                    href={`#${d.tool.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      selectTool(d.tool.id);
                    }}
                  >
                    {d.tool.name[locale]}
                  </a>
                </span>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ---------- status bar ---------- */}
      <footer className="kf-status">
        <span className="kf-offline">
          <span className="kf-offline-dot" />
          {tr('ui.offlineBadge')}
        </span>
        <span>{theme?.name ?? config.theme.id}</span>
        <span>
          {config.theme.font} {config.theme.size}
        </span>
        <span className="kf-spacer" />
        <span>{tr('ui.toolCount', { tools: nf.format(registry.tools.length), plugins: nf.format(pluginCount) })}</span>
        <span>v{version}</span>
      </footer>
    </div>
  );
}

function Output({ outcome, mono, emptyText }: { outcome: Outcome; mono: React.CSSProperties; emptyText: string }) {
  if (outcome.kind === 'empty') return <div className="kf-empty">{emptyText}</div>;
  if (outcome.kind === 'error')
    return (
      <div className="kf-out" style={mono}>
        <div className="kf-error" role="alert">
          {outcome.message}
        </div>
      </div>
    );
  const { output } = outcome.result;
  // key on content so the 120 ms fade replays on every change
  if (typeof output === 'string')
    return (
      <div key={output.length + output.slice(0, 64)} className="kf-out kf-fade" style={mono} tabIndex={0}>
        {output}
      </div>
    );
  return <OutputTable table={output} mono={mono} />;
}

function OutputTable({ table, mono }: { table: TableOutput; mono: React.CSSProperties }) {
  return (
    <div className="kf-out kf-out-table kf-fade" style={mono} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
