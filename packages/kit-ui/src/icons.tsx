import type { Category } from '@kotilo/kit-core';

/** 24×24 stroke paths. Tool-specific where the mockup defines one, otherwise per category. */
const TOOL_PATHS: Record<string, string> = {
  jwt: 'M3 12h4l2-6 4 12 2-6h6',
  base64: 'M4 7h16M4 12h16M4 17h10',
  json: 'M8 4l-4 8 4 8M16 4l4 8-4 8',
  timestamp: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  csv: 'M4 6h16M4 12h16M4 18h16M9 3v18',
  hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
  regex: 'M17 4v8M13.5 6l7 4M20.5 6l-7 4M6 18h.01',
  diff: 'M12 3v18M5 8h4M7 6v4M15 16h4',
};

const CATEGORY_PATHS: Record<Category, string> = {
  encoding: 'M4 7h16M4 12h16M4 17h10',
  format: 'M8 4l-4 8 4 8M16 4l4 8-4 8',
  text: 'M5 5h14M12 5v14',
  time: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  generate: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  web: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  visual: 'M12 3l6 7a7 7 0 1 1-12 0z',
  pipeline: 'M4 12h16M14 6l6 6-6 6',
};

export function ToolIcon({ id, category, color }: { id: string; category: Category; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden="true">
      <path d={TOOL_PATHS[id] ?? CATEGORY_PATHS[category]} />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--kit-subtext)" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function ClipboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--kit-teal)" strokeWidth="2" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
