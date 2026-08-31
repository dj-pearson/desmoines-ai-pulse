/**
 * The order the entity prerender pass spends its budget in (SEO-027).
 *
 * WHY THIS IS ITS OWN MODULE. The entity pass is a wall-clock race it LOSES:
 * measured on production 2026-08-31, 267 of 1,127 entity URLs were rendered
 * inside the 420s budget and 860 shipped an SPA shell. That is not going to stop
 * being true - see the arithmetic in prerender.mjs - so the order in which the
 * budget is spent decides which pages a JS-less crawler can read. It is the
 * highest-leverage number in the prerender step and it deserves to be tested on
 * its own rather than inferred from a build log.
 *
 * WHAT WAS WRONG WITH THE OLD ORDER. It was per-SITEMAP priority, and within a
 * sitemap the URLs arrive in whatever order the generator emitted - which is
 * alphabetical. So coverage was decided by the first letter of a slug. Joined
 * against gsc_page_performance over the trailing 365 days on 2026-08-31:
 *
 *   first 267 rendered, alphabetical    44,965 of 93,272 impressions   48%
 *   first 267 rendered, this module     91,257 of 93,272 impressions   98%
 *
 * Same budget, same machine, same strict gate - twice the measured value, because
 * /restaurants/the-pizza-bar (8,089 impressions, 421st alphabetically) and
 * /restaurants/yard-house (4,478, 471st) were never going to be reached and
 * /restaurants/100th-st-corner-cafe (0 impressions) was always first.
 *
 * TWO INPUTS, DELIBERATELY IN TENSION:
 *
 *   ranked    every entity URL by measured impressions, descending. This is the
 *             value axis and it is steep - 462 of 1,128 URLs have any measured
 *             impressions at all, and the top 200 hold most of them.
 *   fair      round-robin across sitemaps in priority order. This is the
 *             fairness axis, and it exists because ranking alone starves whole
 *             categories: pure impression order gives events 8 of 267 slots,
 *             because 495 of 525 event URLs are future-dated and have no history
 *             yet. A page with no impressions is not a page with no value; it is
 *             usually a page that is NEW. Ranking alone would make "never
 *             rendered" self-fulfilling for every category that turns over.
 *
 * `fairnessEvery` interleaves them: every Nth slot is drawn from `fair`, the rest
 * from `ranked`. N=4 was chosen by measuring both axes rather than by taste:
 *
 *   N     impressions captured at 267 slots    events slots    categories present
 *   none  92,207 (99%)                          8               7
 *   3     90,691 (97%)                         20              13
 *   4     91,257 (98%)                         16              13
 *   8     91,814 (98%)                         13              10
 *
 * N=4 buys every category a share for one percentage point of impressions.
 *
 * This module is PURE and takes impressions as data. prerender.mjs runs on a
 * build host with no service credentials, so the measured figures are committed
 * to scripts/prerender-priority.json by generate-prerender-priority.mjs and read
 * from there. An empty or missing priority file degrades to the fairness
 * round-robin, which is still strictly better than alphabetical.
 */

/**
 * @param {Array<[string, string[]]>} bySitemap  [sitemapName, routes] in the
 *   priority order the caller wants for ties and for the fairness round-robin.
 * @param {Record<string, number>} impressions   pathname -> measured impressions.
 * @param {number} fairnessEvery  every Nth slot is drawn from the round-robin.
 *   0 disables the fairness axis entirely (ranked order only).
 * @returns {string[]} every route exactly once, in the order to render them.
 */
export function orderEntityRoutes(bySitemap, impressions = {}, fairnessEvery = 4) {
  const priorityOf = new Map();
  const all = [];
  bySitemap.forEach(([, routes], sitemapIndex) => {
    routes.forEach((route, positionInSitemap) => {
      if (priorityOf.has(route)) return; // caller already de-duplicated; be safe
      priorityOf.set(route, [sitemapIndex, positionInSitemap]);
      all.push(route);
    });
  });

  const impressionsOf = (route) => impressions[route] ?? 0;

  // Value axis. Ties break on sitemap priority then original position, so the
  // output is fully deterministic - two builds of one tree must render the same
  // pages, or check-entity-coverage is measuring the weather.
  const ranked = [...all].sort((a, b) => {
    const byImpressions = impressionsOf(b) - impressionsOf(a);
    if (byImpressions !== 0) return byImpressions;
    const [sa, pa] = priorityOf.get(a);
    const [sb, pb] = priorityOf.get(b);
    return sa - sb || pa - pb;
  });

  // Fairness axis: the i-th URL of every sitemap before the (i+1)-th of any.
  const fair = [];
  const longest = Math.max(0, ...bySitemap.map(([, routes]) => routes.length));
  for (let i = 0; i < longest; i += 1) {
    for (const [, routes] of bySitemap) {
      if (i < routes.length) fair.push(routes[i]);
    }
  }

  const emitted = new Set();
  const out = [];
  let rankedAt = 0;
  let fairAt = 0;
  const nextFrom = (list, cursor) => {
    let i = cursor;
    while (i < list.length && emitted.has(list[i])) i += 1;
    return i;
  };

  while (out.length < all.length) {
    const wantFair = fairnessEvery > 0 && (out.length + 1) % fairnessEvery === 0;
    rankedAt = nextFrom(ranked, rankedAt);
    fairAt = nextFrom(fair, fairAt);
    // Fall back to whichever source still has routes left.
    const useFair = wantFair ? fairAt < fair.length : rankedAt >= ranked.length;
    const route = useFair ? fair[fairAt] : ranked[rankedAt];
    if (route === undefined) break; // both exhausted; cannot happen, but do not spin
    emitted.add(route);
    out.push(route);
  }

  return out;
}
