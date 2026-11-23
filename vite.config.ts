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
import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {src: '../manifest.json', dest: '.'},
        {src: '../public/*.*', dest: '.'},
        // License files ship inside the app package.
        {src: '../LICENSE', dest: '.'},
        {src: '../NOTICE', dest: '.'}
      ]
    }),
    viteStaticCopy({
      // Widget icons and configurations
      targets: [{src: 'widgets/**/*.{svg,png,jpg,json}', dest: '.'}],
      structured: true
    })
  ],
  root: './src',
  base: '',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    copyPublicDir: false,
    target: ['es2022'],
    assetsDir: 'widgets/assets',
    // ExcelJS (~940 kB) is lazy-loaded only when the user clicks Export.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        exportPage: resolve(__dirname, 'src/widgets/export-page/index.html')
      }
    }
  }
});
