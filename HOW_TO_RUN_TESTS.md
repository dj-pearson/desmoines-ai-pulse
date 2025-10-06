# How to Run Tests - Quick Guide

## ⚠️ Important: Dev Server Must Be Running First!

The tests **require your dev server to be running**. Here's how to do it:

---

## Step-by-Step Instructions

### 1. Open First Terminal - Start Dev Server

```bash
npm run dev
```

**Wait until you see:**
```
➜  Local:   http://localhost:5173/
```

Leave this terminal running! Don't close it.

---

### 2. Open Second Terminal - Run Tests

Now in a **new terminal window**, run any of these commands:

#### Interactive UI Mode (Best for Development)
```bash
npm run test:ui
```

This opens a visual interface where you can:
- See all 200+ tests
- Click to run individual tests
- Watch tests execute in a browser
- Debug failed tests

#### Run All Tests (Headless)
```bash
npm test
```

#### Run Specific Test Suite
```bash
npm run test:mobile-responsive  # Mobile layout tests
npm run test:links              # Link and button tests
npm run test:search             # Search debouncing tests
npm run test:a11y               # Accessibility tests
npm run test:forms              # Form validation tests
npm run test:visual             # Visual regression tests
npm run test:performance        # Performance tests
```

#### Run Tests with Visible Browser
```bash
npm run test:headed
```

---

## Troubleshooting

### "No tests found" Error

**Cause:** Dev server isn't running
**Solution:** Make sure Terminal 1 has `npm run dev` running

### Tests Timeout

**Cause:** Server on different port
**Solution:** Check dev server output for the actual port (e.g., 8084) and update:

```bash
# If server is on port 8084:
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8084 npm run test:ui
```

### Port Already in Use

If port 5173 is taken, Vite will use 5174, 5175, etc.

Update playwright.config.ts line 33:
```typescript
baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8084',
```

---

## What the Tests Check

### 🔗 Links & Buttons (`test:links`)
- ✅ No broken links (404 errors)
- ✅ All buttons clickable
- ✅ Touch targets 44x44px minimum
- ✅ Visual feedback on interaction

### 📱 Mobile Responsive (`test:mobile-responsive`)
- ✅ No horizontal scrolling
- ✅ Content fits viewport
- ✅ Text readable (12px min)
- ✅ Tested on 7+ devices

### 🔍 Search & Filters (`test:search`)
- ✅ **Search debouncing (500-800ms delay)**
- ✅ **No filtering on every keystroke**
- ✅ Filters work correctly
- ✅ Results are relevant

### 📝 Forms (`test:forms`)
- ✅ Required field validation
- ✅ Error messages clear
- ✅ Mobile-friendly inputs
- ✅ Double submission prevented

### 🎨 Visual (`test:visual`)
- ✅ No overlapping text
- ✅ Consistent layouts
- ✅ Screenshot comparisons

### ♿ Accessibility (`test:a11y`)
- ✅ WCAG 2.1 Level AA compliance
- ✅ Keyboard navigation
- ✅ Screen reader support

### ⚡ Performance (`test:performance`)
- ✅ Core Web Vitals
- ✅ Load times < 5s mobile
- ✅ Image optimization

---

## View Test Results

After running tests:

```bash
npm run test:report
```

This opens an HTML report showing:
- Pass/fail status
- Screenshots of failures
- Step-by-step traces
- Performance metrics

---

## Quick Validation

To verify everything is set up correctly:

```bash
# List all tests (should show 200+)
npx playwright test --list | head -20

# Run just homepage test
npx playwright test tests/links-and-buttons.spec.ts --grep "homepage" --headed
```

---

## Summary

**Two terminals required:**

1. **Terminal 1:** `npm run dev` (keep running)
2. **Terminal 2:** `npm run test:ui` (run tests)

**That's it!** The tests will validate every aspect of your site.

---

## Next Steps

1. ✅ Start dev server (`npm run dev`)
2. ✅ Run tests (`npm run test:ui`)
3. 🔧 Fix any failures
4. ✅ Re-run until all pass
5. 🚀 Deploy with confidence!

---

**Need help?** Check `TESTING.md` for full documentation.
