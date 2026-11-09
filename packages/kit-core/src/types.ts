export type Locale = 'en' | 'tr';
export const LOCALES: readonly Locale[] = ['en', 'tr'];

export type Localized = Record<Locale, string>;

export type Category =
  | 'encoding'
  | 'format'
  | 'text'
  | 'time'
  | 'generate'
  | 'web'
  | 'visual'
  | 'pipeline';

export const CATEGORIES: readonly Category[] = [
  'encoding',
  'format',
  'text',
  'time',
  'generate',
  'web',
  'visual',
];

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

interface OptionBase {
  key: string;
  /** Alt+<hotkey> toggles/cycles this option in the UI. */
  hotkey?: string;
}

export interface SegmentedOption extends OptionBase {
  type: 'segmented';
  values: readonly string[];
  default: string;
}
export interface SelectOption extends OptionBase {
  type: 'select';
  values: readonly string[];
  default: string;
}
export interface ToggleOption extends OptionBase {
  type: 'toggle';
  default: boolean;
}
export interface NumberOption extends OptionBase {
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}
export interface TextOption extends OptionBase {
  type: 'text';
  default: string;
  multiline?: boolean;
}

export type OptionDef = SegmentedOption | SelectOption | ToggleOption | NumberOption | TextOption;

export type Layout = 'input-output' | 'single' | 'table' | 'preview';
export type InputSource = 'text' | 'file';

export interface TableOutput {
  columns: string[];
  rows: string[][];
}

export interface ToolResult {
  /** Text output, or rows for `layout: 'table'`. */
  output: string | TableOutput;
  mime?: string;
  /** Raw bytes when the result is binary (e.g. base64 decode of a gzip). `output` is then a preview. */
  bytes?: Uint8Array;
  meta?: Record<string, OptionValue | undefined>;
}

export interface RunContext {
  locale: Locale;
  /** Injected clock — tools never call `new Date()` / `Date.now()` directly. */
  now: Date;
  /** IANA time zone used when a tool needs "local" time. */
  tz: string;
  /** Injected randomness — tools never touch `crypto` directly. */
  random: (n: number) => Uint8Array;
  /** Raw bytes of the input when it came from a file / binary stdin. `input` is its UTF-8 decoding. */
  bytes?: Uint8Array;
  /** Localized string lookup (`packages/kit-core/i18n`). */
  t: (key: string, params?: Record<string, string | number>) => string;
}

export interface ToolExample<O extends OptionValues = OptionValues> {
  input: string;
  opts?: Partial<O>;
  output: string;
}

export interface ToolDef<O extends OptionValues = OptionValues> {
  id: string;
  category: Category;
  name: Localized;
  description: Localized;
  keywords?: string[];
  /** 0..1, pure. Higher = more confident the input belongs to this tool. */
  detect?: (input: string) => number;
  options?: OptionDef[];
  layout?: Layout;
  accepts?: InputSource[];
  run: (input: string, opts: O, ctx: RunContext) => ToolResult;
  examples?: ToolExample<O>[];
  /**
   * Plugins only: their own strings (`tool.<id>.opt.<key>`, `error.<id>.<reason>` …) per locale,
   * since a plugin cannot add to `packages/kit-core/i18n`. Built-in tools leave this out.
   */
  messages?: Partial<Record<Locale, Record<string, string>>>;
}

export interface Tool<O extends OptionValues = OptionValues> extends Required<Omit<ToolDef<O>, 'detect' | 'messages'>> {
  detect?: (input: string) => number;
}
