// stats.lerpit.com: turns Cloudflare Web Analytics into a small public JSON feed for
// lerpit.com/analytics. The API token stays here as a secret; the response is cached at
// the edge for 10 minutes so page views don't hit the API.
//
// Bindings: ACCOUNT_ID, SITE_TAG (vars) and CF_API_TOKEN (secret, Account Analytics read).

const QUERY = `query ($acc: String!, $tag: String!, $d30: Date!, $t24: Time!, $t7: Time!) {
  viewer { accounts(filter: { accountTag: $acc }) {
    day: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $tag, datetime_geq: $t24 }) { count sum { visits } }
    week: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $tag, datetime_geq: $t7 }) { count sum { visits } }
    month: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $tag, date_geq: $d30 }) { count sum { visits } }
    daily: rumPageloadEventsAdaptiveGroups(limit: 31, filter: { siteTag: $tag, date_geq: $d30 }, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    refs: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { siteTag: $tag, date_geq: $d30 }, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { siteTag: $tag, date_geq: $d30 }, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
    devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: { siteTag: $tag, date_geq: $d30 }, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType } }
    browsers: rumPageloadEventsAdaptiveGroups(limit: 6, filter: { siteTag: $tag, date_geq: $d30 }, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { userAgentBrowser } }
  } }
}`;

const CACHE_SECONDS = 600;
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  // The site is cross-origin isolated (COEP require-corp), so say it may read this.
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
};

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const totals = (g) => ({ visits: g[0]?.sum.visits ?? 0, views: g[0]?.count ?? 0 });
const top = (g, key, blank) =>
  g.map((x) => ({ name: x.dimensions[key] || blank, visits: x.sum.visits })).filter((x) => x.visits > 0);

async function build(env) {
  const now = Date.now();
  const variables = {
    acc: env.ACCOUNT_ID,
    tag: env.SITE_TAG,
    d30: iso(now - 29 * 864e5).slice(0, 10),
    t24: iso(now - 864e5),
    t7: iso(now - 7 * 864e5),
  };
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const a = (await r.json())?.data?.viewer?.accounts?.[0];
  if (!a) return null;
  return {
    updated: iso(now),
    day: totals(a.day),
    week: totals(a.week),
    month: totals(a.month),
    daily: a.daily.map((x) => ({ date: x.dimensions.date, visits: x.sum.visits, views: x.count })),
    referrers: top(a.refs, "refererHost", "Direct / unknown"),
    countries: top(a.countries, "countryName", "Unknown"),
    devices: top(a.devices, "deviceType", "Unknown"),
    browsers: top(a.browsers, "userAgentBrowser", "Unknown"),
  };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method !== "GET" || url.pathname !== "/") {
      return new Response('{"error":"not found"}', { status: 404, headers });
    }
    const key = new Request(`${url.origin}/`);
    const hit = await caches.default.match(key);
    if (hit) return hit;

    const body = await build(env).catch(() => null);
    if (!body) {
      return new Response('{"error":"analytics unavailable"}', { status: 502, headers: { ...headers, "Cache-Control": "no-store" } });
    }
    const res = new Response(JSON.stringify(body), {
      headers: { ...headers, "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  },
};
