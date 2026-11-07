import './fonts';
import '@kotilo/kit-ui/full.css';
import './base.css';
import { createRegistry } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { FullWindow, applyTheme, installThemes } from '@kotilo/kit-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import pkg from '../package.json';
import { createTauriHost } from './host';

const host = await createTauriHost();
const registry = createRegistry(builtinTools);

installThemes();
applyTheme(host.theme.id());
host.theme.subscribe(applyTheme);
document.documentElement.lang = host.config.get().general.locale;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FullWindow host={host} registry={registry} version={pkg.version} />
  </StrictMode>,
);
