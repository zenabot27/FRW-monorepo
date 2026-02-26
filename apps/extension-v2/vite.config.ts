import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';

import manifest from './manifest.config';

export default defineConfig({
  resolve: {
    alias: {
      '@onflow/frw-utils': path.resolve(__dirname, '../../packages/utils/src/logger.ts'),
    },
  },
  plugins: [crx({ manifest })],
  build: {
    target: 'chrome114',
    sourcemap: true,
  },
});
