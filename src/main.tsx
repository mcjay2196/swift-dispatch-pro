import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startMemoryWatchdog } from './utils/memoryWatchdog';

// Production: silence verbose logging. Every console.log retains the objects it
// logged for the lifetime of the tab, which matters on long-lived dispatch tabs.
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

startMemoryWatchdog();

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
