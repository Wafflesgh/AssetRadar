/** main.tsx — Browser entry point: sets up the PWA helpers, mounts the React App into #root and loads global CSS. */
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initPwa} from './pwa.ts';
import {i18nReady} from './i18n/index.ts';
import './index.css';

initPwa();
// The first render waits for the language's texts (a few kB, cached by the browser after the first visit)
void i18nReady.then(() => createRoot(document.getElementById('root')!).render(<App />));
