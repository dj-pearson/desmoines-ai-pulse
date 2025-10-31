# Platform Replication Guide
**AI Setup, Social Media Posts & Blog Posts Module Migration**

*Document Created: October 31, 2025*  
*Source Platform: Des Moines AI Pulse*  
*Target: Universal Platform Migration Guide*

---

## 📋 **EXECUTIVE SUMMARY**

This document provides a comprehensive workflow and timeline for replicating the AI setup, Social Media Posts, and Blog Posts modules from the Des Moines AI Pulse platform to any new platform. The guide includes database schemas, component architectures, implementation timelines, and critical success factors.

**Estimated Timeline:** 6 weeks  
**Complexity Level:** Intermediate to Advanced  
**Dependencies:** React, PostgreSQL, Supabase (recommended), Claude AI API

---

## 🏗️ **ARCHITECTURE OVERVIEW**

### **System Dependencies**
```
AI Configuration System (Foundation)
├── Social Media Management System
│   ├── Content Generation Engine
│   ├── Multi-Platform Distribution
│   └── Automated Scheduling
└── Blog/Article Management System
    ├── Rich Content Editor
    ├── AI Article Generation
    └── SEO Management
```

### **Core Technologies Stack**
- **Frontend:** React, TypeScript, TanStack Query, Lucide React
- **Backend:** Supabase (Database + Edge Functions)
- **AI Integration:** Claude/Anthropic API
- **Content Format:** Markdown (Articles), JSON (Social Posts)
- **Authentication:** Supabase Auth with Role-Based Access Control

---

## 🗓️ **DETAILED IMPLEMENTATION TIMELINE**

### **Phase 1: Foundation Setup (Week 1-2)**

#### **Week 1: Environment & AI Configuration Core**

**Days 1-2: Environment Setup**
- [ ] Set up new database (Supabase recommended)
- [ ] Configure authentication system
- [ ] Set up development environment
- [ ] Install required dependencies

**Days 3-4: AI Configuration Database**
```sql
-- AI Configuration Table
CREATE TABLE public.ai_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- AI Models Table  
CREATE TABLE public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT,
  context_window INTEGER DEFAULT 200000,
  max_output_tokens INTEGER DEFAULT 8192,
  supports_vision BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can manage AI configuration"
ON public.ai_configuration FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can manage AI models"
ON public.ai_models FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Days 5-7: Core AI Components**
- [ ] Create `AIConfigurationManager.tsx`
- [ ] Implement `useAIConfiguration.ts` hook
- [ ] Build `useAIModels.ts` hook
- [ ] Add model testing functionality

#### **Week 2: AI System Completion**

**Days 1-3: AI Configuration Manager Component**
```tsx
// Key Component Structure
export function AIConfigurationManager() {
  // Model management
  // Configuration settings (temperature, tokens, etc.)
  // Test functionality
  // Real-time updates
}
```

**Days 4-5: Shared AI Utility**
```typescript
// supabase/functions/_shared/aiConfig.ts
export async function getAIConfig(supabaseUrl: string, supabaseKey: string): Promise<AIConfig>
export async function getClaudeHeaders(claudeApiKey: string, ...): Promise<Record<string, string>>
export async function buildClaudeRequest(messages: any[], options: {...}): Promise<any>
```

**Days 6-7: Integration Testing**
- [ ] Test AI configuration CRUD operations
- [ ] Verify caching functionality  
- [ ] Test model switching and validation

### **Phase 2: Social Media Management System (Week 3-4)**

#### **Week 3: Social Media Database & Core Logic**

**Days 1-3: Database Schema**
```sql
-- Social Media Posts
CREATE TABLE public.social_media_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'general')),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event_of_the_day', 'restaurant_of_the_day', 'weekly_highlight', 'special_announcement')),
  platform_type TEXT NOT NULL CHECK (platform_type IN ('twitter_threads', 'facebook_linkedin', 'combined')),
  post_content JSONB NOT NULL, -- Stores multiple format versions
  post_title TEXT,
  content_url TEXT,
  webhook_urls TEXT[],
  ai_prompt_used TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'scheduled')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  posted_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE
);

