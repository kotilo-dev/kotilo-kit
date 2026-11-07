import './fonts';
import '@kotilo/kit-ui/palette.css';
import './base.css';
import { createRegistry } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { Palette } from '@kotilo/kit-ui';
import { listen } from '@tauri-apps/api/event';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createTauriHost } from './host';

const host = await createTauriHost();
const registry = createRegistry(builtinTools);

document.documentElement.lang = host.config.get().general.locale;

// Tray › Theme: the palette window owns persistence (one writer), others just follow config:changed.
void listen<{ id: string }>('theme:set', (e) => void host.theme.set(e.payload.id));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Palette host={host} registry={registry} />
  </StrictMode>,
);
