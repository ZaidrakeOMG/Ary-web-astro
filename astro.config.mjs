import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://www.grupoary.com.mx',
  output: 'static', trailingSlash: 'always',
  outDir: process.env.ARY_OUT_DIR || './dist',
  build: { format: 'directory', inlineStylesheets: 'never' },
  // Keep shared UI scripts external so billing CSP can remain strict.
  vite: { build: { assetsInlineLimit: 0 } },
  compressHTML: true,
});
