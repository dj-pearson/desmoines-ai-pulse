# How to Run Tests - Simple Guide

## 🎯 The Easiest Way (2 Steps)

### Step 1: Start the Dev Server
Open a terminal and run:
```bash
npm run dev
```

Wait until you see:
```
➜  Local:   http://localhost:8082/
```
(or whatever port it starts on)

### Step 2: Open Playwright UI
In a **second terminal**, run:
```bash
npm run test:ui
```

That's it! The Playwright UI will open showing all **2,997 tests** ready to run! 🎉

---

## 🔧 If Your Dev Server Uses a Different Port

The config is set to use **port 8082** by default. If your dev server starts on a different port:

**Windows PowerShell:**
```powershell
$env:PLAYWRIGHT_TEST_BASE_URL = "http://localhost:YOUR_PORT"
npm run test:ui
```

**Mac/Linux:**
```bash
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:YOUR_PORT
npm run test:ui
```

---

## 📊 Other Ways to Run Tests

### Run All Tests (Command Line)
```bash
npm test
```

### Run Tests in Browser (Watch Mode)
```bash
npm run test:headed
```

### Run Specific Test Suites
```bash
npm run test:mobile          # Mobile responsive tests only
npm run test:a11y            # Accessibility tests only
npm run test:links           # Link and button tests only
npm run test:performance     # Performance tests only
```

### See Test Results
```bash
npm run test:report
```

---

## 🎬 What You'll See

Once the Playwright UI opens, you'll see:

- **2,997 tests** organized by category
- **9 device configurations** (desktop, mobile, tablet)
- **7 test suites**:
  - ✅ Accessibility (589 tests)
  - ✅ Forms (17 tests)
  - ✅ Links & Buttons (249 tests)
  - ✅ Mobile Responsive (410 tests)
  - ✅ Performance (122 tests)
  - ✅ Search & Filters (130 tests)
  - ✅ Visual Regression (1480 tests)

---

## ❓ Troubleshooting

### "No tests" showing in UI
- **Cause**: Port mismatch or dev server not running
- **Fix**: Close all terminals, then run `npm run test:ui` fresh

### Port 5173 already in use
- **Cause**: Another dev server is running
- **Fix**: Either close it or use the environment variable method above

### Tests failing immediately
- **Cause**: Dev server might not be fully started
- **Fix**: Wait 10-20 seconds for dev server to fully initialize

---

## 🚀 Quick Start Summary

1. Open terminal
2. Run: `npm run test:ui`
3. Wait for UI to open
4. Click any test to run it
5. See results instantly!

**That's it!** No need for multiple terminals or manual setup. Playwright handles everything! 🎉
