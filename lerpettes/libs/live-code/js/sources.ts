/**
 * Getting a chapter's source files into the tab.
 *
 * The files a `lerpit` fence names are real sources in the repository, so an author
 * compiles and tests them the way they would any other file. This is what carries
 * them to the browser.
 *
 * Vite resolves the glob at build time, so every file is a chunk of its own and only
 * the chapters a reader opens are fetched. The alternative was the asset route, which
 * already carries `.cpp`; it does not carry `.js` or `.ts`, because `isAssetFile` in
 * content.ts keeps runtime source out of the published asset tree, and that rule is
 * right. A glob treats every extension the same.
 *
 * Precompiled wasm goes the other way, through `ctx.resolveAssetUrl`, because a
 * binary in `build/` is an asset and the site already publishes those.
 */

/** Sources as written, keyed by path relative to this file. */
const rawSources = import.meta.glob(
  [
    '../../../content/**/code/*/**/*.{cpp,cc,cxx,c,h,hpp,js,jsx,ts,tsx,mjs,glsl,vert,frag}',
    // The runtime entry is the author's wiring, never the reader's to edit, and a raw
    // copy of every one of them would ship in the bundle for nothing.
    '!../../../content/**/code/*/js/index.ts',
    '!../../../content/**/code/*/build/**'
  ],
  { query: '?raw', import: 'default' }
) as Record<string, () => Promise<string>>;

const CONTENT_ROOT = '../../../content/';

/**
 * Read one file a fence named.
 *
 * `codePath` is the chapter's own directory under lerpettes/content, which the player
 * hands the runtime, so a lesson never writes a path of its own. `path` is what the
 * author wrote in the fence, relative to that.
 */
export async function loadLiveCodeFile(codePath: string, path: string): Promise<string> {
  const key = `${CONTENT_ROOT}${codePath}/${path}`;
  const read = rawSources[key];
  if (!read) {
    throw new Error(`There is no file at code/${path} for this chapter.`);
  }

  return read();
}

/** Whether a fence's file exists, without reading it. */
export function hasLiveCodeFile(codePath: string, path: string): boolean {
  return `${CONTENT_ROOT}${codePath}/${path}` in rawSources;
}
