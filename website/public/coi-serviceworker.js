/*
 * Cross-origin isolation for a host that cannot send headers.
 *
 * The in-browser C++ toolchain runs its tools in workers backed by SharedArrayBuffer,
 * which a browser only hands to a cross-origin isolated page. Isolation is granted by
 * two response headers, and GitHub Pages serves static files with no way to set any.
 *
 * A service worker sits between the page and the network and can add them to every
 * response it passes through, which is the one mechanism available here. The cost is
 * that it only works from the second load onwards: the first visit registers the
 * worker and reloads once so the reloaded page is the one the worker controls.
 *
 * The dev server sets the real headers, so this does nothing there.
 */

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', (event) => {
    const request = event.request;

    // A cache-only request that is not same-origin throws if we touch it, and it is
    // not ours to answer anyway.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
      return;
    }

    event.respondWith(
      fetch(request)
        .then((response) => {
          // An opaque response has no readable body or headers, so it is passed
          // through untouched. Anything cross-origin the page needs under isolation
          // has to be fetched with CORS instead, which is why the font stylesheet
          // carries a crossorigin attribute.
          if (response.status === 0) {
            return response;
          }

          const headers = new Headers(response.headers);
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        })
        .catch((error) => {
          // Offline, or a blocked request. Let it fail the way it would have anyway.
          console.error('[coi]', error);
          throw error;
        })
    );
  });
}
