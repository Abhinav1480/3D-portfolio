import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure browser scroll restoration is disabled on page refresh so the tour always begins at the top
if (typeof window !== 'undefined') {
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);
}

createRoot(document.getElementById('root')!).render(<App />);

