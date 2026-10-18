/*
 * The local editor, for the dev server only. Pages edit themselves in place:
 *
 *   the pencil                a button beside the L/P switch on every page the dev
 *                             server sends (dev-view-toggle.mjs injects editButtonMarkup
 *                             below). Pressing it imports website/src/editor/client/boot.ts,
 *                             which turns that page into its own editor.
 *   /__lerpit/edit/api/…      the file API (website/src/editor/server/api.ts), served
 *                             by a Vite middleware and loaded through Vite, so it shares
 *                             content.ts with the pages. Added only when Astro runs `dev`.
 *
 * A build has neither: no dev server injects the pencil, and nothing a page imports
 * reaches website/src/editor.
 *
 * The API writes files, so it answers only the machine it runs on: a request must name
 * localhost as its host (astro.config allows .loca.lt tunnels for showing the site on a
 * phone, and a tunnel must never be able to write), and a browser request from another
 * origin is refused, so a web page cannot post to it behind the author's back.
 */

const API = '/__lerpit/edit/api/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostName(value) {
  if (!value) return '';
  return value.startsWith('[') ? value.slice(0, value.indexOf(']') + 1) : value.split(':')[0];
}

/** Whether a request comes from this machine, to this machine, from the editor's own page. */
export function isLocalRequest(req) {
  if (!LOCAL_HOSTS.has(hostName(req.headers.host))) return false;
  // Proxies and tunnels add these; a direct request from the author's browser does not.
  if (req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  }
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Whether the editor just wrote this file. The content watcher in astro.config.mjs
 * skips its reload-every-tab for these: the API reloads only the pages showing the
 * file instead, so the editor's own tab keeps its place and its unsaved work.
 */
export function isEditorWrite(file, windowMs = 3000) {
  const writes = globalThis.__lerpitEditorWrites;
  if (!writes) return false;
  for (const [written, at] of writes) {
    if (Date.now() - at > windowMs) continue;
    if (file === written || file.startsWith(written + '/')) return true;
  }
  return false;
}

function apiMiddleware(server) {
  return async (req, res, next) => {
    if (!req.url?.startsWith(API)) return next();

    const send = (status, json) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(json));
    };

    if (!isLocalRequest(req)) {
      send(403, { error: 'The editor only answers requests from this machine.' });
      return;
    }

    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.slice(API.length).replace(/\/$/, '');
      const body = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req);
      const api = await server.ssrLoadModule('/website/src/editor/server/api.ts');
      const reply = await api.handle(req.method, route, url.searchParams, body);

      // A new page's files, reported to the watcher now rather than whenever it notices:
      // Astro rebuilds its route list on the watcher's 'add', and the browser navigates to
      // the new page the moment this replies. Reported twice is harmless; late is a 404.
      for (const file of reply.created ?? []) server.watcher.emit('add', file);

      // Only the pages showing what changed reload. Vite's client reloads a tab for a
      // payload path ending in .html only when the tab is on that page.
      for (const page of reply.reload ?? []) {
        server.ws.send({ type: 'full-reload', path: `${page}index.html` });
      }
      send(reply.status, reply.json);
    } catch (error) {
      send(error.status ?? 500, { error: error.message ?? String(error) });
    }
  };
}

/**
 * The pencil beside the L/P switch: turns the page it sits on into its own editor.
 * The editor's code (website/src/editor/client) is only imported when it is pressed,
 * or when the tab was in edit mode before a reload.
 */
export function editButtonMarkup() {
  return `
<button type="button" id="lerpit-edit-button" aria-pressed="false" aria-label="Edit this page" title="Edit this page (local only)">
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>
</button>
<style>
  #lerpit-edit-button {
    position: fixed;
    right: 3.5rem;
    bottom: 1rem;
    z-index: 2147483000;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: #fdfbf4;
    box-shadow: 0 6px 20px rgba(32, 49, 63, 0.16), inset 0 0 0 1.5px #2e6da4;
    color: #2e6da4;
    cursor: pointer;
  }
  #lerpit-edit-button:hover { background: #eef3f8; }
  #lerpit-edit-button[aria-pressed="true"] { background: #2e6da4; color: #fdfbf4; }
  #lerpit-edit-button:focus-visible { outline: 2px solid #20313f; outline-offset: 2px; }
  @media (max-width: 600px) {
    #lerpit-edit-button { right: 2.6rem; bottom: 0.5rem; width: 1.6rem; height: 1.6rem; }
  }
  @media print { #lerpit-edit-button { display: none; } }
</style>
<script>
  (() => {
    const button = document.getElementById('lerpit-edit-button');
    const start = () => import('/website/src/editor/client/boot.ts').then((editor) => editor.start());
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') !== 'true') start();
    });
    // A tab that was editing before a reload (a save, a new lerpette) carries on.
    let on = null;
    try { on = sessionStorage.getItem('lerpit-editor:on'); } catch {}
    if (on === location.pathname) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
      else start();
    }
  })();
</script>
`;
}

export function lerpitEditor() {
  return {
    name: 'lerpit-editor',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        if (command !== 'dev') return;
        updateConfig({
          vite: {
            plugins: [{
              name: 'lerpit-editor-api',
              apply: 'serve',
              configureServer(server) {
                server.middlewares.use(apiMiddleware(server));
              }
            }]
          }
        });
      }
    }
  };
}
