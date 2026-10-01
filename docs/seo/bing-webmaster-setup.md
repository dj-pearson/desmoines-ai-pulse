# Bing Webmaster Tools setup for desmoinesinsider.com (SEO-047)

This needs the owner: it is a sign-in to a Microsoft account and can't be done from the repo.

## Why bother

ChatGPT search draws on Bing's index alongside its own crawler, and Copilot is Bing. Google Search Console coverage does nothing for either. IndexNow (below) tells Bing about changed URLs, but Bing only reports what it did with them, and what it found wrong with the site, to a verified owner.

## What exists today (checked 2026-10-01)

- **No Bing verification yet.** `https://desmoinesinsider.com/BingSiteAuth.xml` returns the SPA's HTML with a 200, not an XML file. Neither `index.html` nor the live homepage carries a `msvalidate.01` meta tag, and the DNS TXT records hold only SPF and a `google-site-verification` value.
- **Google Search Console is verified by DNS** (the `google-site-verification` TXT record on the apex). That makes the import route below the quickest.
- **IndexNow is already live.** The key file `public/c2d7b3a0ed753ae68b306e25422227ff.txt` is served at the site root and returned 200 on 2026-10-01. Submissions go out from `scripts/indexnow-ping.ts` (daily rebuild and weekend-article workflows) and from the `regenerate-sitemaps` edge function. Bing accepts IndexNow without Webmaster Tools; verifying just makes the results visible.
- `robots.txt` already lists `sitemap.xml` and all fourteen child sitemaps, and allows `Bingbot`.

## Steps

### Option A: import from Google Search Console (about two minutes)

1. Go to https://www.bing.com/webmasters and sign in with the Microsoft account that should own the property. A personal account works; a work account is better if more than one person will need access later.
2. On "Add your site", choose **Import your sites from GSC**.
3. Sign in with the Google account that owns the desmoinesinsider.com property in Search Console and approve the read-only permission Bing asks for.
4. Tick `https://desmoinesinsider.com/` and click **Import**. Bing copies the verification and the sitemaps GSC already knows about.
5. Continue with "After verification" below.

### Option B: verify directly, if the GSC import fails or you'd rather not link the accounts

1. At https://www.bing.com/webmasters choose **Add your site manually** and enter `https://desmoinesinsider.com/`.
2. Pick one method:
   - **DNS (recommended, matches how Google is verified):** Bing shows a CNAME (a host like `<long-id>.desmoinesinsider.com` pointing to `verify.bing.com`). Add it in the Cloudflare DNS dashboard for desmoinesinsider.com, **DNS only** (grey cloud, not proxied). Wait a few minutes and click **Verify**.
   - **XML file:** download `BingSiteAuth.xml` from Bing, commit it to `public/BingSiteAuth.xml` on a branch off `develop`, and get it to `main`. Confirm `curl -sI https://desmoinesinsider.com/BingSiteAuth.xml` reports `Content-Type: application/xml`; until it does, the SPA fallback answers instead and verification fails. Then click **Verify**.
   - **Meta tag:** add the `<meta name="msvalidate.01" content="...">` line Bing gives you to `index.html`'s `<head>`, ship it, then **Verify**. This is the slowest route here because it needs a full release; prefer DNS.
3. Continue below.

### After verification

1. **Sitemaps** (left menu, Sitemaps, **Submit sitemap**): submit `https://desmoinesinsider.com/sitemap.xml`. That index lists every child sitemap, so the one submission covers them. If Bing later shows a child as "not fetched", submit that child directly too; the full list is at the bottom of `public/robots.txt`.
2. **IndexNow** (left menu, IndexNow): after a day it should show submissions arriving with key `c2d7b3a0ed753ae68b306e25422227ff`. If it shows none, check the "Submit changed URLs to IndexNow" job in the Daily Prerender Rebuild workflow.
3. **URL Inspection**: spot-check `https://desmoinesinsider.com/articles/haunted-houses-near-des-moines` (submitted through IndexNow on 2026-10-01) to see whether Bing fetched it.
4. **Settings, Users**: add anyone else who needs access as Read-only or Administrator, rather than sharing the sign-in.
5. Record in the PRD notes for SEO-047 the date verified, the method used, and the "Discovered" and "Indexed" counts Bing shows after a week, so there is a baseline.

## Brave Search

Brave has no webmaster console and no submission API; it finds pages with its own crawler. The SEO-047 check was `site:desmoinesinsider.com` on search.brave.com, and on 2026-10-01 it couldn't be made from the agent: both a plain fetch and WebFetch got HTTP 429 with a CAPTCHA page, and the browser extension wasn't connected. To get the count, open https://search.brave.com/search?q=site%3Adesmoinesinsider.com in a normal browser and record the number of results and a few of the URLs in the SEO-047 notes.
