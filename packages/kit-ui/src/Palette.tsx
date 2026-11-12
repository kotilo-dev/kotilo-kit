import {
  createContext,
  errorMessage,
  pushRecent,
  resolveOptions,
  resultText,
  runTool,
  t,
  type Detection,
  type OptionDef,
  type OptionValues,
  type Registry,
  type Tool,
} from '@kotilo/kit-core';
import { getTheme, themes, type Theme } from '@kotilo/kit-themes';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Host } from './host.js';
import { ClipboardIcon, SearchIcon, ToolIcon } from './icons.js';
import { CATEGORY_ACCENT, buildItems, clipboardPreview, formatUsed, type Section } from './model.js';
import { usePipelines } from './pipelines.js';
import { usePlugins } from './plugins.js';
import { syncAppearance } from './theme.js';

export interface PaletteProps {
  host: Host;
  registry: Registry;
}

type InlineOption = Extract<OptionDef, { type: 'segmented' | 'select' | 'toggle' }>;
const inlineOptions = (tool: Tool<any>): InlineOption[] =>
  tool.options.filter((o): o is InlineOption => o.type === 'segmented' || o.type === 'select' || o.type === 'toggle');

const SECTION_LABEL: Record<Section, string> = {
  suggested: 'ui.suggested',
  recent: 'ui.recent',
  results: 'ui.results',
  all: 'ui.allTools',
};

/** Letter from a KeyboardEvent independent of Alt-layer characters (macOS Alt+M = µ). */
const letterOf = (e: KeyboardEvent) => (e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase());

