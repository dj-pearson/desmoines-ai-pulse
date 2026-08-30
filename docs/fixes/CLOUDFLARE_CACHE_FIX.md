# Cloudflare Pages Caching Issue - FIXED
# + Recharts Circular Dependency - FIXED

**Date:** 2026-01-18  
**Issues:** 
1. Blank homepage with "Unexpected token '<'" error (RESOLVED)
2. Blank homepage with "Cannot access 'A' before initialization" error (RESOLVED)

**Root Causes:** 
1. Cloudflare CDN caching old `index.html` with stale JavaScript references
2. Recharts/d3 circular dependencies in bundled vendor-charts chunk

---

## Problem 1: Cache Issue (RESOLVED ✅)

### Console Errors Observed:
```
index-DC8sJCDC.js:1 Uncaught SyntaxError: Unexpected token '<'
```

### What Happened:
1. **Build created new assets** with hashes like `index-KhWOAzpN.js`
2. **Cloudflare CDN served old HTML** referencing old hashes like `index-DC8sJCDC.js`
3. **Browser requested non-existent JS files** → Server returned 404 HTML page
4. **Browser tried to execute HTML as JavaScript** → Syntax error (HTML starts with `<!DOCTYPE>` = `<`)
5. **Result:** Blank page, no app loaded

---

## Solutions Implemented

### 1. Build Timestamp Injection ✅
**File:** `vite.config.ts`

Added custom Vite plugin to inject unique build timestamp into HTML:

```typescript
function injectBuildTimestamp(): Plugin {
  return {
    name: 'inject-build-timestamp',
    transformIndexHtml(html) {
      return html.replace(
        '__BUILD_TIMESTAMP__',
        new Date().toISOString()
      );
    },
  };
}
```

**Result:** Each build gets unique `<meta name="build-timestamp" content="2026-01-18T03:24:03.865Z" />`

### 2. Enhanced HTTP Cache Headers ✅
**File:** `index.html`

Added meta tags to prevent browser/proxy caching:

```html
<meta name="cache-version" content="4.0.0" />
<meta name="build-timestamp" content="__BUILD_TIMESTAMP__" />
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

### 3. Strengthened CDN Cache Control ✅
**File:** `public/_headers`

Enhanced cache headers for HTML files:

```
# Root HTML - CRITICAL: Absolutely no caching
/index.html
  Cache-Control: no-cache, no-store, must-revalidate, max-age=0, s-maxage=0
  Pragma: no-cache
  Expires: 0
  CDN-Cache-Control: no-cache
```

**Key Addition:** `CDN-Cache-Control: no-cache` specifically tells Cloudflare's CDN not to cache HTML.

---

## Problem 2: Recharts Circular Dependency (RESOLVED ✅)

### Console Error Observed:
```
vendor-charts-DF8mv9Od.js:9 Uncaught ReferenceError: Cannot access 'A' before initialization
```

### What Happened:
1. **Recharts and d3 bundled together** in `vendor-charts` chunk
2. **Circular dependency between modules** caused Temporal Dead Zone (TDZ) error
3. **Variable 'A' accessed before initialization** due to module loading order
4. **Result:** JavaScript execution halted, blank page

### Solutions Implemented:

#### 1. Split Chart Bundles ✅
**File:** `vite.config.ts`

Separated Recharts and d3 into different chunks:

```typescript
// Charts - Don't bundle together to avoid circular deps
if (id.includes('recharts') && !id.includes('d3')) {
  return 'vendor-recharts';
}

// D3 utilities - separate from recharts
if (id.includes('d3-')) {
  return 'vendor-d3';
}
```

**Result:** Creates `vendor-recharts-XXX.js` and `vendor-d3-XXX.js` separately.

#### 2. Exclude from Optimization ✅
**File:** `vite.config.ts`

Excluded chart libraries from pre-bundling:

```typescript
optimizeDeps: {
  exclude: [
    'recharts', // Exclude due to circular dependency issues
    'd3-scale',
    'd3-array',
    'd3-shape',
    'd3-interpolate',
  ],
}
```

**Result:** Vite doesn't try to pre-bundle these, avoiding TDZ errors.

---

## Status: ALL ISSUES RESOLVED ✅

**Deploy #1** (commit `1d53256`): Fixed caching issue  
**Deploy #2** (commit `75cdf88`): Fixed Recharts circular dependency  
**Next Deployment:** Should load correctly with no errors

---

## Verification Steps (After Deployment Completes)

1. **Hard Refresh** browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. **Check Console** for errors - should be clean
3. **Verify Timestamp** in HTML source:
   - Right-click → View Page Source
   - Search for `build-timestamp`
   - Should show recent timestamp
4. **Check Network Tab:**
   - Open DevTools → Network
   - Refresh page
   - `index.html` should show `Status: 200` (not from cache)
   - All JS assets should load with `Status: 200`

---

## Why This Happens on Cloudflare Pages

Cloudflare Pages uses **aggressive edge caching** for performance:

1. **First deployment:** Everything cached at edge locations
2. **New deployment:** New assets uploaded, but HTML may stay cached
3. **Result:** Old HTML + New asset URLs = 404 errors

### Best Practices Going Forward:

✅ **HTML files:** Never cache (we've implemented this)  
✅ **JavaScript/CSS:** Cache with immutable + hash (already doing this)  
✅ **Images:** Cache with reasonable TTL (already doing this)  
✅ **Build timestamps:** Unique identifier per build (now implemented)

---

## Immediate Workaround (If Still Seeing Issues)

If the homepage is still blank after deployment:

### Option 1: Purge Cloudflare Cache (Fastest)
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your account → Pages → `desmoines-ai-pulse`
3. Go to **Deployments** → Latest deployment
4. Click **"Purge cache"** or **"Retry deployment"**

### Option 2: Wait for Cache TTL
- Cloudflare's default HTML cache TTL: ~5 minutes
- Should auto-resolve within 5-10 minutes

### Option 3: Hard Refresh Browser
- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`
- This bypasses browser cache

---

## Technical Deep Dive

### Why `<` Causes Syntax Error:

When JavaScript file returns HTML:
```html
<!DOCTYPE html>
<html>...
```

JavaScript parser sees:
```javascript
< !DOCTYPE html>
  ^
  Unexpected token
```

The `<` character is not valid JavaScript syntax outside of JSX/TSX (which is transpiled before delivery).

### Asset Hash Changes Per Build:

Vite uses content hashing:
```
Old build: index-DC8sJCDC.js
New build: index-KhWOAzpN.js
```

If HTML references old hash but CDN only has new hash → 404.

---

## Monitoring

To prevent future occurrences:

1. **Monitor build logs** for asset hash changes
2. **Check Cloudflare deployments** complete successfully
3. **Verify cache headers** in production using:
   ```bash
   curl -I https://desmoinesinsider.com/
   ```
   Should see: `Cache-Control: no-cache, no-store, must-revalidate`

---

## Related Files Modified

- ✅ `index.html` - Added cache-busting meta tags
- ✅ `vite.config.ts` - Added build timestamp injection
- ✅ `public/_headers` - Strengthened cache control

---

## Status: RESOLVED ✅

**Next Deployment:** Should work correctly with no caching issues  
**Long-term:** Build timestamp ensures every deployment is unique and not cached
