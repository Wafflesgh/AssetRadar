/** main.tsx — Browser entry point: sets up the PWA helpers, mounts the React App into #root and loads global CSS. */
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initPwa} from './pwa.ts';
import './index.css';

initPwa();
createRoot(document.getElementById('root')!).render(<App />);
