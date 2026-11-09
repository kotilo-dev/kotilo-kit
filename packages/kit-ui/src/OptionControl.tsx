import type { OptionDef, OptionValue } from '@kotilo/kit-core';

export interface OptionControlProps {
  option: OptionDef;
  value: OptionValue;
  onChange: (value: OptionValue) => void;
  label: string;
  valueLabel: (value: string) => string;
  /** `id` of the focusable control (alt+hotkey focuses `kf-opt-<key>` in the tool header). */
  id?: string;
  monoFamily?: string;
}

/** One declarative tool option as its control (tool header and pipeline step cards). */
export function OptionControl({ option: o, value, onChange, label, valueLabel, id, monoFamily }: OptionControlProps) {
  const hint = o.hotkey ? `alt ${o.hotkey}` : undefined;
  switch (o.type) {
    case 'segmented':
      return (
        <div className="kf-seg" role="group" aria-label={label} title={hint}>
          {o.values.map((v) => (
            <button key={v} aria-pressed={value === v} className={value === v ? 'kf-seg-on' : ''} onClick={() => onChange(v)}>
              {valueLabel(v)}
            </button>
          ))}
        </div>
      );
    case 'toggle':
      return (
        <label className="kf-check" title={hint}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {label}
        </label>
      );
    case 'select':
      return (
        <label className="kf-field" title={hint}>
          {label}
          <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {o.values.map((v) => (
              <option key={v} value={v}>
                {valueLabel(v)}
              </option>
            ))}
          </select>
        </label>
      );
    case 'number':
      return (
        <label className="kf-field" title={hint}>
          {label}
          <input
            id={id}
            type="number"
            className="kf-num"
            value={Number(value)}
            min={o.min}
            max={o.max}
            step={o.step ?? 1}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (!Number.isNaN(n)) onChange(n);
            }}
          />
        </label>
      );
    case 'text':
      return (
        <label className="kf-field" title={hint}>
          {label}
          <input
            id={id}
            className="kf-text"
            style={monoFamily ? { fontFamily: monoFamily } : undefined}
            value={String(value)}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
