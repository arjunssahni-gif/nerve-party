import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StagePreview } from './screens/StagePreview';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.DEV && location.search.includes('stagePreview') ? <StagePreview /> : <App />}
  </StrictMode>,
);
