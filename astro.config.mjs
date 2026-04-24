import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function lerpitWatcher() {
  return {
    name: 'lerpit-watcher',
    configureServer(server) {
      const root = path.dirname(fileURLToPath(import.meta.url));
      const lerpettesDir = path.join(root, 'src/lerpettes');
      const physicsWasmDir = path.join(root, 'src/lib/physics/wasm');

      server.watcher.add([
        path.join(lerpettesDir, '**/*.md'),
        path.join(lerpettesDir, '**/wasm/*.cpp'),
        path.join(lerpettesDir, '**/wasm/*.h'),
        path.join(physicsWasmDir, '*.cpp'),
        path.join(physicsWasmDir, '*.h')
      ]);

      let building = false;
      let pending = false;
      let reloadTimer;

      const triggerReload = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => server.ws.send({ type: 'full-reload' }), 80);
      };

      const runWasmBuild = () => {
        if (building) { pending = true; return; }
        building = true;
        server.config.logger.info('[wasm] source changed, rebuilding…');
        const child = spawn('bash', ['scripts/build-wasm.sh'], { cwd: root, stdio: 'inherit' });
        child.on('exit', (code) => {
          building = false;
          if (code === 0) {
            server.config.logger.info('[wasm] rebuild complete');
            triggerReload();
          } else {
            server.config.logger.error(`[wasm] build failed (exit ${code})`);
          }
          if (pending) { pending = false; runWasmBuild(); }
        });
      };

      const isCpp = (f) => /\.(cpp|h|hpp|cc|cxx)$/.test(f);
      const isMd = (f) => f.endsWith('.md');

      const handler = (file) => {
        if (isMd(file)) triggerReload();
        else if (isCpp(file)) runWasmBuild();
      };

      server.watcher.on('change', handler);
      server.watcher.on('add', handler);
    }
  };
}

const owner = process.env.GITHUB_REPOSITORY_OWNER ?? 'harshaxnim';
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'lerpit-wasm-blog';
const hasCustomDomainFile = fs.existsSync(new URL('./public/CNAME', import.meta.url));
const customDomain = process.env.CUSTOM_DOMAIN === 'true' || hasCustomDomainFile;
const site = process.env.SITE ?? (customDomain ? 'https://lerpit.com' : `https://${owner}.github.io`);

export default defineConfig({
  site,
  base: customDomain ? '/' : process.env.GITHUB_ACTIONS === 'true' ? `/${repo}/` : '/',
  integrations: [mdx()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    plugins: [lerpitWatcher()]
  }
});
