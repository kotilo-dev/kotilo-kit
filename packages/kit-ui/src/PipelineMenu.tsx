import { describePipeline, type Locale, type PipelineDef, type Tool } from '@kotilo/kit-core';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SmallSearchIcon } from './icons.js';
import type { Pipelines } from './pipelines.js';

export interface PipelineMenuProps {
  tool: Tool<any>;
  pipelines: Pipelines;
  locale: Locale;
  tr: (key: string, params?: Record<string, string | number>) => string;
  /** "+ New pipeline": start one with the current tool. */
  onNew: () => void;
  /** Append the current tool (and its options) to an existing pipeline. */
  onAppend: (def: PipelineDef) => void;
  onClose: () => void;
}

/** docs/02-design.md › 1.1 › Pipeline'a ekle (mockup PipelineAddMenu.dc.html). */
export function PipelineMenu({ tool, pipelines, locale, tr, onNew, onAppend, onClose }: PipelineMenuProps) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => searchRef.current?.focus(), []);
  // a click anywhere outside closes the menu
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const existing = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US');
    return pipelines.loaded.flatMap((p) => (p.def && !p.issues.length && (!q || p.def.name.includes(q)) ? [p.def] : []));
  }, [pipelines.loaded, query, locale]);
  const count = existing.length + 1;
  const current = Math.min(sel, count - 1);

  const choose = (i: number) => (i === 0 ? onNew() : onAppend(existing[i - 1]!));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((current + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(current);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div ref={ref} className="kf-menu" role="menu" aria-label={tr('pipeline.menu')} onKeyDown={onKey}>
      <div className="kf-menu-search">
        <SmallSearchIcon />
        <input
          ref={searchRef}
          aria-label={tr('pipeline.search')}
          placeholder={tr('pipeline.search')}
          value={query}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
        />
      </div>
      <div className="kf-menu-list">
        <button role="menuitem" className={`kf-menu-item${current === 0 ? ' kf-menu-on' : ''}`} onClick={() => choose(0)} onMouseEnter={() => setSel(0)}>
          <span className="kf-menu-plus">+</span>
          <span className="kf-menu-text">
            <span className="kf-menu-name">{tr('pipeline.new')}</span>
            <span className="kf-menu-desc">{tr('pipeline.newHint', { tool: tool.name[locale] })}</span>
          </span>
          {current === 0 && <span className="kf-menu-enter">enter</span>}
        </button>
        {existing.length > 0 && <div className="kf-menu-section">{tr('pipeline.appendTo').toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US')}</div>}
        {existing.map((def, i) => (
          <button
            key={def.name}
            role="menuitem"
            className={`kf-menu-item${current === i + 1 ? ' kf-menu-on' : ''}`}
            onClick={() => choose(i + 1)}
            onMouseEnter={() => setSel(i + 1)}
          >
            <span className="kf-dot kf-dot-pipe" />
            <span className="kf-menu-text">
              <span className="kf-menu-name kf-mono">{def.name}</span>
              <span className="kf-menu-desc">
                {tr('pipeline.chain', { chain: describePipeline(def, pipelines.base, locale), n: def.steps.length })}
              </span>
            </span>
            {current === i + 1 && <span className="kf-menu-enter">enter</span>}
          </button>
        ))}
      </div>
      <div className="kf-menu-foot">{tr('pipeline.menuFooter')}</div>
    </div>
  );
}
