# PowerShell Scripts - Fixed and Working

## Issue

The original PowerShell scripts (`deploy-chatgpt-plugin.ps1` and `test-chatgpt-integration.ps1`) had Unicode character encoding issues that caused syntax errors in PowerShell.

## What Was Fixed

- Removed emoji characters (🚀, ✅, ❌, ⚠️, etc.)
- Removed special Unicode bullets (•) and em dashes (—)
- Replaced with ASCII-safe alternatives:
  - ✅ → `[OK]`
  - ❌ → `[ERROR]`
  - ⚠️ → `[WARN]`
  - 🚀 → Plain text

## Scripts Now Work

### Test Script

```powershell
.\test-chatgpt-integration.ps1
```

**What it checks:**

- ✓ Local files exist
- ✓ JSON syntax is valid
- ✓ No placeholders in config
- ✓ Supabase connection (if env var set)
- ✓ Production URLs are accessible
- ✓ OpenAPI structure is valid

### Deploy Script

```powershell
.\deploy-chatgpt-plugin.ps1
```

**What it does:**

- ✓ Checks Supabase CLI is installed
- ✓ Deploys `api-events` function
- ✓ Deploys `api-restaurants` function
- ✓ Validates configuration files
- ✓ Shows next steps

## Alternative: Manual Commands

If you prefer to run commands manually instead of using the scripts:

### Manual Testing

```powershell
# 1. Check files exist
Test-Path "public/.well-known/ai-plugin.json"
Test-Path "public/openapi.yaml"

# 2. Validate JSON
Get-Content "public/.well-known/ai-plugin.json" | ConvertFrom-Json

# 3. Test production URLs
Invoke-WebRequest -Uri "https://desmoinesinsider.com/.well-known/ai-plugin.json"
Invoke-WebRequest -Uri "https://desmoinesinsider.com/openapi.yaml"
```

### Manual Deployment

```powershell
# 1. Check Supabase CLI
supabase --version

# 2. Deploy functions
supabase functions deploy api-events
supabase functions deploy api-restaurants

# 3. Verify deployment
supabase functions list
```

## Environment Variables

To test Supabase API endpoints locally, set:

```powershell
$env:SUPABASE_URL = "https://your-project-id.supabase.co"
```

Then run the test script again.

## Next Steps

1. **Update OpenAPI Configuration**

   - Edit `public/openapi.yaml` line 9
   - Replace `YOUR_SUPABASE_PROJECT_ID` with actual ID

2. **Run Tests**

   ```powershell
   .\test-chatgpt-integration.ps1
   ```

3. **Deploy Functions**

   ```powershell
   .\deploy-chatgpt-plugin.ps1
   ```

4. **Deploy Static Files**

   ```powershell
   git add .
   git commit -m "Add ChatGPT plugin integration"
   git push
   ```

5. **Register Plugin**
   - Go to https://chat.openai.com
   - Settings → Plugins
   - "Develop your own plugin"
   - Enter: `desmoinesinsider.com`

## Test Results

Latest test run shows:

- ✓ All files exist
- ✓ JSON is valid
- ⚠ OpenAPI spec has placeholder (expected - you need to update it)
- ⚠ SUPABASE_URL not set (optional for local testing)
- ✓ Production URLs accessible
- ✓ OpenAPI structure valid

**Status:** Ready for deployment after updating OpenAPI spec

## Troubleshooting

**Script won't run:**

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**Can't find supabase command:**

```powershell
npm install -g supabase
```

**PowerShell version too old:**

- Update to PowerShell 7: https://aka.ms/powershell
- Or use Command Prompt with individual commands

---

**Both scripts are now working correctly!** ✓
