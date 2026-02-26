import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import manifest from './manifest.config';

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(extensionRoot, '../..');
const walletSourceRoot = path.resolve(monorepoRoot, 'packages/wallet/src');

export default defineConfig({
  resolve: {
    alias: {
      '@onflow/frw-utils': path.resolve(__dirname, '../../packages/utils/src/logger.ts'),
    },
  },
  plugins: [crx({ manifest })],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
      port: 5173,
      protocol: 'ws',
    },
    fs: {
      allow: [monorepoRoot, walletSourceRoot],
    },
  },
  build: {
    target: 'chrome114',
    sourcemap: true,
  },
});
