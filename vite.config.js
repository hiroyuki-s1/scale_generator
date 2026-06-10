import { defineConfig } from 'vite';
import { build as esbuildBuild } from 'esbuild';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

// Service Worker のキャッシュ名に使うバージョン文字列。
// **コミットごとに必ず変わる**ので、push → デプロイのたびに SW のキャッシュ名が
// 変わり、旧 SW が更新され activate で旧キャッシュが破棄される (古いキャッシュが
// 端末に残り続ける問題の再発防止)。
// ※ これは Cache API (アセットの一時キャッシュ) のバージョン。ユーザーの登録スケールは
//    localStorage('sg.v1.state') に保存されており Cache API とは別物なので、
//    キャッシュ破棄で登録スケールが消えることはない。
const swVersion = `${pkg.version}-${commitHash}`;

// public/sw.js 内のプレースホルダ '__SW_VERSION__' を swVersion に置換する。
//   - build: dist/sw.js を書き換え (closeBundle)
//   - dev:   /sw.js リクエストを横取りして置換して返す (configureServer)
function swVersionInjectPlugin() {
  const swSrcPath = join(__dirname, 'public', 'sw.js');
  const replace = (src, suffix = '') => src.replace(/__SW_VERSION__/g, swVersion + suffix);
  return {
    name: 'sw-version-inject',
    apply: () => true,
    closeBundle() {
      const swOutPath = join(__dirname, 'dist', 'sw.js');
      if (!existsSync(swOutPath)) return;
      writeFileSync(swOutPath, replace(readFileSync(swOutPath, 'utf8')));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path === '/sw.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(replace(readFileSync(swSrcPath, 'utf8'), '-dev'));
          return;
        }
        next();
      });
    },
  };
}

// AudioWorklet を esbuild で「依存込みの自己完結 1 ファイル」にバンドルし、public/ に置く。
//   - worklet は実行時 import が不安定（相対 import 404・ブラウザ差）なので、domain/pitch.js
//     などを **インライン化**して 1 ファイルにする（数式はコピペせず一次ソースを共有）。
//   - 出力は public/ 配下なので安定 URL（${BASE_URL}pitchProcessor.worklet.js）で参照でき、
//     SW の実行時キャッシュに乗る（コミットhash版の cache 名でデプロイごとに更新）。
//   - build / dev(serve) の双方で buildStart 時に生成する。生成物は .gitignore 済み。
function pitchWorkletPlugin() {
  const entry = join(__dirname, 'src', 'audio', 'pitchProcessor.worklet.js');
  const outFile = join(__dirname, 'public', 'pitchProcessor.worklet.js');
  async function bundleWorklet() {
    await esbuildBuild({
      entryPoints: [entry],
      outfile: outFile,
      bundle: true,
      format: 'esm',       // import/export を解決しインライン化（worklet 内に import は残らない）
      target: 'es2022',
      legalComments: 'none',
    });
  }
  return {
    name: 'pitch-worklet-bundle',
    async buildStart() { await bundleWorklet(); },
  };
}

// base path の決定:
//   1. BASE_PATH が明示されていれば最優先。
//      ※ `GITHUB_*` は GitHub Actions の予約環境変数で `env:` から上書きできないため、
//        CI(staging) で Cloudflare 用の '/' を強制する手段として非予約の BASE_PATH を使う。
//   2. それ以外で GitHub Actions（= Pages ミラー deploy.yml）なら /scale_generator/。
//   3. ローカル開発・本番(Cloudflare)手動ビルドは '/'。
const base = process.env.BASE_PATH || (process.env.GITHUB_ACTIONS ? '/scale_generator/' : '/');

export default defineConfig({
  root: join(__dirname, 'src'),
  publicDir: join(__dirname, 'public'),
  base,
  plugins: [pitchWorkletPlugin(), swVersionInjectPlugin()],
  build: {
    outDir: join(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  define: {
    __COMMIT__: JSON.stringify(commitHash),
    __VERSION__: JSON.stringify(pkg.version),
  },
});
