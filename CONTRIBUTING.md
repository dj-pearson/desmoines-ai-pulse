# Contributing to Des Moines AI Pulse

Thank you for your interest in contributing! This document provides guidelines and standards for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)

---

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Keep discussions professional

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/dj-pearson/desmoines-ai-pulse.git
cd desmoines-ai-pulse

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

---

## Development Workflow

### 1. Create a Branch

```bash
# Feature branch
git checkout -b feature/descriptive-name

# Bug fix branch
git checkout -b fix/issue-description

# Documentation branch
git checkout -b docs/what-youre-documenting
```

### 2. Make Changes

Follow the [Coding Standards](#coding-standards) below.

### 3. Test Your Changes

```bash
# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests
npm test

# Or run all validations at once
npm run validate
```

### 4. Commit

Follow the [Commit Message Guidelines](#commit-messages).

### 5. Push and Create PR

```bash
git push -u origin your-branch-name
```

Then create a pull request on GitHub.

---

## Coding Standards

### TypeScript

#### DO ✅

```typescript
// Use explicit return types for functions
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Use type inference for simple variables
const count = 5; // TypeScript infers number

// Use interfaces for object shapes
interface User {
  id: string;
  name: string;
  email: string;
}

// Use enums for fixed sets of values
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

// Prefix unused parameters with underscore
function handleEvent(_event: Event, data: Data) {
  processData(data);
}
```

#### DON'T ❌

```typescript
// Don't use 'any' unless absolutely necessary
function processData(data: any) { } // ❌

// Don't ignore TypeScript errors
// @ts-ignore // ❌
const result = riskyOperation();

// Don't use 'var'
var count = 5; // ❌ Use const or let
```

### React Components

#### DO ✅

```typescript
// Use functional components with TypeScript
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

// Use named exports for components
export function MyComponent() { }

// Use React hooks properly
function useCustomHook() {
  const [state, setState] = useState<Type>(initialValue);

  useEffect(() => {
    // Effect logic
    return () => {
      // Cleanup
    };
  }, [dependencies]);

  return state;
}

// Lazy load heavy components
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

#### DON'T ❌

```typescript
// Don't use default exports for components
export default function MyComponent() { } // ❌

// Don't forget dependency arrays
useEffect(() => {
  // This runs on every render!
}); // ❌ Missing dependency array

// Don't mutate state directly
state.value = newValue; // ❌
setState({ ...state, value: newValue }); // ✅
```

### Error Handling

#### DO ✅

```typescript
import { handleError, withErrorHandling } from '@/lib/errorHandler';

// Wrap risky operations
try {
  await riskyOperation();
} catch (error) {
  handleError(error, {
    component: 'MyComponent',
    action: 'riskyOperation',
  });
}

// Use the error handler utility
const result = await withErrorHandling(
  () => fetchData(),
  { component: 'DataView', action: 'fetch' },
  [] // fallback
);
```

#### DON'T ❌

```typescript
// Don't swallow errors silently
try {
  await riskyOperation();
} catch (error) {
  // Nothing here ❌
}

// Don't log errors in production
catch (error) {
  console.error(error); // ❌ Use handleError instead
}
```

### Environment Variables

#### DO ✅

```typescript
// Use import.meta.env in Vite
if (import.meta.env.DEV) {
  console.log('Development mode');
}

const apiUrl = import.meta.env.VITE_API_URL;

// Check environment
if (import.meta.env.PROD) {
  // Production-only code
}
```

#### DON'T ❌

```typescript
// Don't use process.env in client code
if (process.env.NODE_ENV === 'development') { } // ❌

// Don't hardcode sensitive values
const apiKey = 'abc123'; // ❌ Use environment variables
```

### Console Logging

#### DO ✅

```typescript
import { logDebug } from '@/lib/errorHandler';

// Use the logging utility
logDebug('User logged in', { userId: user.id });

// Or wrap in DEV check
if (import.meta.env.DEV) {
  console.log('Debug info');
}
```

#### DON'T ❌

```typescript
// Don't use bare console.log
console.log('This will show in production'); // ❌
```

### localStorage Usage

#### DO ✅

```typescript
import { storage } from '@/lib/safeStorage';

// Use safe storage wrapper
storage.set('key', value);
const value = storage.get('key', defaultValue);
```

#### DON'T ❌

```typescript
// Don't use localStorage directly
localStorage.setItem('key', 'value'); // ❌ Can crash in private mode
```

### Styling

#### DO ✅

```typescript
// Use Tailwind utility classes
<div className="flex items-center gap-4 p-4">

// Use shadcn/ui components
import { Button } from '@/components/ui/button';

// Use CSS variables for theme colors
<div className="bg-background text-foreground">

// Combine classes with cn utility
import { cn } from '@/lib/utils';
<div className={cn('base-class', isActive && 'active-class')}>
```

#### DON'T ❌

```typescript
// Don't use inline styles (except for dynamic values)
<div style={{ color: 'red' }}> // ❌

// Don't use arbitrary values for spacing
<div className="mt-[17px]"> // ❌ Use Tailwind scale: mt-4
```

---

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, no logic changes)
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Maintenance tasks
- `ci:` CI/CD changes

### Examples

```bash
# Good commits ✅
git commit -m "feat(auth): add password reset functionality"
git commit -m "fix(events): correct timezone conversion for all-day events"
git commit -m "docs(api): update edge function examples"
git commit -m "perf(images): lazy load images below the fold"
git commit -m "refactor(hooks): simplify useAuth implementation"

# Bad commits ❌
git commit -m "fix stuff"
git commit -m "WIP"
git commit -m "asdfasdf"
```

### Detailed Commit

For larger changes, include a body:

```bash
git commit -m "feat(search): add advanced filtering options

- Add date range filter
- Add category multi-select
- Add location radius filter
- Update UI with collapsible filter panel

Closes #123"
```

---

## Pull Request Process

### Before Creating a PR

1. **Update from main:**
   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git rebase main
   ```

2. **Run validations:**
   ```bash
   npm run validate
   npm test
   ```

3. **Test manually:**
   - Test your changes in the browser
   - Test on mobile viewport
   - Check for console errors

### PR Title

Follow the same convention as commit messages:

```
feat(component): add new feature
fix(bug): resolve issue with X
```

### PR Description Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- List specific changes
- Include screenshots for UI changes

## Testing
- [ ] Tested locally
- [ ] Tested on mobile
- [ ] Added/updated tests
- [ ] All tests passing

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Commented complex code
- [ ] Documentation updated
- [ ] No console warnings/errors
- [ ] Builds successfully
```

### Review Process

1. Automated checks must pass:
   - Linting
   - Type checking
   - Tests
   - Build

2. Code review required from maintainer

3. Address review comments

4. Squash and merge when approved

---

## Testing Requirements

### What to Test

1. **Unit tests** for utilities and helpers
2. **Component tests** for UI components
3. **Integration tests** for features
4. **E2E tests** for critical user flows

### Running Tests

```bash
# All tests
npm test

# Specific test suite
npm run test:a11y
npm run test:mobile
npm run test:performance

# Watch mode
npm test -- --watch

# Update snapshots
npm test -- --update-snapshots
```

### Writing Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should perform action', async ({ page }) => {
    // Arrange
    const button = page.getByRole('button', { name: 'Click Me' });

    // Act
    await button.click();

    // Assert
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### Test Coverage

Aim for:
- Critical paths: 100%
- Business logic: 80%+
- UI components: 60%+
- Overall: 70%+

---

## Additional Guidelines

### Documentation

- Update README.md for user-facing features
- Update DEVELOPER_GUIDE.md for technical changes
- Add JSDoc comments for complex functions
- Keep documentation up to date

### Security

- Never commit sensitive data (.env files, API keys)
- Use environment variables for secrets
- Validate all user input
- Sanitize HTML content
- Follow OWASP guidelines

### Performance

- Lazy load heavy components
- Optimize images (WebP, proper sizing)
- Use React.memo for expensive renders
- Avoid unnecessary re-renders
- Keep bundle size reasonable

### Accessibility

- Use semantic HTML
- Include ARIA labels where needed
- Ensure keyboard navigation works
- Maintain color contrast
- Test with screen readers

---

## Questions?

- Open an issue for bugs
- Start a discussion for feature requests
- Ask in pull request comments
- Check [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for technical details

---

**Thank you for contributing!** 🎉

