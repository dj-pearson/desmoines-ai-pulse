-- SEO-067: /restaurants/valley-junction failed check-pseo-demand. valley-junction
-- is an excluded zero-demand location (src/pseo/measuredDemand.ts) with no
-- Search Console data for this URL, and Valley Junction is part of West Des
-- Moines, whose area page already lists it. Unpublished, not deleted; the row
-- before this change is in restaurants-valley-junction-before.json. The URL
-- 301s to /restaurants/west-des-moines (public/_redirects, both branches).
update pseo_pages set is_published = false, updated_at = now()
where slug = '/restaurants/valley-junction' and is_published = true;
