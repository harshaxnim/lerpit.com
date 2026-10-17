/*
 * Local view / public view, for the dev server only.
 *
 * A local build lists and routes every lerpette, drafts and unlisted ones
 * included, so an author can see what they are working on. That makes it hard to
 * see what a reader will actually get. This puts a floating switch on every page
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
 */

const COOKIE = 'lerpit-view';
const PUBLIC = 'public';
const LOCAL = 'local';

function readView(req) {
  const match = /(?:^|;\s*)lerpit-view=([^;]*)/.exec(req.headers.cookie ?? '');
  return match?.[1] === PUBLIC ? PUBLIC : LOCAL;
}

function toggleMarkup(view) {
  const option = (value, label, hint) => `
    <button type="button" data-view="${value}" aria-pressed="${view === value}" title="${hint}">${label}</button>`;

  return `
<div id="lerpit-view-toggle" role="group" aria-label="Dev server view" data-view="${view}">
  <span class="lvt__label">View</span>${option(LOCAL, 'Local', 'Everything, drafts and unlisted included, each tagged')}${option(PUBLIC, 'Public', 'Only what a production build shows')}
</div>
<style>
  #lerpit-view-toggle {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.25rem;
    border: 1px solid rgba(81, 131, 173, 0.72);
    border-radius: 999px;
    background: rgba(253, 251, 244, 0.96);
    box-shadow: 0 6px 20px rgba(32, 49, 63, 0.16);
    font: 600 0.78rem/1 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #20313f;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
  }
  #lerpit-view-toggle[data-view="public"] {
    border-color: #d17041;
  }
  #lerpit-view-toggle .lvt__label {
    padding: 0 0.35rem 0 0.55rem;
    color: #506270;
    font-weight: 400;
  }
  #lerpit-view-toggle button {
    min-height: 1.75rem;
    padding: 0 0.7rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  #lerpit-view-toggle button:hover {
    background: rgba(46, 109, 164, 0.08);
  }
  #lerpit-view-toggle button:focus-visible {
    outline: 2px solid #2e6da4;
    outline-offset: 1px;
  }
  #lerpit-view-toggle button[aria-pressed="true"] {
    background: #2e6da4;
    color: #fdfbf4;
    cursor: default;
  }
  #lerpit-view-toggle[data-view="public"] button[aria-pressed="true"] {
    background: #d17041;
  }
  @media print {
    #lerpit-view-toggle { display: none; }
  }
</style>
<script>
  document.querySelectorAll('#lerpit-view-toggle button').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      document.cookie = '${COOKIE}=' + button.dataset.view + '; path=/; max-age=31536000; SameSite=Lax';
      location.reload();
    });
  });
</script>
`;
}

/** Splices the switch in before </body>, or at the end when there is none. */
function inject(html, view) {
  const markup = toggleMarkup(view);
  const at = html.lastIndexOf('</body>');
  return at === -1 ? html + markup : html.slice(0, at) + markup + html.slice(at);
}

function isHtml(headers) {
  const type = headers['content-type'] ?? headers['Content-Type'];
  return typeof type === 'string' && type.includes('text/html');
}

export function devViewToggle() {
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
          const body = inject(Buffer.concat(held).toString('utf8'), view);
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
