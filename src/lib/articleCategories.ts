/**
 * The article categories the editor offers. Plain strings stored in
 * articles.category. They used to come from an article_categories table that
 * was never created in production, so the editor's category list was empty
 * (WEB-QA-018, CMS branch: deleted rather than built).
 */
export const ARTICLE_CATEGORIES = [
  "General",
  "Events",
  "Restaurants",
  "Attractions",
  "Culture",
  "Business",
  "Tourism",
  "Entertainment",
  "Food & Drink",
  "Lifestyle",
] as const;
