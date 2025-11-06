# Dependency Update Plan

This document outlines the strategy for updating outdated dependencies while maintaining stability and compatibility with Cloudflare Pages and Lovable.

## Current Status

Last audit: 2025-01-06

## Update Strategy

### Priority Levels

- **Critical**: Security vulnerabilities (CVE) - Update immediately
- **High**: Major version behind, security patches - Update within 1 week
- **Medium**: Minor version behind, feature updates - Update within 1 month
- **Low**: Patch version behind - Update when convenient

### Testing Requirements

Before updating any dependency:

1. ✅ Check changelog for breaking changes
2. ✅ Test locally after update
3. ✅ Run full test suite (`npm test`)
4. ✅ Run validation (`npm run validate`)
5. ✅ Test build (`npm run build`)
6. ✅ Test in preview mode (`npm run preview`)
7. ✅ Deploy to staging environment
8. ✅ Monitor for 24 hours before production

---

## Critical Updates (Security)

### Security Audit

Run security audit regularly:

```bash
npm audit
npm audit --audit-level=high
```

**Current recommendations:**
- If any HIGH or CRITICAL vulnerabilities appear, update immediately
- Test thoroughly after security updates
- Document any breaking changes

---

## High Priority Updates

### React Ecosystem

**Current approach**: Keep stable

React and related packages are working well. Update only when:
- Security vulnerability discovered
- Critical bug fix needed
- Preparing for major feature requiring new React version

**Update command:**
```bash
# Check for updates
npm outdated | grep react

# Update if needed (test thoroughly)
npm install react@latest react-dom@latest
npm install @types/react@latest @types/react-dom@latest
```

**Testing checklist:**
- [ ] All components render correctly
- [ ] No console warnings about deprecated APIs
- [ ] React Router navigation works
- [ ] Form submissions work
- [ ] Authentication flows work

### Build Tools (Vite)

**Current approach**: Update minor versions only

Vite is stable and working well with current configuration.

**Update command:**
```bash
# Check current version
npm list vite

# Update to latest minor version (safer)
npm install vite@^5.x

# Or update to latest (test thoroughly)
npm install vite@latest
```

**Testing checklist:**
- [ ] Development server starts (`npm run dev`)
- [ ] Hot reload works
- [ ] Build succeeds (`npm run build`)
- [ ] Preview works (`npm run preview`)
- [ ] Environment variables accessible
- [ ] Sourcemaps generated correctly

### TypeScript

**Current approach**: Update to latest stable

TypeScript updates usually safe but may reveal type errors.

**Update command:**
```bash
npm install typescript@latest
npm run type-check
npm run type-check:strict
```

**Expected issues:**
- May reveal new type errors (good - makes code safer)
- May deprecate old syntax
- Update types as needed

---

## Medium Priority Updates

### UI Libraries

#### shadcn-ui Components

**Update approach**: Individual component updates

```bash
# List installed components
ls -la src/components/ui/

# Update specific component
npx shadcn@latest add button

# Update all components (careful - may have breaking changes)
npx shadcn@latest add --overwrite
```

**Testing checklist:**
- [ ] Visual regression check (screenshots)
- [ ] Accessibility still works
- [ ] Responsive behavior maintained
- [ ] Dark mode works (if applicable)

#### Tailwind CSS

**Update command:**
```bash
npm install tailwindcss@latest
npm install @tailwindcss/typography@latest
```

**Testing checklist:**
- [ ] All pages render correctly
- [ ] No style regressions
- [ ] Custom utilities still work
- [ ] Build size acceptable

### React Query

**Current version**: Check with `npm list @tanstack/react-query`

**Update command:**
```bash
npm install @tanstack/react-query@latest
```

**Breaking change notes:**
- v5 has breaking changes from v4
- Check [migration guide](https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5)
- Update query hooks syntax if needed

**Testing checklist:**
- [ ] Data fetching works
- [ ] Cache invalidation works
- [ ] Loading states work
- [ ] Error states work
- [ ] Refetch on window focus works

### React Router

**Current approach**: Update with caution

React Router v6 has different API from v5.

**Update command:**
```bash
npm install react-router-dom@latest
```

**Testing checklist:**
- [ ] All routes accessible
- [ ] Navigation works
- [ ] URL parameters work
- [ ] Redirects work
- [ ] 404 page works
- [ ] Browser back/forward works

---

## Low Priority Updates

### Development Dependencies

Safe to update regularly:

```bash
# ESLint and plugins
npm install --save-dev eslint@latest
npm install --save-dev @typescript-eslint/eslint-plugin@latest
npm install --save-dev @typescript-eslint/parser@latest

# Prettier (if using)
npm install --save-dev prettier@latest

# Playwright
npm install --save-dev @playwright/test@latest
npx playwright install
```

### Utility Libraries

Generally safe to update:

```bash
# Date libraries
npm install date-fns@latest

# Icons
npm install lucide-react@latest

# Utilities
npm install clsx@latest
```

---

## Update Schedule

### Monthly Maintenance (First Friday of Month)

1. **Run audit:**
   ```bash
   npm audit
   npm outdated
   ```

2. **Check for critical updates:**
   - Security vulnerabilities
   - Major bug fixes
   - Breaking changes in dependencies

3. **Update development dependencies:**
   ```bash
   npm update --save-dev
   ```

4. **Test thoroughly:**
   ```bash
   npm run validate
   npm test
   npm run build
   ```

### Quarterly Major Updates (First Month of Quarter)

1. **Review all outdated packages:**
   ```bash
   npm outdated
   ```

2. **Plan updates:**
   - Read changelogs
   - Identify breaking changes
   - Create update branch

3. **Update in groups:**
   - Build tools first
   - UI libraries second
   - Core libraries last

4. **Test extensively:**
   - All test suites
   - Manual testing
   - Staging deployment
   - Performance check

---

## Specific Package Guidance

### DO Update Regularly ✅

- `@types/*` packages (type definitions)
- ESLint plugins and configs
- Playwright (test framework)
- Development utilities
- Icon libraries (lucide-react)
- Utility libraries (clsx, cn)

### Update With Caution ⚠️

- `react` and `react-dom`
- `vite` and build plugins
- `@tanstack/react-query`
- `react-router-dom`
- `tailwindcss`
- shadcn-ui components

### Only Update When Needed 🛑

- Core Supabase packages (unless security issue)
- Three.js and 3D libraries (heavy, stable)
- Major frameworks (breaking changes)

---

## Rollback Procedure

If an update causes issues:

1. **Immediate rollback:**
   ```bash
   git checkout HEAD -- package.json package-lock.json
   npm install
   ```

2. **Test rollback:**
   ```bash
   npm run validate
   npm test
   npm run build
   ```

3. **Document issue:**
   - What package was updated
   - What broke
   - Error messages
   - Create GitHub issue

4. **Plan alternative approach:**
   - Stay on current version
   - Update to intermediate version
   - Wait for bug fix

---

## Automated Dependency Management

### Option 1: Dependabot (GitHub)

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    reviewers:
      - "your-team"
    labels:
      - "dependencies"
    # Only security updates for production
    allow:
      - dependency-type: "direct:production"
        update-types: ["security"]
      - dependency-type: "direct:development"
        update-types: ["version-update:semver-patch", "version-update:semver-minor"]
```

**Pros:**
- Automated PRs for updates
- Security alerts
- Free for public repos

**Cons:**
- Can create many PRs
- Still need manual testing

### Option 2: Renovate

More configurable than Dependabot, but requires setup.

### Option 3: Manual (Current Approach)

- Full control over updates
- Test before applying
- Update on schedule
- **Recommended for this project**

---

## Breaking Change Checklist

When a dependency has breaking changes:

- [ ] Read full changelog
- [ ] Read migration guide
- [ ] Check for codemods (automated migrations)
- [ ] Search codebase for affected patterns
- [ ] Create feature branch
- [ ] Make necessary code changes
- [ ] Update tests
- [ ] Update documentation
- [ ] Test in staging
- [ ] Create rollback plan

---

## Version Pinning Strategy

### Current Strategy: Caret Ranges (`^`)

```json
{
  "dependencies": {
    "react": "^18.3.1"  // Allows 18.3.x and 18.y.z (y > 3)
  }
}
```

**Pros:**
- Automatic patch and minor updates
- Get bug fixes automatically

**Cons:**
- Potential for unexpected changes
- Need to test after `npm install`

### Alternative: Exact Versions

```json
{
  "dependencies": {
    "react": "18.3.1"  // Only this exact version
  }
}
```

**Use for:**
- Known problematic packages
- Critical production dependencies
- Packages with poor semver practices

**Current recommendation**: Keep caret ranges, but test regularly.

---

## Useful Commands

```bash
# Check for outdated packages
npm outdated

# Check for security vulnerabilities
npm audit
npm audit fix

# Update all packages to latest within semver range
npm update

# Update specific package to latest
npm install package-name@latest

# Check why package is installed
npm ls package-name

# See what would be updated (dry run)
npm update --dry-run

# Clean install (remove node_modules and reinstall)
rm -rf node_modules package-lock.json
npm install
```

---

## Resources

- [npm docs](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Can I Use](https://caniuse.com/) - Browser compatibility
- [Bundlephobia](https://bundlephobia.com/) - Package size

---

## Recent Update Log

### 2025-01-06 - Initial Setup

- Established update strategy
- Documented current versions
- Created testing procedures
- Set up monthly schedule

---

**Last Updated:** 2025-01-06
**Next Scheduled Review:** 2025-02-07
