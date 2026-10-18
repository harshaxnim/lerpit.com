/*
 * Local view / public view, for the dev server only.
 *
 * A local build lists and routes every lerpette, drafts and unlisted ones
 * included, so an author can see what they are working on. That makes it hard to
 * see what a reader will actually get. This puts a floating button on every page
 * the dev server sends: public view hides exactly what a production build hides,
 * because content.ts runs the same rules (see hidesLikeProduction there), not a
 * stylesheet imitating them. A draft is a 404 in public view, as it is once deployed.
 *
 * The choice is a cookie, so it holds across pages, tabs and server restarts.
 * Each request copies it into process.env.LERPIT_VIEW, which content.ts reads
 * when it builds the library for that request.
 *
 * The switch is injected into the HTML here rather than rendered by a layout, so
 * it is on every page including Astro's own 404 (where switching to public view
 * on a draft lands), and cannot reach a production build at all: there is no
 * dev server there.
 *
 * Other dev-only chrome rides along through `extraMarkup` (the editor's pencil, from
 * lerpit-editor.mjs), in local view only. Handed in by astro.config.mjs rather than imported here, so this
 * file imports nothing local and the config can load it fresh on every restart.
 */

const COOKIE = 'lerpit-view';
const PUBLIC = 'public';
const LOCAL = 'local';

function readView(req) {
  const match = /(?:^|;\s*)lerpit-view=([^;]*)/.exec(req.headers.cookie ?? '');
  return match?.[1] === PUBLIC ? PUBLIC : LOCAL;
}

function toggleMarkup(view) {
  // One round button carrying the current view's initial, L or P. Pressing it
  // switches to the other view; the tooltip says which one that is.
  const next = view === PUBLIC ? LOCAL : PUBLIC;
  const hint = view === PUBLIC
    ? 'Public view: only what a production build shows. Click for local view.'
    : 'Local view: everything, drafts and unlisted included, each tagged. Click for public view.';

  return `
<button type="button" id="lerpit-view-toggle" data-view="${view}" data-next="${next}" aria-label="${hint}" title="${hint}">${view === PUBLIC ? 'P' : 'L'}</button>
<style>
  #lerpit-view-toggle {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 2147483000;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: #2e6da4;
    box-shadow: 0 6px 20px rgba(32, 49, 63, 0.16);
    color: #fdfbf4;
    font: 700 0.85rem/1 "Syne", system-ui, -apple-system, "Segoe UI", sans-serif;
    cursor: pointer;
  }
  #lerpit-view-toggle[data-view="public"] {
    background: #d17041;
  }
  #lerpit-view-toggle:hover {
    filter: brightness(1.08);
  }
  #lerpit-view-toggle:focus-visible {
    outline: 2px solid #20313f;
    outline-offset: 2px;
  }
  /* Smaller on a phone, where the full size covers a line of prose. */
  @media (max-width: 600px) {
    #lerpit-view-toggle { right: 0.5rem; bottom: 0.5rem; width: 1.6rem; height: 1.6rem; font-size: 0.72rem; }
  }
  @media print {
    #lerpit-view-toggle { display: none; }
  }
</style>
<script>
  document.getElementById('lerpit-view-toggle').addEventListener('click', (event) => {
    document.cookie = '${COOKIE}=' + event.currentTarget.dataset.next + '; path=/; max-age=31536000; SameSite=Lax';
    location.reload();
  });
</script>
`;
}

/** Splices the switch (and the editor's pencil beside it) in before </body>, or at the end when there is none. */
function inject(html, view, extraMarkup) {
  // The extra chrome is for authoring, so it shows in local view only; public view is
  // the page as a reader gets it.
  const markup = toggleMarkup(view) + (view === LOCAL ? extraMarkup() : '');
  const at = html.lastIndexOf('</body>');
  return at === -1 ? html + markup : html.slice(0, at) + markup + html.slice(at);
}

function isHtml(headers) {
  const type = headers['content-type'] ?? headers['Content-Type'];
  return typeof type === 'string' && type.includes('text/html');
}

export function devViewToggle({ extraMarkup = () => '' } = {}) {
  return {
    name: 'lerpit-dev-view-toggle',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const view = readView(req);
        process.env.LERPIT_VIEW = view;

        // Only page navigations get the switch. Modules, assets and HMR pass straight through.
        if (req.method !== 'GET' || !(req.headers.accept ?? '').includes('text/html')) {
          next();
          return;
        }

        // Astro streams a page as writeHead, then write per chunk, then end. An HTML
        // response is held back whole so the switch can go in before </body>, and
        // its length dropped since it no longer matches. Anything else is let
        // through untouched the moment its headers show it is not HTML.
        const writeHead = res.writeHead.bind(res);
        const write = res.write.bind(res);
        const end = res.end.bind(res);
        let held = null;
        let decided = false;

        const decide = () => {
          if (decided) return;
          decided = true;
          const headers = {};
          for (const name of res.getHeaderNames()) headers[name] = res.getHeader(name);
          if (isHtml(headers)) held = [];
        };

        res.writeHead = (status, ...rest) => {
          const headers = rest.find((value) => value && typeof value === 'object' && !Array.isArray(value));
          if (headers) {
            for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
          }
          res.statusCode = status;
          const message = rest.find((value) => typeof value === 'string');
          if (message) res.statusMessage = message;
          decide();
          if (!held) return writeHead(status, ...rest);
          return res;
        };

        res.write = (chunk, ...rest) => {
          decide();
          if (!held) return write(chunk, ...rest);
          if (chunk != null) held.push(Buffer.from(chunk));
          return true;
        };

        res.end = (chunk, ...rest) => {
          decide();
          if (!held) return end(chunk, ...rest);
          if (chunk != null && typeof chunk !== 'function') held.push(Buffer.from(chunk));
          const body = inject(Buffer.concat(held).toString('utf8'), view, extraMarkup);
          res.removeHeader('content-length');
          res.setHeader('content-length', Buffer.byteLength(body));
          writeHead(res.statusCode);
          return end(body);
        };

        next();
      });
    }
  };
}
