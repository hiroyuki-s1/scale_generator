import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

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
    __VERSION__: JSON.stringify(pkg.version),
  },
});
