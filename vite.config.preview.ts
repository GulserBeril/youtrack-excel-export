import {resolve} from 'node:path';
import {defineConfig, mergeConfig} from 'vite';

import base from './vite.config';

/*
 * Production build of the local preview page (src/dev/preview.html with the fake YouTrack host).
 * Lets us check the minified CSS/JS exactly as it ships, e.g. stylesheet order, before uploading.
 *   npm run preview:prod  ->  http://localhost:5174/dev/preview.html
 */
export default mergeConfig(base, defineConfig({
  build: {
    outDir: '../dist-preview',
    rollupOptions: {
      input: {
        preview: resolve(__dirname, 'src/dev/preview.html')
      }
    }
  },
  preview: {port: 5174, strictPort: true}
}));
