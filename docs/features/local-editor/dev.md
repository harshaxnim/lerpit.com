# Local editor: for developers

The pencil beside the dev server's L/P switch turns the page you are on into its own
editor: a lesson page edits its `mixtape.md` and `control.toml`, a collection page its
`collection.md` and `control.toml`, the library page creates collections and lerpettes.
It exists only under `npm run dev`. The author-facing guide is
[user-guide.html](user-guide.html).

There is no admin guide: the site has one kind of privileged user, the author running the
dev server, and this is theirs.

## The shape

```
scripts/dev-view-toggle.mjs      injects the pencil (editButtonMarkup) with the L/P switch
scripts/lerpit-editor.mjs        Astro integration: dev only. Vite middleware for
                                 /__lerpit/edit/api/*, the localhost/origin guard,
                                 isEditorWrite() for the content watcher
astro.config.mjs                 registers it; the watcher skips reloads for editor writes

website/src/editor/
  server/api.ts                  the file API (loaded with ssrLoadModule, so it shares
                                 content.ts with the pages)
  lib/mixtapeDoc.ts              split a document at # / ## headings; join is byte-exact
  lib/tomlEdit.ts                line-level control.toml edits that keep comments
  client/boot.ts                 entry: decides lesson / collection / library
  client/lessonEditor.ts         edit mode on a lesson page
  client/collectionEditor.ts     edit mode on a collection page; the library's "new" forms
  client/markdownEditor.ts       CodeMirror + @codemirror/lang-markdown, toolbar, image drop
  client/dom.ts                  h(), api(), the bar, the sheet, toasts
  client/resume.ts               edit mode across reloads; holding Vite reloads while dirty
  client/editor.css              .ed-* styles, from global.css tokens
```

`website/src/lib/content.ts` gained one export, `renderMarkdownPreview(markdown, docDir,
codeDir)`, so the preview uses the page's own Markdown/KaTeX/figure/asset/code-box pipeline.
`LerpettePlayer.astro` and `CollectionShowcase.astro` carry `data-collection` /
`data-lerpette`, so the editor knows which files a page is (needed at `/`, whose URL does
not say). Those attributes are the only thing the feature adds to a production page.

## Data model

There is no new storage. The files are the model:

| file | how it is edited |
| --- | --- |
| `mixtape.md` | `splitDocument` cuts it into `head` (the byline) and sections (`#` title, `##` chapters) using remark positions, so `##` inside a fence, `$$` or a comment is never a cut. Untouched sections are written back byte for byte; an edited body goes through `tidyBody` (one blank line before the next heading). Headings round-trip through `readHeading`/`writeHeading`; an unchanged heading keeps its original spacing. Panels are a set of names turned into the shortest `+`/`-`/`=` ops by `panelOps`. |
| `control.toml` (both kinds) | `setKey` / `setTableKey` / `renameTableKey` rewrite single lines and re-parse the result to check it holds exactly the asked value; a shape they cannot edit (inline table, dotted key) throws `TomlEditError` and the UI points at the raw text. |
| `collection.md` | title line plus everything after it as one body. |
| images | written beside `mixtape.md`, slugged, never overwritten (`figure-2.png`). |

A new lerpette is `mixtape.md` (byline, `# Title {#intro +viewport2d}`, one chapter),
`control.toml` (`status = "draft"`), and `code/first-steps/js/index.ts` (the spring from
docs/authoring.md), so it opens alive with no problems.

## Endpoints

All under `/__lerpit/edit/api/`, JSON in and out.

| | |
| --- | --- |
| `GET tree` | collections and lerpettes (local view, whatever L/P says) |
| `GET lerpette?c&l` | `mixtape` / `control` as `{ text, hash }`, code folders, parsed steps and problems |
| `GET collection?c` | `document` / `control`, the lerpettes' card inputs, problems |
| `PUT file` | `{ c, l?, file, text, baseHash, quiet? }`. 409 with `detail.current` when the disk hash is not `baseHash`. An empty `control.toml` deletes the file. Returns the new hash and re-parsed problems. |
| `POST collection` / `POST lerpette` | scaffold; 409 if the folder exists |
| `POST render` | `{ c, l?, chapter?, markdown }` → `{ html, problems }` |
| `POST image?c&l&name` | raw bytes; images only, 15 MB cap |
| `POST rename-code` | `{ c, l, from, to }`: moves `code/<from>/`; 409 if `to` exists |

## The permission seam

The API writes files, so `isLocalRequest` answers only: a `Host` of localhost / 127.0.0.1 /
[::1]; no `X-Forwarded-*` (the dev server allows `.loca.lt` tunnels for phone testing, and
a tunnel must never write); an `Origin`, if present, equal to the host; `Sec-Fetch-Site`
same-origin or none. Every path is built from slugs (`^[a-z0-9][a-z0-9-]{0,62}$`) and
checked to resolve inside `lerpettes/content`. Only `mixtape.md`, `collection.md` and
`control.toml` are writable as text.

