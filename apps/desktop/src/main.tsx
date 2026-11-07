import './fonts';
import './base.css';
import { createRegistry, t } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { applyTheme, installThemes } from '@kotilo/kit-ui';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createTauriHost } from './host';

/**
 * K1 placeholder for the full window: proves the ctrl+Enter hand-off (tool + input).
 * The real full window (sidebar, tool panel, status bar) is phase K2 — per docs/02-design.md.
 */
const host = await createTauriHost();
const registry = createRegistry(builtinTools);
installThemes();
applyTheme(host.theme.id());
host.theme.subscribe(applyTheme);

interface FullPayload {
  toolId: string;
  input: string;
}

function App() {
  const [payload, setPayload] = useState<FullPayload | null>(null);
  useEffect(() => {
    void invoke<FullPayload | null>('pending_full').then((p) => p && setPayload(p));
    const un = listen<FullPayload>('open-full', (e) => setPayload(e.payload));
    return () => void un.then((f) => f());
  }, []);
  const locale = host.config.get().general.locale;
  const tool = payload ? registry.get(payload.toolId) : undefined;
  return (
    <div className="km">
      <p>{t(locale, 'ui.fullWindowSoon', { tool: tool ? tool.name[locale] : '—' })}</p>
      {payload && <pre>{payload.input}</pre>}
    </div>
  );
}

const style = document.createElement('style');
style.textContent = `
  .km { height: 100%; box-sizing: border-box; padding: 20px 24px; overflow: auto;
        background: var(--kit-base); color: var(--kit-text); font: 400 13px Inter, system-ui, sans-serif; }
  .km pre { font: 400 13px/1.6 'JetBrains Mono', monospace; color: var(--kit-subtext); white-space: pre-wrap; word-break: break-all;
            background: var(--kit-mantle); border: 1px solid var(--kit-s0); border-radius: 10px; padding: 14px; }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(<App />);
