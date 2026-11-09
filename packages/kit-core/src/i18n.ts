import en from '../i18n/en.json' with { type: 'json' };
import tr from '../i18n/tr.json' with { type: 'json' };
import { isToolError } from './errors.js';
import type { Locale } from './types.js';

export type Messages = Record<string, string>;

const bundles: Record<Locale, Messages> = { en, tr };

export function messages(locale: Locale): Messages {
  return bundles[locale];
}

/** Strings shipped by plugins, by tool id. Only `tool.<id>.*` / `error.<id>.*`; built-in keys always win. */
const pluginMessages = new Map<string, Partial<Record<Locale, Messages>>>();

export function setPluginMessages(id: string, table: Partial<Record<Locale, Messages>> | undefined): void {
  if (table) pluginMessages.set(id, table);
  else pluginMessages.delete(id);
}

/** Drop `table` for `id` — unless a newer load has replaced it meanwhile. */
export function clearPluginMessages(id: string, table: Partial<Record<Locale, Messages>> | undefined): void {
  if (table && pluginMessages.get(id) === table) pluginMessages.delete(id);
}

function pluginMessage(locale: Locale, key: string): string | undefined {
  const id = /^(?:tool|error)\.([a-z][a-z0-9-]*)\./.exec(key)?.[1];
  const table = id ? pluginMessages.get(id) : undefined;
  return table ? (table[locale]?.[key] ?? table.en?.[key]) : undefined;
}

/** Translate `key`; falls back to English, then to the key itself. `{name}` placeholders are filled from `params`. */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const template = bundles[locale][key] ?? bundles.en[key] ?? pluginMessage(locale, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

export function translator(locale: Locale) {
  return (key: string, params?: Record<string, string | number>) => t(locale, key, params);
}

/** Human message for anything thrown by a tool. Non-ToolErrors are bugs; they still must not crash the shell. */
export function errorMessage(locale: Locale, e: unknown): string {
  if (isToolError(e)) return t(locale, e.code, e.params);
  const detail = e instanceof Error ? e.message : String(e);
  return t(locale, 'error.unexpected', { detail });
}

/** Pick EN/TR from a BCP-47 tag like `tr-TR`; anything else is English. */
export function localeFromTag(tag: string | undefined): Locale {
  return tag?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