Production cannot reach any of it: the integration returns early unless
`command === 'dev'`, and nothing a page imports reaches `website/src/editor`
(`api.test.ts` checks both).

## Reloads

The content watcher in `astro.config.mjs` reloads every tab when a lesson's Markdown
changes. For editor writes it does not (`isEditorWrite`); the editor decides:

- prose-only edits (no heading, order, control or code-box change) are already rendered
  in place by the preview, so the tab stays as it is;
- anything the player builds from reloads the tab, and `resume.ts` brings it back in edit
  mode with the same chapters open at the same scroll;
- while the tab holds unsaved work, `holdReloads` re-points Vite's `full-reload` payload
  path so an outside save (VS Code) cannot wipe it; the next save meets a 409 and asks.

Unsaved work is also copied to `localStorage` (`lerpit-editor:draft:<c>/<l>`) and offered
back on the next visit; a draft taken against an older file is offered as raw text.

## Tests

```bash
npx vitest run website/src/editor     # splitter, TOML edits, API guards and endpoints
npm test                              # everything
node scripts/check-editor.mjs         # the editor in Chrome, against the running dev server
```

`scripts/check-editor.mjs` (65 checks) drives the real editor in headless Chrome, like
`check-site`. It creates `lerpettes/content/zz-editor-check/` through the editor, runs every
flow against it, and deletes it, pass or fail: the pencil in local view only; new
collection and lerpette (each landing on its page in edit mode); writing, live maths
preview, prose-only save without a reload, Esc; panels, add, move, delete and Undo, id
rename with its code folder and caption; settings with comments kept; image paste; an
outside save while dirty, then overwrite; draft restore; collection title, introduction and
card redraw; lerpette status and order from the collection; the collection's cards from a
lesson; Edit collection from the library; every real lerpette opening clean; phone (390px)
and drawer (1000px) widths with 40px touch targets. It hashes everything outside the
scratch collection before and after, so it also proves it touched nothing else. Screenshots
of every state land in `test-results/editor/`. Run it when you are not editing content:
a save of yours mid-run fails that last check, as it should.

- `mixtapeDoc.test.ts` joins every mixtape.md and collection.md in the repo back byte for
  byte, and checks `panelOps` against `resolvePanels`.
- `tomlEdit.test.ts` sets and unsets a probe key in every control.toml in the repo and
  expects the file unchanged.
- `api.test.ts` covers the localhost/origin guard, path traversal, the write allow-list,
  the 409, the dev-only integration, and that no page imports the editor.

Manual checks (headless Chrome, recorded in the build log): create collection → create
lerpette → edit/add/move/delete/rename chapters → settings → save; image paste; outside save
while dirty; every real lerpette opens with all boxes matched and nothing dirty; 390px
phone width.

## Extending

| To add | Do |
| --- | --- |
| a lerpette control | its row in `control.ts` FIELDS, then one `field(...)` in `renderSettings` (lessonEditor.ts) writing it with `setKey`/`setTableKey` |
| a collection control | `parseCollectionControl`, then the collection sheet |
| a toolbar action | one `tool(...)` in markdownEditor.ts |
| folder rename or delete | deferred. The API seam is `rename-code`'s shape one level up; the watcher already invalidates the runtime glob on directory moves. |

## Creating pages and the dev server

Two races, both caught by check-editor and both fixed:

- Astro's dev router learns a new page only when its file watcher reports the file, which
  can be after the browser has navigated there (a 404). The API returns `created` files and
  the middleware emits the watcher's `add` for them before replying.
- That same change makes the content watcher reload every tab, and the reload can reach
  the creating tab before the reply; reloading the old page would cancel the navigation.
  `createAndGo` (resume.ts) holds this tab's reloads from before the request until it has
  left. A collection's new folder is deliberately *not* marked as an editor write: the
  watcher's reaction to it is part of what rebuilds the route list.

## Known limits

- Other tabs on the same page are not reloaded by an editor save (only the editing tab
  is); refresh them by hand.
- A code box re-rendered by the preview is an empty placeholder until the save reloads
  the page and the player rebuilds it.
- A document whose `#`/`##` headings do not line up with the page's boxes (no title, or a
  setext heading the page reads differently) opens as raw text in Settings.

## Dev server restarts

Astro restarts on a change to `astro.config.mjs` and re-imports it with a fresh `?t=`,
but Node caches what the config imports. So the config loads `scripts/dev-view-toggle.mjs`
and `scripts/lerpit-editor.mjs` with a fresh `?t=` of their own (`DEV_PLUGINS`), and
registers both with `addWatchFile`: editing either restarts the server on its current code.
Neither imports another local module, so nothing behind them can go stale; keep it that
way (the pencil's markup is handed to the toggle as `extraMarkup` for this reason).
`website/src/editor/**` needs none of this: Vite serves and reloads it like any module.
