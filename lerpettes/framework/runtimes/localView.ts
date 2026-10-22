/**
 * Local view or public view: the one question every authoring-only thing on the site asks.
 *
 * Local view is the dev server with its L/P switch (scripts/dev-view-toggle.mjs) on L:
 * drafts routed and listed, each card tagged, authoring problems spelled out, and the
 * authoring aids (the editor's pencil, the stage's step button, a restart that stays
 * paused, an error's line). Public view is the page exactly as a reader gets it once
 * deployed; a production build is always public view.
 *
 * The switch's choice is the `lerpit-view` cookie. Rendering on the server, the dev
 * server's middleware copies it into process.env.LERPIT_VIEW for each request; in the
 * browser, it is read from document.cookie. Flipping the switch reloads the page, so
 * asking once per render or per run is enough.
 *
 * Whether there is a dev server at all (a cache, a log, hot reload) is a different
 * question, and stays import.meta.env.DEV.
 */
export const VIEW_COOKIE = 'lerpit-view';

const PUBLIC = 'public';

export function isLocalView(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof document !== 'undefined') {
    const match = new RegExp(`(?:^|;\\s*)${VIEW_COOKIE}=([^;]*)`).exec(document.cookie);
    return match?.[1] !== PUBLIC;
  }
  // The framework is browser code and has no Node types; on the server, process is there.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  return env?.LERPIT_VIEW !== PUBLIC;
}
