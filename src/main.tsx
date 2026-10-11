import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import './monaco';

import { createTheme, MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'sm',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "Cascadia Code", ui-monospace, Consolas, monospace',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
      <ModalsProvider>
        <Notifications position="bottom-right" />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