-- Webhook Configuration
CREATE TABLE public.social_media_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_media_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_media_webhooks ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Admins can manage social media posts"
ON public.social_media_posts FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can manage webhooks"
ON public.social_media_webhooks FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Days 4-5: Content Generation Edge Function**
```typescript
// supabase/functions/social-media-manager/index.ts
// Key functionality:
// - AI-powered content generation
// - Multi-format output (Twitter threads + Facebook/LinkedIn)
// - Content selection logic (events, restaurants)
// - Webhook distribution
// - Automated scheduling integration
```

**Days 6-7: Social Media Manager Hook**
```typescript
// useSocialMediaManager.ts
export function useSocialMediaManager() {
  // Post generation
  // Webhook management
  // Publishing workflow
  // Status management
}
```

#### **Week 4: Social Media UI & Automation**

**Days 1-3: Social Media Manager Component**
```tsx
// SocialMediaManager.tsx
// Features:
// - Post generation interface
// - Content preview with multiple formats
// - Webhook management
// - Automation settings
// - Post history and management
```

**Days 4-5: Automation System**
```sql
-- Cron job integration for automated posting
-- Schedule management
-- Automated content selection
-- Webhook distribution
```

**Days 6-7: Testing & Refinement**
- [ ] Test content generation
- [ ] Verify webhook functionality
- [ ] Test automation triggers
- [ ] UI/UX refinement

### **Phase 3: Blog/Article Management System (Week 5-6)**

#### **Week 5: Article Database & Core Features**

**Days 1-3: Article Database Schema**
```sql
-- Articles Table
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL, -- Markdown format
  excerpt TEXT,
  featured_image_url TEXT,
  author_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  category TEXT DEFAULT 'General',
  tags TEXT[] DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT[],
  view_count INTEGER DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  generated_from_suggestion_id UUID REFERENCES content_suggestions(id)
);

-- Article Comments
CREATE TABLE public.article_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES article_comments(id),
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Article Webhooks
CREATE TABLE public.article_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Content Suggestions (for AI generation)
CREATE TABLE public.content_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  category TEXT,
  priority INTEGER DEFAULT 1,
  suggested_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'generated')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_suggestions ENABLE ROW LEVEL SECURITY;

-- Article policies
CREATE POLICY "Anyone can view published articles" 
ON public.articles FOR SELECT 
USING (status = 'published');

CREATE POLICY "Authors can manage their own articles" 
ON public.articles FOR ALL 
USING (auth.uid() = author_id);

CREATE POLICY "Admins can manage all articles" 
ON public.articles FOR ALL 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Days 4-5: Article Management Hook**
```typescript
// useArticles.ts
export function useArticles() {
  // CRUD operations
  // Publishing workflow
  // SEO management
  // Analytics tracking
}
```

**Days 6-7: Article Editor Component Foundation**
```tsx
// ArticleEditor.tsx
// Core editing interface with:
// - Rich markdown editor
// - Live preview
// - SEO fields
// - Category/tag management
```

#### **Week 6: AI Features & Polish**

**Days 1-3: AI Article Generation**
```typescript
// supabase/functions/generate-article/index.ts
// Features:
// - Topic-based generation
// - SEO-optimized content
// - Markdown formatting
// - Custom prompt handling
// - Integration with content suggestions
```

**Days 4-5: Articles Manager & Webhook System**
```tsx
// ArticlesManager.tsx
// Features:
// - Article dashboard
// - Bulk operations
// - Analytics overview
// - Webhook management
// - Publishing workflow
```

**Days 6-7: Final Integration & Testing**
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] Deployment preparation

---

## 🛠️ **REQUIRED COMPONENTS MIGRATION**

### **Core React Components**

#### **AI System Components**
```
src/components/
├── AIConfigurationManager.tsx     # Main AI settings interface
├── hooks/
│   ├── useAIConfiguration.ts      # AI config state management
│   └── useAIModels.ts            # AI model management
└── shared/
    └── aiConfig.ts               # Shared AI utilities
```

#### **Social Media Components**
```
src/components/
├── SocialMediaManager.tsx         # Main social media interface
├── hooks/
│   └── useSocialMediaManager.ts  # Social media state management
└── functions/
    └── social-media-manager/     # Content generation edge function
        └── index.ts
