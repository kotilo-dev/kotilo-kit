import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent, acceleratorParts, type KeyLike } from '../src/hotkey.js';

const ev = (code: string, mods: Partial<KeyLike> = {}, key = code.replace(/^Key|^Digit/, '')): KeyLike => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('acceleratorFromEvent', () => {
  it('builds config.toml spelling from the physical key, modifiers in a fixed order', () => {
    expect(acceleratorFromEvent(ev('KeyK', { ctrlKey: true, shiftKey: true }), 'windows')).toBe('Ctrl+Shift+K');
    expect(acceleratorFromEvent(ev('Space', { ctrlKey: true, altKey: true }, ' '), 'linux')).toBe('Ctrl+Alt+Space');
    expect(acceleratorFromEvent(ev('Digit1', { altKey: true }, '¡'), 'windows')).toBe('Alt+1');
    expect(acceleratorFromEvent(ev('KeyK', { metaKey: true, shiftKey: true }), 'mac')).toBe('Cmd+Shift+K');
    expect(acceleratorFromEvent(ev('F9'), 'windows')).toBe('F9');
  });

  it('uses the key position, not the layout character (TR-Q ı / İ, macOS Option dead keys)', () => {
    expect(acceleratorFromEvent(ev('KeyI', { ctrlKey: true }, 'ı'), 'windows')).toBe('Ctrl+I');
    expect(acceleratorFromEvent(ev('KeyK', { altKey: true }, '˚'), 'mac')).toBe('Alt+K');
  });

  it('waits while only modifiers are down and rejects combos that would eat typing', () => {
    expect(acceleratorFromEvent(ev('ControlLeft', { ctrlKey: true }, 'Control'), 'windows')).toBeNull();
    expect(acceleratorFromEvent(ev('KeyK'), 'windows')).toBeNull();
    expect(acceleratorFromEvent(ev('KeyK', { shiftKey: true }), 'windows')).toBeNull();
    expect(acceleratorFromEvent(ev('Enter', { ctrlKey: true }, 'Enter'), 'windows')).toBeNull();
    // Windows key is reserved by the OS
    expect(acceleratorFromEvent(ev('KeyK', { metaKey: true }), 'windows')).toBeNull();
  });
});

describe('acceleratorParts', () => {
  it('splits into chips, with macOS symbols', () => {
    expect(acceleratorParts('Ctrl+Shift+K', 'windows')).toEqual(['Ctrl', 'Shift', 'K']);
    expect(acceleratorParts('CommandOrControl+Shift+K', 'linux')).toEqual(['Ctrl', 'Shift', 'K']);
    expect(acceleratorParts('Cmd+Alt+Shift+Space', 'mac')).toEqual(['⌘', '⌥', '⇧', 'Space']);
  });
});
