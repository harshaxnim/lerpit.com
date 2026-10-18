import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The dev server's own plugins under scripts/. Astro restarts the server when this file
 * changes and re-imports it with a fresh ?t=, but Node caches what it imports by URL, so
 * a restart would keep running the old copy of these. Loading them with a fresh ?t= of
 * their own makes every restart pick up their current code, and listing them in
 * DEV_WATCH (added with addWatchFile below) makes editing one restart the server. Each
 * is a single module with no local imports of its own, so nothing behind them goes stale.
 */
const DEV_PLUGINS = ['./scripts/dev-view-toggle.mjs', './scripts/lerpit-editor.mjs'];
const fresh = (file) => import(`${new URL(file, import.meta.url).href}?t=${Date.now()}`);
const [{ devViewToggle }, { editButtonMarkup, isEditorWrite, lerpitEditor }] = await Promise.all(DEV_PLUGINS.map(fresh));

function restartOnDevPluginChange() {
  return {
    name: 'lerpit-dev-plugins',
    hooks: {
      'astro:config:setup': ({ command, addWatchFile }) => {
        if (command !== 'dev') return;
        for (const file of DEV_PLUGINS) addWatchFile(new URL(file, import.meta.url));
      }
    }
  };
}

/**
 * The in-browser C++ toolchain runs its tools in workers backed by
 * SharedArrayBuffer, which the browser only hands to a cross-origin isolated
 * page. Astro renders HTML through its own middleware, so vite.server.headers
 * never reaches a page response; this sets them ahead of it.
 *
 * GitHub Pages cannot send headers at all, so production gets the same
 * isolation from website/public/coi-serviceworker.js instead.
 */
function crossOriginIsolation() {
  return {
    name: 'lerpit-cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        next();
      });
    }
  };
}

function lerpitWatcher() {
  return {
    name: 'lerpit-watcher',
    configureServer(server) {
      const root = path.dirname(fileURLToPath(import.meta.url));
      const lerpettesDir = path.join(root, 'lerpettes/content');
      const physicsWasmDir = path.join(root, 'lerpettes/libs/physics/wasm');

      server.watcher.add([
        path.join(lerpettesDir, '**/*.md'),
        path.join(lerpettesDir, '**/*.toml'),
        path.join(lerpettesDir, '**/code/**/js/*.ts'),
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

      /*
       * runtimeLoader.ts reaches its step runtimes through one import.meta.glob,
       * which Vite expands to a fixed map of paths when it transforms the module.
       * content.ts reads the disk on every dev request, so after a lerpette folder
       * is renamed it hands out new paths while that map may still hold the old
       * ones; nothing matches and the panel stays empty. Reloading the page does
       * not help, since the reload re-requests the same cached module.
       *
       * Vite does invalidate the glob on its own for an ordinary rename, so this
       * is a belt for the cases where it does not: an editor writing through a
       * temporary file, a move the watcher only sees as a directory event, a
       * server that has been up across a lot of churn.
       */
      const runtimeLoaderPath = path.join(root, 'website/src/lib/runtimeLoader.ts');
      let invalidateTimer;

      const invalidateRuntimeGlob = () => {
        clearTimeout(invalidateTimer);
        invalidateTimer = setTimeout(() => {
          const modules = server.moduleGraph.getModulesByFile(runtimeLoaderPath);
          if (!modules?.size) return;
          for (const mod of modules) {
            // Importers cached the map too, so they go with it.
            for (const importer of mod.importers) server.moduleGraph.invalidateModule(importer);
            server.moduleGraph.invalidateModule(mod);
          }
          server.config.logger.info('[lerpit] content tree changed, reloading step runtimes');
          server.ws.send({ type: 'full-reload' });
        }, 120);
      };

      const isCpp = (f) => /\.(cpp|h|hpp|cc|cxx)$/.test(f);
      const isMd = (f) => f.endsWith('.md');
      const isContent = (f) => f.split(path.sep).join('/').includes('/lerpettes/content/');

      // Only a lesson's Markdown is read per request; a README or a doc under docs/
      // changing must not reload every open page. A save from the local editor reloads
      // the pages it touched itself (scripts/lerpit-editor.mjs), so the editing tab keeps
      // its place; reloading every tab here would throw that away.
      const handler = (file) => {
        if (isMd(file) && isContent(file)) {
          if (!isEditorWrite(file)) triggerReload();
        } else if (isCpp(file)) runWasmBuild();
      };

      // A file appearing or vanishing is the tree changing shape, which is the only
      // thing that can stale the glob. Editing one cannot, so 'change' is not here.
      // An image or a document the editor adds is not code, so it cannot either; a code
      // folder it renames can.
      const structureChanged = (file) => {
        if (!isContent(file)) return;
        if (isEditorWrite(file) && !file.split(path.sep).includes('code')) return;
        invalidateRuntimeGlob();
      };

      server.watcher.on('change', handler);
      server.watcher.on('add', (file) => {
        handler(file);
        structureChanged(file);
      });
      server.watcher.on('unlink', structureChanged);
      server.watcher.on('addDir', structureChanged);
      server.watcher.on('unlinkDir', structureChanged);
    }
  };
}

const owner = process.env.GITHUB_REPOSITORY_OWNER ?? 'harshaxnim';
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'lerpit-wasm-blog';
const hasCustomDomainFile = fs.existsSync(new URL('./website/public/CNAME', import.meta.url));
const customDomain = process.env.CUSTOM_DOMAIN === 'true' || hasCustomDomainFile;
const site = process.env.SITE ?? (customDomain ? 'https://lerpit.com' : `https://${owner}.github.io`);

export default defineConfig({
  site,
  // The repo has two roots: website/ is the Astro app, lerpettes/ is the content
  // plus the framework and libs that authored lerpettes import.
  srcDir: './website/src',
  publicDir: './website/public',
  base: customDomain ? '/' : process.env.GITHUB_ACTIONS === 'true' ? `/${repo}/` : '/',
  // lerpitEditor adds the local editor's file API under `astro dev` only; see the file.
  integrations: [mdx(), lerpitEditor(), restartOnDevPluginChange()],
  // Dev server only: lets a localtunnel (`lt --port 4321`) reach it from another device.
  server: { allowedHosts: ['.loca.lt'] },
  vite: {
    resolve: {
      alias: {
        '@lerpit': fileURLToPath(new URL('./lerpettes', import.meta.url))
      }
    },
    optimizeDeps: {
      // The toolchain packages ship a `./subprocess_shim.py?raw` import. Vite's
      // dependency pre-bundler runs esbuild, which has no loader for .py and
      // fails; left unbundled, Vite's own ?raw handling resolves it.
      exclude: ['@gameguild/emception-browser', '@gameguild/emception-xterm', 'emception']
    },
    plugins: [crossOriginIsolation(), lerpitWatcher(), devViewToggle({ extraMarkup: editButtonMarkup })]
  }
});
