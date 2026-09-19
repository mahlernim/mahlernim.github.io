import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/ttokttok/app/',
  build: { outDir: resolve(import.meta.dirname, '../../ttokttok/app'), emptyOutDir: false, sourcemap: false },
});
