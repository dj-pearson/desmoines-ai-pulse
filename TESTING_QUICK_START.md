# Testing Quick Start Guide

## 🚀 Run Your First Test

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **In a new terminal, run all tests:**
   ```bash
   npm test
   ```

3. **Or run tests in interactive UI mode (recommended):**
   ```bash
   npm run test:ui
   ```

## 📱 Test Priorities

### Critical Tests (Run First)

1. **Mobile Responsive Layout**
   ```bash
   npm run test:mobile-responsive
   ```
   ✅ Ensures no horizontal scroll, proper sizing, touch targets

2. **Links and Buttons**
   ```bash
   npm run test:links
   ```
   ✅ Validates all links work, buttons are clickable with proper feedback

3. **Accessibility**
   ```bash
   npm run test:a11y
   ```
   ✅ WCAG 2.1 AA compliance, keyboard navigation, screen readers

### Important Tests

4. **Search and Filters**
   ```bash
   npm run test:search
   ```
   ✅ **Key Fix**: Ensures search is debounced (waits for user to finish typing)
   ✅ No filtering on every keystroke - better UX

5. **Forms**
   ```bash
   npm run test:forms
   ```
   ✅ Validation, error messages, mobile-friendly inputs

6. **Visual Regression**
   ```bash
   npm run test:visual
   ```
   ✅ No overlapping text, consistent layouts, proper z-index

7. **Performance**
   ```bash
   npm run test:performance
   ```
   ✅ Core Web Vitals, load times, image optimization

## 🔍 What Each Test Covers

### Mobile Responsive (`test:mobile-responsive`)
- ✅ No horizontal scrolling on any device
- ✅ Content fits within viewport (iPhone SE to iPad Pro)
- ✅ Touch targets are 44x44px minimum
- ✅ Text is readable (min 12px font size)
- ✅ Responsive breakpoints work correctly

### Links and Buttons (`test:links`)
- ✅ No broken links (404 errors)
- ✅ Buttons have visual feedback (hover, active states)
- ✅ Touch targets meet minimum size
- ✅ All interactive elements have labels
- ✅ Navigation between pages works

### Search and Filters (`test:search`)
- ✅ **Search is debounced** - waits 500-800ms after user stops typing
- ✅ **No filtering on every keystroke** - much better UX
- ✅ Search results are relevant
- ✅ "No results" message displays
- ✅ Filters work and can be combined
- ✅ Search query saved in URL (bookmarkable)

### Forms (`test:forms`)
- ✅ Required field validation
- ✅ Email format validation
- ✅ Password requirements
- ✅ Descriptive error messages
- ✅ Loading states on submission
- ✅ Double-submission prevention
- ✅ Mobile-friendly input sizes

### Visual Regression (`test:visual`)
- ✅ No overlapping text or elements
- ✅ Screenshot comparison
- ✅ Consistent header/footer
- ✅ Fixed/sticky elements positioned correctly
- ✅ No content extending beyond viewport

### Accessibility (`test:a11y`)
- ✅ WCAG 2.1 Level AA compliance
- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ Focus visible on all elements
- ✅ Screen reader compatible (ARIA, alt text)
- ✅ Color contrast meets standards
- ✅ Skip to main content link

### Performance (`test:performance`)
- ✅ Core Web Vitals (LCP, FCP, CLS)
- ✅ Mobile load time < 5 seconds
- ✅ Desktop load time < 4 seconds
- ✅ Image optimization
- ✅ Lazy loading implemented
- ✅ No memory leaks

## 🎯 Quick Commands

```bash
# All tests
npm test

# Interactive UI (best for development)
npm run test:ui

# Mobile devices only
npm run test:mobile

# Desktop browsers only
npm run test:desktop

# Watch mode - re-run on file changes
npm test -- --watch

# Run specific test file
npm test tests/search-filters.spec.ts

# Run tests matching pattern
npm test -- --grep "search"

# Update screenshot baselines
npm test -- --update-snapshots

# View last test report
npm run test:report

# Debug with visible browser
npm run test:headed
```

## 🐛 Debugging Failed Tests

### Test Fails

1. **Run in UI mode to see what's happening:**
   ```bash
   npm run test:ui
   ```

2. **Run in headed mode (visible browser):**
   ```bash
   npm run test:headed
   ```

3. **View the HTML report:**
   ```bash
   npm run test:report
   ```

4. **Check screenshots and traces in the report**

### Common Issues

**"Timeout waiting for element"**
- Element selector might be wrong
- Element might not be visible yet
- Check if element exists in dev tools

**"No tests found"**
- Make sure dev server is running
- Check test file path
- Verify test files end with `.spec.ts`

**"Screenshot comparison failed"**
- Run with `--update-snapshots` to accept changes
- Check if changes are intentional
- Platform differences (fonts) are normal

## 📊 Reading Test Results

### Test Status
- ✅ **Passed** - Test succeeded
- ❌ **Failed** - Test found issues (needs fixing)
- ⏭️ **Skipped** - Test was skipped (optional)
- ⏱️ **Timeout** - Test took too long (check network/performance)

### Report Sections
- **Summary**: Pass/fail counts
- **Failures**: Detailed error messages
- **Screenshots**: Visual proof of issues
- **Traces**: Step-by-step replay of test

## 🎨 Test Output Example

```
Running 45 tests using 3 workers

  ✓ [mobile-chrome] › links-and-buttons.spec.ts:15:1 › homepage links work (2.3s)
  ✓ [mobile-safari] › mobile-responsive.spec.ts:28:1 › no horizontal scroll (1.8s)
  ❌ [chromium] › search-filters.spec.ts:42:1 › search debouncing (5.2s)

  1 failed
    [chromium] › search-filters.spec.ts:42:1 › search debouncing
  44 passed (1.2m)
```

## 🚨 Priority Fixes

If tests fail, fix in this order:

1. **Mobile Responsive** - Critical for users
2. **Accessibility** - Critical for compliance
3. **Search Debouncing** - Critical for UX
4. **Links/Buttons** - Critical for navigation
5. **Forms** - Important for conversions
6. **Performance** - Important for SEO
7. **Visual Regression** - Important for quality

## 📖 Full Documentation

See `TESTING.md` for comprehensive documentation including:
- Detailed test descriptions
- CI/CD integration guide
- Writing new tests
- Best practices
- Troubleshooting

## 🎓 Learning Resources

- [Playwright Docs](https://playwright.dev/)
- [Web.dev Performance](https://web.dev/vitals/)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Mobile UX Best Practices](https://web.dev/mobile/)

## 💡 Tips

1. **Always run mobile tests first** - Most users are on mobile
2. **Use UI mode for debugging** - Visual feedback is invaluable
3. **Keep tests fast** - Use `waitForLoadState('domcontentloaded')` when possible
4. **Test on real devices** - Emulation is good, but not perfect
5. **Run tests before commits** - Catch issues early
6. **Review test reports** - Screenshots show exactly what happened

## 🎉 Success Criteria

Your site is production-ready when:
- ✅ All mobile responsive tests pass
- ✅ No broken links or buttons
- ✅ Zero critical accessibility violations
- ✅ Search is properly debounced
- ✅ Forms validate correctly
- ✅ Core Web Vitals are "Good"
- ✅ No overlapping UI elements
- ✅ All pages load under 5 seconds on mobile

---

**Need help?** Check `TESTING.md` or run `npm run test:ui` to visually debug!
