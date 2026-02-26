import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Flow Wallet v2',
  short_name: 'Flow Wallet v2',
  description: 'Next generation Flow wallet extension with popup + sidebar experience.',
  version: '0.1.0',
  minimum_chrome_version: '114',
  icons: {
    '16': 'src/assets/icon-16.png',
    '32': 'src/assets/icon-32.png',
    '48': 'src/assets/icon-48.png',
    '128': 'src/assets/icon-128.png',
  },
  action: {
    default_title: 'Flow Wallet v2',
    default_popup: 'src/popup/index.html',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  permissions: ['storage', 'activeTab', 'tabs', 'sidePanel', 'alarms'],
  host_permissions: ['https://*/*', 'http://*/*'],
});
