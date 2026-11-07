import './fonts';
import '@kotilo/kit-ui/palette.css';
import './base.css';
import { Toast, applyTheme, installThemes } from '@kotilo/kit-ui';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createTauriHost } from './host';

const host = await createTauriHost();
installThemes();
applyTheme(host.theme.id());
host.theme.subscribe(applyTheme);

function App() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const un = listen<string>('toast:show', (e) => setMessage(e.payload));
    return () => void un.then((f) => f());
  }, []);
  return <Toast message={message} />;
}

createRoot(document.getElementById('root')!).render(<App />);
