import { defineConfig } from 'vite';

export default defineConfig({
  base: '/scale_generator/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
