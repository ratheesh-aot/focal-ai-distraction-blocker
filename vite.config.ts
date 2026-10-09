import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Pages and the service worker. The content script is built separately
// (vite.content.config.ts) because it must be a single classic script.
export default defineConfig({
  root: 'src/ui',
  publicDir: resolve(import.meta.dirname, 'public'),
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        options: resolve(import.meta.dirname, 'src/ui/options/index.html'),
        popup: resolve(import.meta.dirname, 'src/ui/popup/index.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
