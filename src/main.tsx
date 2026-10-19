/** main.tsx — Browser entry point: mounts the React App into #root and loads global CSS. */
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
