# vendor-maps Premature Loading - Root Cause & Solution

**Date**: 2026-01-18  
**Status**: ✅ RESOLVED  
**Impact**: Critical - Homepage blank page  
**Deployment**: Production

---

## The Error

```
vendor-maps-DTcLwS6O.js:1 Uncaught TypeError: Cannot read properties of undefined (reading 'createContext')
```

Homepage was blank. React wasn't initialized when `react-leaflet` tried to use `React.createContext()`.

---

## Root Cause Discovery

### Initial Hypothesis (WRONG)

We thought it was about `<link rel="modulepreload">` tags causing early script execution. We tried:
- ❌ Removing modulepreload links with regex
- ❌ Setting `experimentalMinChunkSize` to prevent preloading
- ❌ Custom Vite plugins to strip modulepreload

**None of these worked because they targeted the wrong problem.**

### The Real Culprit: CSS Stylesheet Link

Looking at the deployed HTML, we found:

```html
<link rel="stylesheet" crossorigin href="/assets/vendor-maps-Dgihpmma.css">
```

**This was the issue!** Here's why:

1. When Vite bundles `leaflet` and `react-leaflet` into `vendor-maps`:
   - It includes BOTH JavaScript and CSS
   - Leaflet has its own CSS (`leaflet.css` for map styles)

2. During build, Vite extracts CSS:
   - All CSS gets linked in `<head>` for early loading (good for performance)
   - The `vendor-maps.css` was part of critical styles

3. **Browser behavior with CSS+JS chunks**:
   - Browser loads the CSS stylesheet
   - Browser sees this CSS is associated with `vendor-maps.js`
   - Browser **automatically fetches and executes** the JS
   - This happens BEFORE React is initialized

4. **The crash**:
   - `vendor-maps.js` loads too early
   - Contains `react-leaflet` code
   - Tries to call `React.createContext()`
   - React hasn't loaded yet → `createContext` is undefined
   - **TypeError: Cannot read properties of undefined**

---

## Why manualChunks Created This Problem

Our `vite.config.ts` had:

```typescript
manualChunks: (id) => {
  // ...
  if (id.includes('leaflet') || id.includes('react-leaflet')) {
    return 'vendor-maps';  // ← Creates a single vendor-maps bundle
  }
}
```

**This bundling strategy broke lazy loading:**
- Even though map components were lazy-loaded in code
- The CSS extraction caused the bundle to load immediately
- True lazy loading was impossible with a bundled vendor-maps chunk

---

## The Solution

**Don't create a vendor-maps bundle.** Let each map component be its own chunk:

```typescript
// vite.config.ts - manualChunks
if (id.includes('leaflet') || id.includes('react-leaflet')) {
  // Return undefined = DON'T bundle
  // Let each lazy-loaded component create its own chunk
  return undefined;
}
```

### What This Does

1. **No vendor-maps bundle**:
   - `leaflet` and `react-leaflet` stay unbundled
   - Each lazy-loaded map component gets its own chunk

2. **Individual chunks per component**:
   ```
   EventsMap-BwDQ5h6i.js        (156 KB) - for /events page
   AttractionsMap-CYq2vz2Q.js    (1.4 KB) - for /attractions page  
   PlaygroundsMap-CfG8Hp_p.js    (8 KB)   - for /playgrounds page
   ```

3. **True lazy loading**:
   - Maps ONLY load when you visit their pages
   - No CSS in `index.html` triggering early JS load
   - React is fully initialized before any map code runs

---

## Before vs After

### Before (vendor-maps bundle)

**Build output**:
```
dist/assets/vendor-maps-DTcLwS6O.js      155.97 kB
dist/assets/vendor-maps-Dgihpmma.css      15.04 kB
```

**index.html**:
```html
<link rel="stylesheet" crossorigin href="/assets/vendor-maps-Dgihpmma.css">
<!-- This CSS link causes vendor-maps.js to load immediately -->
```

**Result**: ❌ Homepage crashes with createContext error

### After (individual chunks)

**Build output**:
```
dist/assets/EventsMap-BwDQ5h6i.js        156.48 kB
dist/assets/EventsMap-Dgihpmma.css        15.04 kB
dist/assets/AttractionsMap-CYq2vz2Q.js     1.41 kB
dist/assets/PlaygroundsMap-CfG8Hp_p.js     8.05 kB
```