export function Palette({ host, registry: baseRegistry }: PaletteProps) {
  // pipelines with `palette = true` are listed like tools
  const registry = usePipelines(host, usePlugins(host, baseRegistry).registry).paletteRegistry;
  const [config, setConfig] = useState(() => host.config.get());
  const [query, setQuery] = useState('');
  const [clip, setClip] = useState('');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selected, setSelected] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, OptionValues>>({});
  const [now, setNow] = useState(() => host.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const locale = config.general.locale;
  const tr = useCallback((key: string, params?: Record<string, string | number>) => t(locale, key, params), [locale]);
  const intlLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const mac = host.platform === 'mac';

  useEffect(() => host.config.subscribe(setConfig), [host]);
  const [appliedTheme, setAppliedTheme] = useState(config.theme.id);
  const [themeList, setThemeList] = useState<readonly Theme[]>(themes);
  useEffect(() => syncAppearance(host, { onList: setThemeList, onApplied: setAppliedTheme }), [host]);

  const activate = useCallback(async () => {
    setQuery('');
    setSelected(0);
    setOptionsOpen(false);
    setError(null);
    setNow(host.now());
    inputRef.current?.focus();
    if (host.config.get().clipboard.detect === true) {
      const text = await host.readClipboard().catch(() => '');
      setClip(text);
      setDetections(registry.detect(text));
    } else {
      setClip('');
      setDetections([]);
    }
  }, [host, registry]);

  useEffect(() => {
    void activate();
    return host.onActivate(() => void activate());
  }, [host, activate]);

  const items = useMemo(
    () => buildItems({ registry, query, detections, recent: config.recent }),
    [registry, query, detections, config.recent],
  );
  const sel = Math.min(selected, Math.max(items.length - 1, 0));
  const selectedTool = items[sel]?.tool;

  useEffect(() => {
    document.getElementById(`kp-item-${sel}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [sel]);

  const optsFor = (tool: Tool<any>) => resolveOptions(tool.options, overrides[tool.id]);

  const run = async (index: number, mode: 'copy' | 'full') => {
    const item = items[index];
    if (!item || busy.current) return;
    busy.current = true;
    const { tool } = item;
    try {
      const input = await host.readClipboard().catch(() => '');
      const nowDate = host.now();
      const nowSec = Math.floor(nowDate.getTime() / 1000);
      if (mode === 'full') {
        await host.config.update((c) => pushRecent(c, tool.id, nowSec));
        host.openFull(tool.id, input);
        host.close();
        return;
      }
      const result = runTool(tool, input, optsFor(tool), createContext({ locale, now: nowDate }));
      if (result.bytes) {
        setSelected(index);
        setError({ id: tool.id, msg: tr('ui.binaryOutput') });
        return;
      }
      await host.writeClipboard(resultText(result));
      await host.config.update((c) => pushRecent(c, tool.id, nowSec));
      host.notify(tr('ui.copied'));
      host.close();
    } catch (e) {
      setSelected(index);
      setError({ id: tool.id, msg: errorMessage(locale, e) });
    } finally {
      busy.current = false;
    }
  };

  const setOption = (tool: Tool<any>, key: string, value: string | boolean) => {
    setError(null);
    setOverrides((o) => ({ ...o, [tool.id]: { ...optsFor(tool), [key]: value } }));
  };

  const cycleOption = (tool: Tool<any>, opt: InlineOption) => {
    const current = optsFor(tool)[opt.key];
    if (opt.type === 'toggle') return setOption(tool, opt.key, !current);
    const i = opt.values.indexOf(String(current));
    setOption(tool, opt.key, opt.values[(i + 1) % opt.values.length]!);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = mac ? e.metaKey : e.ctrlKey;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setError(null);
      setOptionsOpen(false);
      setSelected(Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void run(sel, mod ? 'full' : 'copy');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (selectedTool && inlineOptions(selectedTool).length) setOptionsOpen((o) => !o);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (optionsOpen) setOptionsOpen(false);
      else host.close();
    } else if (mod && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      void run(Number(e.key) - 1, 'copy');
    } else if (e.altKey && selectedTool) {
      const opt = inlineOptions(selectedTool).find((o) => o.hotkey === letterOf(e));
      if (opt) {
        e.preventDefault();
        cycleOption(selectedTool, opt);
      }
    }
  };

  const answerConsent = async (detect: boolean) => {
    await host.config.update((c) => ({ ...c, clipboard: { detect } }));
    await activate();
  };

  const detected = detections[0];
  const themeName = getTheme(appliedTheme, themeList).name;

  return (
    <div className="kp" onKeyDown={onKeyDown}>
      <div className="kp-search">
        <SearchIcon />
        <input
          ref={inputRef}
          className="kp-input"
          aria-label={tr('ui.searchLabel')}
          role="combobox"
          aria-expanded="true"
          aria-controls="kp-list"
          aria-activedescendant={items.length ? `kp-item-${sel}` : undefined}
          value={query}
          spellCheck={false}
          autoComplete="off"
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
            setError(null);
            setOptionsOpen(false);
          }}
        />
        <span className="kp-key">esc</span>
      </div>

      {config.clipboard.detect === undefined ? (
        <div className="kp-strip">
          <ClipboardIcon />
          <span className="kp-strip-label">{tr('ui.consentQuestion')}</span>
          <span className="kp-spacer" />
          <button type="button" className="kp-strip-btn is-primary" onClick={() => void answerConsent(true)}>
            {tr('ui.yes')}
          </button>
          <button type="button" className="kp-strip-btn" onClick={() => void answerConsent(false)}>
            {tr('ui.no')}
          </button>
        </div>
      ) : detected ? (
        <div className="kp-strip">
          <ClipboardIcon />
          <span className="kp-strip-label">
            {tr('ui.clipboardDetected', { name: t(locale, `kind.${detected.tool.id}`) })}
          </span>
          <span className="kp-strip-preview">{clipboardPreview(clip)}</span>
        </div>
      ) : null}

      <div className="kp-list" id="kp-list" role="listbox" aria-label={tr('ui.searchLabel')}>
        {items.length === 0 && <div className="kp-empty">{tr('ui.noResults')}</div>}
        {items.map((item, i) => {
          const { tool, section } = item;
          const isSel = i === sel;
          const accent = CATEGORY_ACCENT[tool.category];
          const showHeader = i === 0 || items[i - 1]!.section !== section;
          const err = isSel && error?.id === tool.id ? error.msg : null;
          const compact = section === 'recent';
          const opts = isSel && optionsOpen ? inlineOptions(tool) : [];
          return (
            <Fragment key={`${section}-${tool.id}`}>
              {showHeader && (
                <div className={`kp-section${i === 0 ? ' is-first' : ''}`} role="presentation">
                  {tr(SECTION_LABEL[section]).toLocaleUpperCase(intlLocale)}
                </div>
              )}
              <div
                id={`kp-item-${i}`}
                className={`kp-row${isSel ? ' is-selected' : ''}${compact ? ' is-compact' : ''}`}
                role="option"
                aria-selected={isSel}
                onMouseMove={() => i !== sel && setSelected(i)}
                onClick={() => void run(i, 'copy')}
              >
                <span className="kp-icon">
                  <ToolIcon id={tool.id} category={tool.category} color={isSel ? 'var(--kit-crust)' : `var(--kit-${accent})`} />
                </span>
                <span className="kp-text">
                  <span className="kp-name">{tool.name[locale]}</span>
                  {err ? (
                    <span className="kp-error" role="alert">
                      {err}
                    </span>
                  ) : (
                    !compact && <span className="kp-desc">{tool.description[locale]}</span>
                  )}
                </span>
                {isSel ? (
                  <span className="kp-enter">enter</span>
                ) : compact ? (
                  <span className="kp-used">{formatUsed(item.usedAt ?? 0, now, locale)}</span>
                ) : i < 9 ? (
                  <span className="kp-shortcut">{mac ? `⌘${i + 1}` : `ctrl ${i + 1}`}</span>
                ) : null}
              </div>
              {opts.length > 0 && (
                <div className="kp-options" onClick={(e) => e.stopPropagation()}>
                  {opts.map((opt) => {
                    const value = optsFor(tool)[opt.key];
                    const label = tr(`tool.${tool.id}.opt.${opt.key}`);
                    const hint = opt.hotkey ? <span className="kp-hint">alt {opt.hotkey}</span> : null;
                    if (opt.type === 'toggle') {
                      return (
                        <label key={opt.key} className="kp-opt">
                          <input type="checkbox" checked={Boolean(value)} onChange={(e) => setOption(tool, opt.key, e.target.checked)} />
                          {label}
                          {hint}
                        </label>
                      );
                    }
                    if (opt.type === 'select') {
                      return (
                        <label key={opt.key} className="kp-opt">
                          {label}
                          <select className="kp-select" value={String(value)} onChange={(e) => setOption(tool, opt.key, e.target.value)}>
                            {opt.values.map((v) => (
                              <option key={v} value={v}>
                                {tr(`tool.${tool.id}.opt.${opt.key}.${v}`)}
                              </option>
                            ))}
                          </select>
                          {hint}
                        </label>
                      );
                    }
                    return (
                      <span key={opt.key} className="kp-opt" role="group" aria-label={label}>
                        {label}
                        <span className="kp-seg">
                          {opt.values.map((v) => (
                            <button
                              key={v}
                              type="button"
                              className={v === value ? 'is-active' : undefined}
                              aria-pressed={v === value}
                              onClick={() => setOption(tool, opt.key, v)}
                            >
                              {tr(`tool.${tool.id}.opt.${opt.key}.${v}`)}
                            </button>
                          ))}
                        </span>
                        {hint}
                      </span>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="kp-footer">
        <span>
          <b>↵</b> {tr('ui.runAndCopy')}
        </span>
        <span>
          <b>{mac ? '⌘ ↵' : 'ctrl ↵'}</b> {tr('ui.openFull')}
        </span>
        <span>
          <b>tab</b> {tr('ui.optionsHint')}
        </span>
        <span className="kp-spacer" />
        <span className="kp-theme">
          <span className="kp-dot" />
          {themeName}
        </span>
      </div>
    </div>
  );
}