```

#### **Blog/Article Components**
```
src/components/
├── ArticleEditor.tsx             # Rich content editor
├── ArticlesManager.tsx           # Article management dashboard
├── AIArticleGenerator.tsx        # AI generation interface
├── ArticleWebhookConfig.tsx      # Webhook configuration
├── hooks/
│   └── useArticles.ts           # Article CRUD operations
└── functions/
    ├── generate-article/        # AI article generation
    └── publish-article-webhook/ # Webhook publishing
```

### **Required Dependencies**

#### **Frontend Dependencies**
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@supabase/supabase-js": "^2.39.3",
    "sonner": "^1.4.0",
    "lucide-react": "^0.400.0",
    "date-fns": "^2.30.0",
    "date-fns-tz": "^2.0.0",
    "react-markdown": "^9.0.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4"
  }
}
```

#### **Backend Dependencies** 
```json
{
  "edge-functions": {
    "@supabase/supabase-js": "^2.39.3",
    "date-fns-tz": "^2.0.0"
  }
}
```

---

## 🔧 **CONFIGURATION REQUIREMENTS**

### **Environment Variables**
```bash
# Core Supabase Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key  
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Integration
CLAUDE_API_KEY=your-claude-api-key

# Optional Integrations
GOOGLE_SEARCH_API_KEY=your-google-search-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
GOOGLE_MAPS_API_KEY=your-maps-key
FIRECRAWL_API_KEY=your-firecrawl-key
```

### **Default AI Configuration Values**
```sql
INSERT INTO public.ai_configuration (setting_key, setting_value, description) VALUES
('default_model', '"claude-sonnet-4-20250514"', 'Default Claude AI model for all modules'),
('api_endpoint', '"https://api.anthropic.com/v1/messages"', 'Anthropic API endpoint'),
('max_tokens_standard', '2000', 'Default max tokens for standard operations'),
('max_tokens_large', '8000', 'Max tokens for large operations (articles, bulk processing)'),
('temperature_precise', '0.1', 'Temperature for precise extraction tasks'),
('temperature_creative', '0.7', 'Temperature for creative content generation'),
('anthropic_version', '"2023-06-01"', 'Anthropic API version header');
```

---

## 🚀 **CRITICAL SUCCESS FACTORS**

### **1. Foundation First Approach**
- **Start with AI Configuration** - This is the foundation that both social media and blog systems depend on
- **Test thoroughly** before moving to dependent systems
- **Maintain centralized configuration** pattern throughout

### **2. Preserve Core Architectural Patterns**

#### **Centralized AI Configuration**
```typescript
// Pattern: All modules use shared AI config
const config = await getAIConfig(supabaseUrl, supabaseKey);
const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
const request = await buildClaudeRequest(messages, options);
```

#### **Multi-Format Content Generation**
```typescript
// Pattern: Generate multiple formats simultaneously
const shortContent = generateShortForm(content); // Twitter/Threads
const longContent = generateLongForm(content);   // Facebook/LinkedIn
const postData = {
  post_content: JSON.stringify({
    twitter_threads: shortContent,
    facebook_linkedin: longContent
  })
};
```

#### **Webhook-Based Distribution**
```typescript
// Pattern: Flexible webhook system for external integrations
const webhookPayload = {
  content_formats: { ... },
  title: post.post_title,
  url: post.content_url,
  metadata: { ... }
};
```

### **3. Maintain Data Integrity**
- **Use Row Level Security (RLS)** for all tables
- **Implement proper user role checks** 
- **Validate all AI-generated content** before publishing
- **Maintain audit trails** for all administrative actions

### **4. Performance Considerations**
- **Implement caching** for AI configurations (5-minute cache)
- **Use batch operations** for bulk content generation
- **Optimize database queries** with proper indexing
- **Rate limit AI API calls** to prevent quota exhaustion

---

## ✅ **MIGRATION CHECKLIST**

### **Pre-Migration Setup**
- [ ] **Choose target platform stack** (Supabase + React recommended)
- [ ] **Set up development environment** with required dependencies
- [ ] **Obtain necessary API keys** (Claude, Google APIs if needed)
- [ ] **Configure authentication system** with role-based access
- [ ] **Set up database** with PostgreSQL and RLS enabled

