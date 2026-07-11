# ChatGPT Plugin Integration - Quick Reference Card

## 📦 What Was Created (12 New Files)

### API Code

1. `supabase/functions/api-events/index.ts` - Events API
2. `supabase/functions/api-restaurants/index.ts` - Restaurants API

### Config Files

3. `public/.well-known/ai-plugin.json` - ChatGPT manifest (✅ deployed)
4. `public/openapi.yaml` - API spec (⚠️ needs PROJECT_ID update)

### Documentation

5. `CHATGPT_INTEGRATION_README.md` - Main overview
6. `CHATGPT_INTEGRATION_GUIDE.md` - Complete guide (300+ lines)
7. `CHATGPT_PLUGIN_SUMMARY.md` - Implementation details
8. `CHATGPT_QUICK_START.md` - 5-step deployment
9. `CHATGPT_INTEGRATION_CHANGES.md` - This session's changes
10. `SCRIPT_FIX_NOTES.md` - PowerShell fixes

### Scripts

11. `deploy-chatgpt-plugin.ps1` - Deployment automation
12. `test-chatgpt-integration.ps1` - Validation tests

---

## ⚠️ ONE THING YOU MUST DO

**Edit `public/openapi.yaml` line 9:**

Replace:

```yaml
url: https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1
```

With your actual Supabase project ID (get from https://supabase.com/dashboard)

---

## 🚀 Deploy in 3 Commands

```powershell
# 1. Test everything
.\test-chatgpt-integration.ps1

# 2. Deploy functions
.\deploy-chatgpt-plugin.ps1

# 3. Deploy static files
git add . && git commit -m "Add ChatGPT plugin integration" && git push
```

---

## 📍 Current Status

| Component             | Status                          |
| --------------------- | ------------------------------- |
| Files created         | ✅ All 12 files                 |
| Scripts working       | ✅ Fixed and tested             |
| Static files deployed | ✅ Live on desmoinesinsider.com |
| OpenAPI config        | ⚠️ Needs PROJECT_ID             |
| Edge functions        | ⏸️ Not deployed yet             |
| ChatGPT registration  | ⏸️ Pending                      |

---

## 🎯 Next Steps

1. Update `openapi.yaml` line 9 (Supabase project ID)
2. Run `.\deploy-chatgpt-plugin.ps1`
3. Push to production: `git push`
4. Register at https://chat.openai.com

---

## 📖 Where to Start

**Just deploying?** → `CHATGPT_QUICK_START.md`  
**Need details?** → `CHATGPT_INTEGRATION_GUIDE.md`  
**What changed?** → `CHATGPT_INTEGRATION_CHANGES.md`

---

**Everything is documented and ready to go!** ✨
