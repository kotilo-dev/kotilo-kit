import type { Platform } from './host.js';

/** The subset of KeyboardEvent the recorder reads (tests pass plain objects). */
export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph']);

/** `KeyboardEvent.code` → accelerator key name (Tauri global-shortcut syntax). Layout-independent. */
function keyName(code: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1]!;
  if ((m = code.match(/^Digit([0-9])$/))) return m[1]!;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === 'Space') return 'Space';
  return null;
}

/**
 * Fallback when `code` is empty or unknown (synthetic input, some remote-desktop / IME paths):
 * only unambiguous ASCII letters, digits, F-keys and Space; layout letters like `ı` stay null.
 */
function keyNameFromKey(key: string): string | null {
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (key === ' ') return 'Space';
  return null;
}

/**
 * Global shortcut from a keydown, e.g. `Ctrl+Shift+K` / `Cmd+Alt+Space` (same spelling as
 * `general.hotkey` in config.toml). `null` while only modifiers are held, for keys we do not
 * accept, and for combos without Ctrl/Alt/Cmd (a bare letter or Shift+letter would eat typing).
 */
export function acceleratorFromEvent(e: KeyLike, platform: Platform): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = keyName(e.code) ?? (e.code === '' || e.code === 'Unidentified' ? keyNameFromKey(e.key) : null);
  if (!key) return null;
  const mac = platform === 'mac';
  const mods: string[] = [];
  if (mac && e.metaKey) mods.push('Cmd');
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  // the Windows/Super key is reserved by the OS on Windows and most Linux desktops
  if (!mac && e.metaKey) return null;
  const strong = mods.some((m) => m !== 'Shift');
  // F-keys alone are fine as a global shortcut; everything else needs Ctrl/Alt/Cmd
  if (!strong && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join('+');
}

/** `Ctrl+Shift+K` → chips for display; `Cmd`/`Alt` shown as ⌘/⌥ on macOS. */
export function acceleratorParts(accelerator: string, platform: Platform): string[] {
  return accelerator
    .split('+')
    .filter(Boolean)
    .map((p) => {
      const lower = p.toLowerCase();
      if (platform === 'mac') {
        if (lower === 'cmd' || lower === 'command' || lower === 'super' || lower === 'commandorcontrol' || lower === 'cmdorctrl') return '⌘';
        if (lower === 'alt' || lower === 'option') return '⌥';
        if (lower === 'shift') return '⇧';
        if (lower === 'ctrl' || lower === 'control') return '⌃';
      } else if (lower === 'commandorcontrol' || lower === 'cmdorctrl' || lower === 'control') return 'Ctrl';
      return p;
    });
}
