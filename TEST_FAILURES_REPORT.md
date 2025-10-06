# Test Results Summary

**Generated:** 10/6/2025, 12:39:15 PM

---

## 📊 Statistics

- **Total Tests:** 333
- **✅ Passed:** 257 (77.2%)
- **❌ Failed:** 76 (22.8%)
- **⏭️ Skipped:** 0
- **🔀 Flaky:** 0

---

## ❌ Failures to Fix

### 📄 accessibility.spec.ts

#### 1. homepage should not have accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 75.27s
- **Error:**
```
Error: Should have no accessibility violations on homepage

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -  1[39m
[31m+ Received  + 56[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
```

#### 2. homepage should not have critical accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 74.91s
- **Error:**
```
Error: Should have no critical accessibility violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 3. events should not have accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 54.52s
- **Error:**
```
Error: Should have no accessibility violations on events

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -   1[39m
[31m+ Received  + 163[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
```

#### 4. events should not have critical accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 55.67s
- **Error:**
```
Error: Should have no critical accessibility violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 5. restaurants should not have accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 39.12s
- **Error:**
```
Error: Should have no accessibility violations on restaurants

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -   1[39m
[31m+ Received  + 336[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
```

#### 6. restaurants should not have critical accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 36.31s
- **Error:**
```
Error: Should have no critical accessibility violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 7. attractions should not have accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.84s
- **Error:**
```
Error: Should have no accessibility violations on attractions

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -   1[39m
[31m+ Received  + 163[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
```

#### 8. attractions should not have critical accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.77s
- **Error:**
```
Error: Should have no critical accessibility violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 9. articles should not have accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 10.25s
- **Error:**
```
Error: Should have no accessibility violations on articles

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -   1[39m
[31m+ Received  + 163[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
```

#### 10. articles should not have critical accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 7.70s
- **Error:**
```
Error: Should have no critical accessibility violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 11. playgrounds should not have accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 10.74s
- **Error:**
```
Error: Should have no accessibility violations on playgrounds

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -   1[39m
[31m+ Received  + 163[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
```

#### 12. playgrounds should not have critical accessibility violations
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 12.20s
- **Error:**
```
Error: Should have no critical accessibility violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 13. all interactive elements should be keyboard accessible
- **Project:** chromium-desktop
- **Status:** timedOut
- **Duration:** 60.28s
- **Error:**
```
[31mTest timeout of 60000ms exceeded while setting up "page".[39m
```

#### 14. text should have sufficient color contrast
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 64.84s
- **Error:**
```
Error: Should have no color contrast violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 15. accessibility should be maintained on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 13.88s
- **Error:**
```
Error: Mobile view should have no critical a11y violations

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m1[39m
```

#### 16. touch targets should be accessible on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 12.84s
- **Error:**
```
Error: At least 70% of touch targets should be 44x44px or larger

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m70[39m
Received:   [31m0.4531722054380665[39m
```

---

### 📄 forms.spec.ts

#### 1. form should handle submission state
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 7.00s
- **Error:**
```
Error: Form should provide feedback after submission

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

---

### 📄 links-and-buttons.spec.ts

#### 1. should have clickable buttons with proper feedback on /
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 46.19s
- **Error:**
```
Error: Button "All Categories" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 2. should have clickable buttons with proper feedback on /events
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 36.62s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 3. should have buttons with descriptive text or aria-labels on /events
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 7.93s
- **Error:**
```
Error: Found 2 buttons without text or labels

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m2[39m
```

#### 4. should have clickable buttons with proper feedback on /events/today
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 31.93s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 5. should have clickable buttons with proper feedback on /events/this-weekend
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 31.17s
- **Error:**
```
Error: Button "Entertainment" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 6. should have clickable buttons with proper feedback on /restaurants
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 34.38s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 7. should have clickable buttons with proper feedback on /attractions
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 33.33s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 8. should have buttons with descriptive text or aria-labels on /attractions
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 4.34s
- **Error:**
```
Error: Found 2 buttons without text or labels

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m2[39m
```

#### 9. should have clickable buttons with proper feedback on /playgrounds
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 34.41s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 10. should have buttons with descriptive text or aria-labels on /playgrounds
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 4.92s
- **Error:**
```
Error: Found 2 buttons without text or labels

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m2[39m
```

#### 11. should have clickable buttons with proper feedback on /articles
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 33.22s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 12. should have buttons with descriptive text or aria-labels on /articles
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 4.71s
- **Error:**
```
Error: Found 2 buttons without text or labels

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m2[39m
```

#### 13. should have clickable buttons with proper feedback on /neighborhoods
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 37.50s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 14. should have clickable buttons with proper feedback on /weekend
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 32.44s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 15. should have clickable buttons with proper feedback on /guides
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 32.64s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 16. should have clickable buttons with proper feedback on /social
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 29.98s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 17. should have clickable buttons with proper feedback on /gamification
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 31.21s
- **Error:**
```
Error: Button "Advertise with Us" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 18. should have clickable buttons with proper feedback on /business-partnership
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 32.21s
- **Error:**
```
Error: Button "Sign In" should have cursor pointer

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31mfalse[39m
```

#### 19. should have properly sized buttons for touch targets on /business-partnership
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 3.49s
- **Error:**
```
Error: More than 20% of buttons are below recommended touch target size (44x44px)

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeLessThan[2m([22m[32mexpected[39m[2m)[22m

Expected: < [32m0.2[39m
Received:   [31m0.4444444444444444[39m
```

#### 20. should show visual feedback when buttons are clicked
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 22.24s
- **Error:**
```
TimeoutError: locator.waitFor: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('button:not([disabled])').first() to be visible[22m
[2m    4 × locator resolved to hidden <button type="button" data-state="closed" aria-expanded="false" data-lov-name="Button" aria-haspopup="dialog" data-component-line="185" data-component-name="Button" data-component-file="Header.tsx" aria-label="Open navigation menu" aria-controls="mobile-navigation" data-lov-id="src\components\Header.tsx:185:16" data-component-path="src\components\Header.tsx" data-component-content="%7B%22className%22%3A%22lg%3Ahidden%20touch-target%22%7D" class="inline-flex items-center justify-center gap-2 whitespace…>…</button>[22m

```

---

### 📄 mobile-responsive.spec.ts

#### 1. / should not have horizontal scroll on iPhone SE (375x667)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 7.31s
- **Error:**
```
Error: Page should not have horizontal scroll on iPhone SE

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 2. /guides should not have horizontal scroll on iPhone SE (375x667)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 6.15s
- **Error:**
```
Error: Page should not have horizontal scroll on iPhone SE

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 3. / should not have horizontal scroll on iPhone 12 (390x844)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.27s
- **Error:**
```
Error: Page should not have horizontal scroll on iPhone 12

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 4. /guides should not have horizontal scroll on iPhone 12 (390x844)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 5.91s
- **Error:**
```
Error: Page should not have horizontal scroll on iPhone 12

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 5. / should not have horizontal scroll on Pixel 5 (393x851)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.81s
- **Error:**
```
Error: Page should not have horizontal scroll on Pixel 5

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 6. /guides should not have horizontal scroll on Pixel 5 (393x851)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 3.65s
- **Error:**
```
Error: Page should not have horizontal scroll on Pixel 5

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 7. / should not have horizontal scroll on Samsung Galaxy S21 (360x800)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 9.00s
- **Error:**
```
Error: Page should not have horizontal scroll on Samsung Galaxy S21

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 8. /guides should not have horizontal scroll on Samsung Galaxy S21 (360x800)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 5.35s
- **Error:**
```
Error: Page should not have horizontal scroll on Samsung Galaxy S21

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 9. / should not have horizontal scroll on Small Mobile (320x568)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.00s
- **Error:**
```
Error: Page should not have horizontal scroll on Small Mobile

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 10. /restaurants should not have horizontal scroll on Small Mobile (320x568)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 7.46s
- **Error:**
```
Error: Page should not have horizontal scroll on Small Mobile

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 11. /guides should not have horizontal scroll on Small Mobile (320x568)
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 4.71s
- **Error:**
```
Error: Page should not have horizontal scroll on Small Mobile

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

#### 12. / should have all content within viewport on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 10.97s
- **Error:**
```
Error: Found 3 elements significantly overflowing viewport

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m3[39m
```

#### 13. /guides should have all content within viewport on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 3.92s
- **Error:**
```
Error: Found 6 elements significantly overflowing viewport

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m6[39m
```

#### 14. homepage should render correctly on iPad Pro
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 13.93s
- **Error:**
```
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mfalse[39m
Received: [31mtrue[39m
```

---

### 📄 performance.spec.ts

#### 1. events should meet Core Web Vitals thresholds
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 18.42s
- **Error:**
```
Error: LCP (Largest Contentful Paint) should be under 4000ms

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeLessThan[2m([22m[32mexpected[39m[2m)[22m

Expected: < [32m4000[39m
Received:   [31m5904[39m
```

#### 2. should not load excessive resources on homepage
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 12.00s
- **Error:**
```
Error: Should not load excessive JS files

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeLessThan[2m([22m[32mexpected[39m[2m)[22m

Expected: < [32m50[39m
Received:   [31m136[39m
```

#### 3. should leverage browser caching
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 21.59s
- **Error:**
```
Error: At least 50% of static resources should be cached

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0.5[39m
Received:   [31m0[39m
```

---

### 📄 search-filters.spec.ts

#### 1. events should have filter options
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 13.56s
- **Error:**
```
Error: events should have filter options

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```

#### 2. restaurants should have filter options
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 9.61s
- **Error:**
```
Error: restaurants should have filter options

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```

#### 3. attractions should have filter options
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 3.51s
- **Error:**
```
Error: attractions should have filter options

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```

#### 4. articles should have filter options
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 5.69s
- **Error:**
```
Error: articles should have filter options

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```

#### 5. advanced-search should have a search input
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 2.67s
- **Error:**
```
Error: advanced-search should have at least one search input

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```

#### 6. advanced-search should have filter options
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 3.91s
- **Error:**
```
Error: advanced-search should have filter options

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```

#### 7. events page filters should work correctly
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 27.28s
- **Error:**
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('select, [role="combobox"], button[aria-haspopup]').first()[22m
[2m    - locator resolved to <button type="button" data-state="closed" aria-expanded="false" data-lov-name="Button" aria-haspopup="dialog" data-component-line="185" data-component-name="Button" data-component-file="Header.tsx" aria-label="Open navigation menu" aria-controls="mobile-navigation" data-lov-id="src\components\Header.tsx:185:16" data-component-path="src\components\Header.tsx" data-component-content="%7B%22className%22%3A%22lg%3Ahidden%20touch-target%22%7D" class="inline-flex items-center justify-center gap-2 whitespace…>…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not visible[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
```

#### 8. search input should have proper ARIA attributes
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.93s
- **Error:**
```
Error: Search input should have proper labeling

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

#### 9. search should work well on mobile viewport
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 17.07s
- **Error:**
```
Error: Search results should be visible on mobile

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

#### 10. advanced search should support multiple criteria
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.89s
- **Error:**
```
Error: Advanced search should have multiple input fields

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m1[39m
Received:   [31m0[39m
```

---

### 📄 visual-regression.spec.ts

#### 1. homepage visual regression on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 36.80s
- **Error:**
```
Error: A snapshot doesn't exist at C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\tests\visual-regression.spec.ts-snapshots\homepage-mobile-chromium-desktop-win32.png, writing actual.
```

#### 2. homepage visual regression on desktop
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 35.34s
- **Error:**
```
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

Timeout:  10000ms
  Timeout 10000ms exceeded.

  Snapshot: homepage-desktop.png

Call log:
[2m  - Expect "toHaveScreenshot(homepage-desktop.png)" with timeout 10000ms[22m
[2m    - generating new stable screenshot expectation[22m
```

#### 3. events visual regression on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 29.19s
- **Error:**
```
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

Timeout:  10000ms
  Timeout 10000ms exceeded.

  Snapshot: events-mobile.png

Call log:
[2m  - Expect "toHaveScreenshot(events-mobile.png)" with timeout 10000ms[22m
[2m    - generating new stable screenshot expectation[22m
```

#### 4. events visual regression on desktop
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 25.15s
- **Error:**
```
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

Timeout:  10000ms
  Timeout 10000ms exceeded.

  Snapshot: events-desktop.png

Call log:
[2m  - Expect "toHaveScreenshot(events-desktop.png)" with timeout 10000ms[22m
[2m    - generating new stable screenshot expectation[22m
```

#### 5. restaurants visual regression on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 27.03s
- **Error:**
```
Error: A snapshot doesn't exist at C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\tests\visual-regression.spec.ts-snapshots\restaurants-mobile-chromium-desktop-win32.png, writing actual.
```

#### 6. restaurants visual regression on desktop
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 37.63s
- **Error:**
```
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

Timeout:  10000ms
  Timeout 10000ms exceeded.

  Snapshot: restaurants-desktop.png

Call log:
[2m  - Expect "toHaveScreenshot(restaurants-desktop.png)" with timeout 10000ms[22m
[2m    - generating new stable screenshot expectation[22m
```

#### 7. attractions visual regression on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 8.74s
- **Error:**
```
Error: A snapshot doesn't exist at C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\tests\visual-regression.spec.ts-snapshots\attractions-mobile-chromium-desktop-win32.png, writing actual.
```

#### 8. attractions visual regression on desktop
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 12.89s
- **Error:**
```
Error: A snapshot doesn't exist at C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\tests\visual-regression.spec.ts-snapshots\attractions-desktop-chromium-desktop-win32.png, writing actual.
```

#### 9. articles visual regression on mobile
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 10.47s
- **Error:**
```
Error: A snapshot doesn't exist at C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\tests\visual-regression.spec.ts-snapshots\articles-mobile-chromium-desktop-win32.png, writing actual.
```

#### 10. articles visual regression on desktop
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 19.43s
- **Error:**
```
Error: A snapshot doesn't exist at C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\tests\visual-regression.spec.ts-snapshots\articles-desktop-chromium-desktop-win32.png, writing actual.
```

#### 11. should not have z-index conflicts on homepage
- **Project:** chromium-desktop
- **Status:** timedOut
- **Duration:** 70.62s
- **Error:**
```
[31mTearing down "context" exceeded the test timeout of 60000ms.[39m
```

#### 12. should not have content extending beyond page boundaries
- **Project:** chromium-desktop
- **Status:** failed
- **Duration:** 44.95s
- **Error:**
```
Error: Content should not extend beyond page boundaries

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m0[39m
Received: [31m3[39m
```

---

## 🔧 Quick Fixes

### Common Issues Found:

#### Accessibility (15 failures)
- homepage should not have accessibility violations
- homepage should not have critical accessibility violations
- events should not have accessibility violations

#### Color Contrast (1 failures)
- text should have sufficient color contrast

#### Links (20 failures)
- should have clickable buttons with proper feedback on /
- should have clickable buttons with proper feedback on /events
- should have buttons with descriptive text or aria-labels on /events

#### Mobile Responsive (14 failures)
- / should not have horizontal scroll on iPhone SE (375x667)
- /guides should not have horizontal scroll on iPhone SE (375x667)
- / should not have horizontal scroll on iPhone 12 (390x844)

#### Performance (3 failures)
- events should meet Core Web Vitals thresholds
- should not load excessive resources on homepage
- should leverage browser caching

#### Forms (1 failures)
- form should handle submission state

#### Search (10 failures)
- events should have filter options
- restaurants should have filter options
- attractions should have filter options

#### Other (12 failures)
- homepage visual regression on mobile
- homepage visual regression on desktop
- events visual regression on mobile
