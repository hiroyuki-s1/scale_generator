import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

export default defineConfig({
  base: '/scale_generator/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    __COMMIT__: JSON.stringify(commitHash),
  },
});
