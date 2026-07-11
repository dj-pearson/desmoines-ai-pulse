# Quick Test Commands Reference

## 🚀 Essential Commands

### Run All Tests (UI Mode)
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Open Playwright UI
npm run test:ui
```

---

## ⚡ Fast Focused Testing

### Test Just One Category (Recommended)
```bash
npm run test:links              # 5 min  - Check all links work
npm run test:mobile-responsive  # 15 min - Mobile layout issues
npm run test:a11y              # 15 min - Accessibility
npm run test:search            # 10 min - Search functionality
npm run test:forms             # 10 min - Form validation
npm run test:performance       # 30 min - Load times & optimization
npm run test:visual            # 40 min - Visual regression
```

### Test Just One Browser
```bash
npm run test:desktop           # Desktop Chrome only
npm run test:mobile            # Mobile Chrome & Safari only
```

---

## 📊 View Results

### See HTML Report
```bash
npm run test:report
```

### Run Tests in Terminal (No UI)
```bash
npm test
```

### Run Tests in Headed Mode (See Browser)
```bash
npm run test:headed
```

---

## 🎯 Common Workflows

### Daily Development
```bash
# Run just the tests for what you're working on
npm run test:links    # If working on navigation
npm run test:mobile   # If working on responsive design
npm run test:a11y     # If working on accessibility
```

### Before Committing
```bash
# Run quick smoke tests
npm run test:links
npm run test:mobile-responsive
```

### Full Validation
```bash
# Run everything (1-2 hours)
npm test
```

---

## 🔧 Troubleshooting

### Tests Timing Out
Edit `playwright.config.ts` and increase:
```typescript
timeout: 90000  // 90 seconds
```

### Too Slow
Reduce in `playwright.config.ts`:
```typescript
workers: 1  // Run tests one at a time
```

### Port Conflicts
```bash
# Stop all dev servers first
# Then run:
npm run test:ui
```

---

## ✨ Pro Tips

1. **Use the UI filter** - Type in the search box to find specific tests
2. **Uncheck unused projects** - Don't need to test all 9 device configs every time
3. **Watch mode** - Auto-rerun on file changes (click "Watch" button)
4. **Debug mode** - Click failed tests to see what went wrong
5. **Run one test** - Right-click a test → "Run" to test just that one

---

## 📈 Current Status

✅ **2,997 tests** available  
✅ **7 test suites** covering:
- Accessibility (WCAG 2.1 AA)
- Mobile responsiveness
- Links & navigation
- Forms & validation
- Search & filters
- Performance (Core Web Vitals)
- Visual regression

✅ **9 device configurations**:
- Desktop (Chrome, Firefox, Safari)
- Mobile (Chrome, Safari, Small, Large)
- Tablet (iPad, Landscape)

---

## 🎉 You're All Set!

The tests are running now. Each failure is a real issue to fix. Start with:

```bash
npm run test:links  # Make sure navigation works
```

Then move to:
```bash
npm run test:mobile  # Fix horizontal scroll issues
```

Good luck! 🚀

