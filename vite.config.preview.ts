/*
 * Copyright 2026 Codeo
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
