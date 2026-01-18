# Cloudflare Pages Deployment Cache Checklist

Quick reference for troubleshooting blank pages after deployment.

---

## 🚨 Symptoms of Cache Issues

- ✗ Blank white page
- ✗ Console error: `Uncaught SyntaxError: Unexpected token '<'`
- ✗ Network tab shows 404 for JS files
- ✗ JS files return HTML instead of JavaScript

---

## ✅ Quick Fix Checklist

### 1. Verify Cache Headers
```bash
curl -I https://desmoinesinsider.com/
```

**Should see:**
```
Cache-Control: no-cache, no-store, must-revalidate
```

### 2. Check Build Timestamp
- View page source
- Find `<meta name="build-timestamp" content="..." />`
- Should be recent (within last hour)

### 3. Verify Asset Hashes Match
- View page source → Find `<script src="/assets/index-XXXXX.js">`
- Open Network tab → Check if that file loads successfully
- Both hashes should match

### 4. Hard Refresh
- **Windows:** `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

### 5. Purge Cloudflare Cache
1. [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Pages → `desmoines-ai-pulse`
3. Latest Deployment → "Purge cache"

---

## 🔧 Prevention Measures (Already Implemented)

✅ Build timestamp injection (unique per build)  
✅ HTTP cache meta tags (no-cache)  
✅ CDN-Cache-Control headers (bypass edge)  
✅ Cache-version meta tag (manual invalidation)  

---

## 📊 Monitoring Commands

### Check deployment status
```bash
# View recent commits
git log --oneline -5

# Check if push succeeded
git status
```

### Verify production cache headers
```bash
# Full headers
curl -I https://desmoinesinsider.com/

# Just cache-control
curl -I https://desmoinesinsider.com/ | grep -i cache-control
```

### Check build timestamp
```bash
curl -s https://desmoinesinsider.com/ | grep -i build-timestamp
```

---

## 🛠️ Emergency Cache Clear

If all else fails, force new cache version:

1. Edit `index.html`
2. Increment `<meta name="cache-version" content="X.0.0" />`
3. Commit and push
4. Cloudflare will treat as new resource

---

## 📚 Related Documentation

- See `CLOUDFLARE_CACHE_FIX.md` for full technical details
- See `DEPLOYMENT.md` for complete deployment guide
