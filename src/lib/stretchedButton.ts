/**
 * Classes for a real <button> whose ::after covers its nearest positioned
 * ancestor, so a whole card stays clickable while Tab reaches it once and
 * Enter/Space operate it. Give the card `relative`, and give anything inside
 * the card that must stay clickable on its own (menus, links) `relative z-10`.
 * The focus ring is drawn on the ::after so it outlines the card, not the text.
 * WEB-UX-052 introduced the pattern; WEB-UX-057 named it.
 */
export const STRETCHED_BUTTON_CLASS =
  "rounded-sm text-left after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2";