**index.html**:
```html
<!-- No vendor-maps CSS or JS! -->
```

**Result**: ✅ Homepage loads perfectly, maps load only when needed

---

## Key Learnings

### 1. CSS Can Trigger JS Loading

When a CSS file is part of a chunk that also has JS:
- The CSS link in HTML causes the JS to load
- This is **browser behavior**, not Vite or modulepreload
- You can't "remove" this with plugins

### 2. manualChunks Can Break Lazy Loading

Creating vendor bundles for lazy-loaded code:
- Defeats the purpose of lazy loading
- CSS extraction causes immediate loading
- Better to let lazy components be truly lazy

### 3. Return undefined in manualChunks

```typescript
manualChunks: (id) => {
  if (shouldNotBundle(id)) {
    return undefined;  // ← Tells Vite: "don't bundle this"
  }
}
```

This preserves dynamic import behavior and creates per-component chunks.

### 4. The modulepreload Red Herring

We spent significant time trying to remove modulepreload links. **This was the wrong approach** because:
- The CSS stylesheet (not modulepreload) was causing early loading
- Removing modulepreload wouldn't have fixed anything
- The real fix was preventing the bundle from existing

---

## Impact

### Performance
- **Homepage load time**: Improved (no unnecessary 156KB map bundle)
- **Events page**: Same (maps load when needed)
- **Overall**: Better code splitting, true lazy loading

### Bundle Size
- **Before**: 1 vendor-maps bundle (156 KB)
- **After**: 3 separate map chunks (total 165 KB, but only loaded when needed)
- **Homepage**: -156 KB (maps don't load at all)

### Developer Experience
- ✅ True lazy loading works as expected
- ✅ No more mysterious "createContext" errors
- ✅ Predictable chunk loading behavior

---

## Files Changed

### vite.config.ts

```diff
  manualChunks: (id) => {
-   // Maps - Leaflet (only loaded on map pages)
-   if (id.includes('leaflet') || id.includes('react-leaflet')) {
-     return 'vendor-maps';
-   }
+   // Maps - Leaflet (DO NOT BUNDLE - causes preload issues)
+   // By returning undefined, we let each lazy-loaded map component
+   // have its own chunk, preventing premature loading
+   if (id.includes('leaflet') || id.includes('react-leaflet')) {
+     return undefined; // Don't bundle - let dynamic imports create chunks
+   }
  }
```

### Removed (no longer needed)

- ❌ `removeMapPreload()` plugin (was targeting wrong issue)
- ❌ Custom regex to strip modulepreload (wasn't the problem)
- ❌ `experimentalMinChunkSize` workaround (didn't help)

---

## Testing

### Verification Steps

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Check dist/index.html**:
   ```bash
   grep -i "vendor-maps" dist/index.html
   # Should return nothing
   ```

3. **Check for individual map chunks**:
   ```bash
   ls dist/assets/*Map*.js
   # Should show: EventsMap-*.js, AttractionsMap-*.js, PlaygroundsMap-*.js
   ```

4. **Test homepage**:
   - Visit https://desmoinesinsider.com
   - Homepage should load without errors
   - Open DevTools Network tab
   - **Map chunks should NOT load** on homepage

5. **Test events page**:
   - Visit https://desmoinesinsider.com/events
   - Open DevTools Network tab
   - **EventsMap-*.js should load** when you view the map

---

## Conclusion

**The issue wasn't about modulepreload or preloading.**  
**The issue was bundling lazy-loaded code with CSS.**

When you bundle components that:
1. Have CSS (like Leaflet)
2. Depend on React
3. Are supposed to be lazy-loaded

...into a vendor chunk, the CSS gets extracted globally and triggers immediate JS loading, breaking the dependency chain.

**Solution**: Don't bundle them. Return `undefined` in `manualChunks` to preserve true lazy loading.

---

**Status**: ✅ Fixed and deployed  
**Date**: 2026-01-18  
**Commit**: `afae272` - "fix: prevent vendor-maps bundling to fix React createContext error"
