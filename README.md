# Des Moines AI Pulse

A modern web platform showcasing Des Moines events, restaurants, and local insights powered by AI.

## Project Info

**URL**: https://lovable.dev/projects/c6f56135-984a-4df0-b477-f9d3a03c55e7

## Table of Contents

- [Quick Start](#quick-start)
- [Technologies](#technologies)
- [New Features & Utilities](#new-features--utilities)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)

---

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Git

### Setup

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

Visit http://localhost:8080 to see the application.

---

## Technologies

This project is built with:

- **Frontend**: Vite, React, TypeScript
- **UI Framework**: shadcn-ui, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Edge Functions)
- **Deployment**: Cloudflare Pages
- **Testing**: Playwright
- **3D Graphics**: Three.js, React Three Fiber

---

## New Features & Utilities

### Safe Storage (`src/lib/safeStorage.ts`)

A localStorage wrapper that gracefully handles failures (private mode, quota exceeded):

```typescript
import { storage } from '@/lib/safeStorage';

// Store and retrieve typed data
storage.set('user-prefs', { theme: 'dark' });
const prefs = storage.get('user-prefs', { theme: 'light' });
```

### Error Handler (`src/lib/errorHandler.ts`)

Centralized error handling with automatic user-friendly messages:

```typescript
import { handleError, withErrorHandling } from '@/lib/errorHandler';

try {
  await riskyOperation();
} catch (error) {
  handleError(error, {
    component: 'MyComponent',
    action: 'operation'
  });
}
```

### Edge Function Security Middleware

Three production-ready utilities for Supabase Edge Functions:

- **CORS Management** (`supabase/functions/_shared/cors.ts`): Environment-aware CORS headers
- **Rate Limiting** (`supabase/functions/_shared/rateLimit.ts`): IP-based rate limiting (100 req/15min)
- **Input Validation** (`supabase/functions/_shared/validation.ts`): Schema-based parameter validation

See [Edge Functions Documentation](./supabase/functions/_shared/README.md) for details.

### Performance Optimizations

- **Lazy Loading**: Three.js and heavy components load on-demand
- **Bundle Analysis**: Run `npm run build:analyze` to visualize bundle size
- **Hidden Sourcemaps**: Production sourcemaps for error tracking (not publicly exposed)
- **Optimized Dependencies**: React and core libraries pre-bundled

### TypeScript Strict Mode

Gradual migration path to strict TypeScript:

```bash
# Regular type check
npm run type-check

# Strict type check
npm run type-check:strict
```

Add files to `tsconfig.strict.json` as they become strict-compliant.

---

## Development

### Available Scripts

```bash
# Development
npm run dev                 # Start dev server (http://localhost:8080)
npm run preview             # Preview production build

# Building
npm run build               # Production build
npm run build:analyze       # Build with bundle analysis

# Code Quality
npm run lint                # Run ESLint
npm run lint:fix            # Auto-fix ESLint issues
npm run type-check          # Type check (relaxed mode)
npm run type-check:strict   # Type check (strict mode)
npm run validate            # Lint + type check

# Testing
npm test                    # Run all tests
npm run test:ui             # Interactive test UI
npm run test:a11y           # Accessibility tests
npm run test:mobile         # Mobile responsive tests
npm run test:performance    # Performance tests
```

### Best Practices

#### Environment Variables

```typescript
// ❌ WRONG - breaks in Vite
if (process.env.NODE_ENV === 'development') { }

// ✅ CORRECT
if (import.meta.env.DEV) { }
```

#### Console Logging

```typescript
// ❌ WRONG - logs in production
console.log('Debug info');

// ✅ CORRECT
if (import.meta.env.DEV) {
  console.log('Debug info');
}
```

#### localStorage Usage

```typescript
// ❌ WRONG - can crash in private mode
localStorage.setItem('key', 'value');

// ✅ CORRECT
import { storage } from '@/lib/safeStorage';
storage.setString('key', 'value');
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for complete coding standards.

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific test suites
npm run test:a11y          # WCAG 2.1 Level AA compliance
npm run test:mobile        # Mobile viewport tests
npm run test:performance   # Core Web Vitals

# Interactive mode
npm run test:ui
```

### Test Coverage

Current test suites cover:
- ✅ Accessibility (WCAG 2.1 AA)
- ✅ Mobile responsiveness
- ✅ Performance (LCP, FID, CLS)
- ✅ Links and navigation
- ✅ Form validation

---

## Deployment

### Quick Deploy

**Via Lovable:**
1. Open [Lovable Project](https://lovable.dev/projects/c6f56135-984a-4df0-b477-f9d3a03c55e7)
2. Click Share → Publish

**Via Cloudflare Pages:**
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Configure environment variables
5. Deploy

### Production Checklist

Before deploying to production:

- [ ] All tests passing (`npm test`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Edge functions deployed

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete checklist.

### Custom Domain

To connect a custom domain:

1. Navigate to Project > Settings > Domains in Lovable
2. Click Connect Domain
3. Follow DNS configuration instructions

Or configure directly in Cloudflare Pages:
1. Go to Pages → Your Project → Custom domains
2. Add your domain
3. Update DNS records as instructed

---

## Documentation

### For Developers

- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** - Technical guide with examples
  - New utilities usage
  - Edge function patterns
  - Performance optimization
  - Security best practices
  - Testing strategies

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines
  - Coding standards
  - Commit message format
  - Pull request process
  - Testing requirements

- **[Edge Functions README](./supabase/functions/_shared/README.md)** - API reference
  - CORS management
  - Rate limiting
  - Input validation
  - Complete examples

### For Deployment

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment checklist
  - Pre-deployment checks
  - Cloudflare Pages setup
  - Supabase configuration
  - Post-deployment verification
  - Rollback procedures

- **[ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)** - Environment configuration
  - Required variables
  - Development setup
  - Staging setup
  - Production setup
  - Security best practices

---

## How Can I Edit This Code?

### Use Lovable

Simply visit the [Lovable Project](https://lovable.dev/projects/c6f56135-984a-4df0-b477-f9d3a03c55e7) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

### Use Your Preferred IDE

Clone this repo and push changes. Pushed changes will also be reflected in Lovable.

Requirements:
- Node.js >= 20.0.0 - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```bash
# Clone repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development
npm run dev
```

### Edit Directly in GitHub

- Navigate to the desired file
- Click the "Edit" button (pencil icon)
- Make changes and commit

### Use GitHub Codespaces

- Navigate to your repository
- Click "Code" button
- Select "Codespaces" tab
- Click "New codespace"

---

## Project Structure

```
desmoines-ai-pulse/
├── src/
│   ├── components/        # React components
│   ├── lib/              # Utilities (errorHandler, safeStorage, etc.)
│   ├── pages/            # Route pages
│   ├── hooks/            # Custom React hooks
│   └── types/            # TypeScript type definitions
├── supabase/
│   └── functions/        # Edge functions (API endpoints)
│       └── _shared/      # Security middleware (CORS, rate limit, validation)
├── tests/                # Playwright tests
├── public/               # Static assets
└── docs/                 # Additional documentation
```

---

## Security

### Reporting Security Issues

If you discover a security vulnerability, please email [security contact] instead of using the issue tracker.

### Security Features

- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Rate limiting on API endpoints (100 req/15min)
- ✅ Input validation with schema enforcement
- ✅ CORS configured for production domain
- ✅ XSS prevention with DOMPurify
- ✅ Environment-based configuration
- ✅ No secrets in code (all in environment variables)

---

## Performance

Target metrics:
- **Lighthouse Score**: >90
- **LCP** (Largest Contentful Paint): <2.5s
- **FID** (First Input Delay): <100ms
- **CLS** (Cumulative Layout Shift): <0.1
- **Bundle Size**: <500KB gzipped

Run performance tests:
```bash
npm run test:performance
```

Analyze bundle size:
```bash
npm run build:analyze
```

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run validations (`npm run validate && npm test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## License

[Add your license here]

---

## Support

- **Documentation**: See [/docs](./docs) directory
- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)

---

**Built with ❤️ for Des Moines**
