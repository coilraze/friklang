import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages hosts this project under /friklang/; Vite dev keeps its default root base.
  base: process.env.GITHUB_PAGES === 'true' ? '/friklang/' : '/',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
