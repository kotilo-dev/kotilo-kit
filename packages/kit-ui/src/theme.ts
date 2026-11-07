import { themesCss } from '@kotilo/kit-themes';

/** Inject the generated `--kit-*` theme CSS once (from docs/05-themes.toml). */
export function installThemes(doc: Document = document): void {
  if (doc.getElementById('kit-themes')) return;
  const style = doc.createElement('style');
  style.id = 'kit-themes';
  style.textContent = themesCss;
  doc.head.appendChild(style);
}

/** Switch theme instantly — CSS variables change, no restart. */
export function applyTheme(id: string, doc: Document = document): void {
  doc.documentElement.dataset.theme = id;
}
