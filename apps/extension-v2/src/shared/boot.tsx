import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TamaguiProvider, Theme } from 'tamagui';

import '../styles/theme.css';
import { AppShell } from './app-shell';
import { tamaguiConfig } from './tamagui-config';
import type { UiSurface } from './types';

export function boot(surface: UiSurface) {
  document.body.classList.add(`surface-${surface}`);
  const approvalRequestId = new URLSearchParams(window.location.search).get('approvalRequestId');

  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root container not found');
  }

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
        <Theme name="dark">
          <AppShell surface={surface} approvalRequestId={approvalRequestId} />
        </Theme>
      </TamaguiProvider>
    </StrictMode>
  );
}
