/**
 * The JSON-LD @id of the main entity on each detail page (WEB-SEO-073).
 *
 * Two places emit that node: the React page, and the edge shell in
 * functions/_middleware.ts for a crawler that runs no JavaScript. Helmet only
 * removes tags it wrote, so a crawler that does run JavaScript can see both
 * blocks. They must carry the same @id, or a graph parser reads two Events for
 * one page. The shell had used the bare page URL for every type, which is the
 * @id of the page's own WebPage node, so on event, attraction, playground and
 * article pages the entity also merged into "a WebPage that is an Event".
 *
 * The fragments are the ones the React builders already used. Restaurant is the
 * bare URL because its page emits no WebPage node and both sides share
 * buildRestaurantSchema. No imports: the Pages bundler reads this file too.
 */
export const ENTITY_NODE_FRAGMENT = {
  event: "#event",
  attraction: "#place",
  playground: "#place",
  hotel: "#hotel",
  article: "#article",
  restaurant: "",
} as const;

export type EntityNodeKind = keyof typeof ENTITY_NODE_FRAGMENT;

export function isEntityNodeKind(kind: string): kind is EntityNodeKind {
  return Object.prototype.hasOwnProperty.call(ENTITY_NODE_FRAGMENT, kind);
}

export function entityNodeId(kind: EntityNodeKind, pageUrl: string): string {
  return `${pageUrl}${ENTITY_NODE_FRAGMENT[kind]}`;
}
