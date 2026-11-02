// stats.lerpit.com: turns Cloudflare Web Analytics into a small public JSON feed for
// lerpit.com/analytics. The API token stays here as a secret; the response is cached at
// the edge for 10 minutes so page views don't hit the API.
//
// Bindings: ACCOUNT_ID, SITE_TAG (vars) and CF_API_TOKEN (secret, Account Analytics read).

// Cloudflare answers a query spanning more than about 8 days from a summary that misses the
// newest half a day or more, so a 30-day query undercounts. The 30 days are asked for as two
// windows instead, the last 7 days and the 23 before them, and added up here. Each window is
// short enough, or old enough, to be complete.
const WINDOWS = {
  recent: "datetime_geq: $t7",
  older: "datetime_geq: $t30, datetime_lt: $t7",
};

// What is asked of each window: [arguments, fields]. The lists ask for more rows than they
// return, so a row that is just outside one window's top rows still adds up right.
const GROUPS = {
  totals: ["limit: 1", "count sum { visits }"],
  daily: ["limit: 40, orderBy: [date_ASC]", "count sum { visits } dimensions { date }"],
  pages: ["limit: 30, orderBy: [count_DESC]", "count sum { visits } dimensions { requestPath }"],
  refs: ["limit: 30, orderBy: [sum_visits_DESC]", "count sum { visits } dimensions { refererHost }"],
  countries: ["limit: 100, orderBy: [sum_visits_DESC]", "count sum { visits } dimensions { countryName }"],
  devices: ["limit: 10, orderBy: [sum_visits_DESC]", "count sum { visits } dimensions { deviceType }"],
  browsers: ["limit: 20, orderBy: [sum_visits_DESC]", "count sum { visits } dimensions { userAgentBrowser }"],
};

const QUERY = `query ($acc: String!, $tag: String!, $t30: Time!, $t24: Time!, $t7: Time!) {
  viewer { accounts(filter: { accountTag: $acc }) {
    day: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $tag, datetime_geq: $t24 }) { count sum { visits } }
${Object.entries(WINDOWS).flatMap(([window, filter]) =>
  Object.entries(GROUPS).map(([group, [args, fields]]) =>
    `    ${window}_${group}: rumPageloadEventsAdaptiveGroups(${args}, filter: { siteTag: $tag, ${filter} }) { ${fields} }`)).join("\n")}
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

// Both windows' rows of one group, added up by key and ranked by `by`.
function merge(a, group, key, by, limit) {
  const rows = new Map();
  for (const x of [...a[`recent_${group}`], ...a[`older_${group}`]]) {
    const name = x.dimensions[key];
    const row = rows.get(name) ?? { name, visits: 0, views: 0 };
    row.visits += x.sum.visits;
    row.views += x.count;
    rows.set(name, row);
  }
  return [...rows.values()].sort((p, q) => q[by] - p[by]).slice(0, limit);
}

const top = (a, group, key, blank, limit) =>
  merge(a, group, key, "visits", limit)
    .filter((x) => x.visits > 0)
    .map((x) => ({ name: x.name || blank, visits: x.visits }));

async function build(env) {
  const now = Date.now();
  const variables = {
    acc: env.ACCOUNT_ID,
    tag: env.SITE_TAG,
    t30: `${iso(now - 29 * 864e5).slice(0, 10)}T00:00:00Z`, // 30 whole days, today included
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
  const week = totals(a.recent_totals);
  const before = totals(a.older_totals);
  return {
    updated: iso(now),
    day: totals(a.day),
    week,
    month: { visits: week.visits + before.visits, views: week.views + before.views },
    daily: merge(a, "daily", "date", "visits", 40)
      .sort((p, q) => p.name.localeCompare(q.name))
      .map((x) => ({ date: x.name, visits: x.visits, views: x.views })),
    pages: merge(a, "pages", "requestPath", "views", 10).map((x) => ({ path: x.name, visits: x.visits, views: x.views })),
    referrers: top(a, "refs", "refererHost", "Direct / unknown", 10),
    countries: top(a, "countries", "countryName", "Unknown", 60),
    devices: top(a, "devices", "deviceType", "Unknown", 5),
    browsers: top(a, "browsers", "userAgentBrowser", "Unknown", 6),
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