### **Phase 1: AI Foundation (Week 1-2)**
- [ ] Create AI configuration database tables
- [ ] Implement AI configuration management component
- [ ] Build AI model management system  
- [ ] Add model testing functionality
- [ ] Create shared AI utility functions
- [ ] Test AI configuration CRUD operations
- [ ] Verify caching functionality

### **Phase 2: Social Media System (Week 3-4)**
- [ ] Create social media database schema
- [ ] Implement content generation edge function
- [ ] Build social media manager interface
- [ ] Add webhook management system
- [ ] Implement automation scheduling
- [ ] Create post management features
- [ ] Test content generation and distribution
- [ ] Verify webhook functionality

### **Phase 3: Blog System (Week 5-6)**
- [ ] Create articles database schema
- [ ] Implement article management hooks
- [ ] Build rich content editor
- [ ] Add AI article generation
- [ ] Create articles management dashboard
- [ ] Implement webhook publishing system
- [ ] Add SEO management features
- [ ] Test end-to-end article workflow

### **Post-Migration**
- [ ] **Performance testing** and optimization
- [ ] **Security audit** of RLS policies and authentication
- [ ] **Documentation** of custom modifications
- [ ] **Training** for content administrators
- [ ] **Backup and disaster recovery** procedures
- [ ] **Monitoring and alerting** setup

---

## 📊 **SUCCESS METRICS**

### **Functional Metrics**
- ✅ **AI Configuration**: Model switching, temperature/token adjustments work correctly
- ✅ **Social Media**: Content generation produces quality multi-format posts
- ✅ **Blog System**: Articles can be created, edited, and published successfully
- ✅ **Webhooks**: External integrations receive properly formatted content
- ✅ **Automation**: Scheduled content generation works reliably

### **Performance Metrics**
- ⚡ **AI Response Time**: < 30 seconds for content generation
- ⚡ **Database Queries**: < 2 seconds for dashboard loading
- ⚡ **Webhook Delivery**: < 10 seconds for external publishing
- ⚡ **UI Responsiveness**: < 1 second for user interactions

### **Quality Metrics**
- 📝 **Content Quality**: AI-generated content requires minimal editing
- 🔒 **Security**: All sensitive operations properly authenticated
- 🎯 **User Experience**: Intuitive workflow for content creators
- 📈 **Reliability**: 99%+ uptime for automated processes

---

## 🔍 **TROUBLESHOOTING GUIDE**

### **Common Issues & Solutions**

#### **AI Configuration Issues**
```
Problem: "AI model test failing"
Solution: Verify CLAUDE_API_KEY and check model availability
Check: API endpoint configuration and rate limits
```

#### **Social Media Generation Issues**
```
Problem: "Content generation produces empty results"
Solution: Check AI configuration caching and model selection
Verify: Content selection logic and database content availability
```

#### **Blog System Issues**
```
Problem: "Articles not saving or publishing"
Solution: Check RLS policies and user permissions
Verify: Webhook configuration and markdown parsing
```

#### **Database Connection Issues**
```
Problem: "Supabase connection errors"
Solution: Verify environment variables and RLS policies
Check: Service role key permissions and table access
```

---

## 📚 **ADDITIONAL RESOURCES**

### **Documentation References**
- [Supabase Documentation](https://supabase.com/docs)
- [Claude API Documentation](https://docs.anthropic.com/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Markdown Specification](https://www.markdownguide.org/)

### **Code Examples Repository**
All component examples and database schemas referenced in this guide are available in the source Des Moines AI Pulse repository:
- AI Configuration: `src/components/AIConfigurationManager.tsx`
- Social Media: `src/components/SocialMediaManager.tsx`
- Blog System: `src/components/ArticleEditor.tsx`
- Database Schemas: `supabase/migrations/`

### **Support & Updates**
This migration guide is based on the Des Moines AI Pulse platform as of October 31, 2025. For updates or questions about specific implementation details, refer to the source repository or create issues for clarification.

---

**Document Version:** 1.0  
**Last Updated:** October 31, 2025  
**Migration Complexity:** Intermediate to Advanced  
**Estimated Effort:** 6 weeks (1 developer, part-time)

*This guide provides a comprehensive framework for replicating the AI-powered content management system. Adjust timelines and implementation details based on your specific platform requirements and team capacity.*