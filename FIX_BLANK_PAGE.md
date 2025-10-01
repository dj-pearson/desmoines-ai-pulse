# Fix for Blank Page Issue

## What was fixed:

1. **Updated Content Security Policy (CSP)** in `public/_headers`:

   - Added `https://fonts.googleapis.com` to `connect-src`
   - Added `https://www.googletagmanager.com` to `connect-src`
   - Added `data:` to `font-src` to allow inline fonts

2. **Updated Header logo** to use `DMI-Logo-Header.png`

3. **Rebuilt the application** with the fixes

## To view the fixed site:

### Option 1: Preview the Production Build Locally

```powershell
npx serve dist
```

Then open your browser to `http://localhost:3000`

### Option 2: Run Development Server

```powershell
npm run dev
```

Then open your browser to `http://localhost:8080`

### Option 3: Deploy to Production

If you're viewing this on a deployed site (like Netlify/Vercel):

1. Commit and push the changes:
   ```powershell
   git add .
   git commit -m "Fix blank page issue - Update CSP headers and logo"
   git push
   ```
2. Wait for deployment to complete
3. **Important**: Clear your browser cache and service worker:
   - Open DevTools (F12)
   - Go to Application tab > Service Workers
   - Click "Unregister" for the old service worker
   - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

## Clear Browser Cache & Service Worker

The blank page was caused by the old service worker violating CSP rules. To see the fixed version:

1. **Open DevTools** (F12)
2. **Go to Application tab** (Chrome) or Storage tab (Firefox)
3. **Clear all storage**:
   - Click "Clear site data" or "Clear storage"
   - Check all boxes (Cache, Service Workers, etc.)
   - Click "Clear data"
4. **Hard refresh** the page: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

## What was causing the issue:

- The old service worker was caching resources with strict CSP rules
- CSP was blocking Google Fonts and Google Tag Manager
- This caused module loading errors and the "application/octet-stream" MIME type error
- The logo file path was also incorrect (DMI-Logo2.png vs DMI-Logo-Header.png)
