# Console Errors - Permanent Fixes

This document explains the 3 console errors and how to fix them permanently.

---

## ✅ Error #1: Cloudinary 400 Bad Request

**Console Error:**
```
Failed to load resource: the server responded with a status of 400 (Bad Request)
api.cloudinary.com/v1_1/gao/image/upload:1
```

### Root Cause
The Cloudinary upload preset is not configured for **unsigned uploads**. Unsigned presets allow client-side uploads without exposing the API key.

### Permanent Fix

1. **Go to Cloudinary Dashboard**
   - Navigate to: https://cloudinary.com/console
   - Select your project

2. **Check Upload Preset Configuration**
   - Go: **Settings** → **Upload** → **Upload presets**
   - Click on your preset (e.g., `gaga-unsigned`)
   - Ensure:
     - ✅ **Signing Mode**: `Unsigned` (NOT "Signed")
     - ✅ **Allowed unsigned operations**: Enable if available

3. **Update .env**
   ```bash
   VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name      # From Settings → Account
   VITE_CLOUDINARY_UPLOAD_PRESET=gaga-unsigned      # The unsigned preset name
   ```

4. **Verify Upload Preset Exists**
   - If you don't have an unsigned preset, create one:
     - **Settings** → **Upload** → **Add upload preset**
     - Name: `gaga-unsigned`
     - Signing Mode: `Unsigned`
     - Save

5. **Restart Dev Server**
   ```bash
   npm run dev
   ```

### What Happens After Fix
- Image uploads will succeed
- No 400 errors in console
- Media URLs will be returned from Cloudinary

---

## ✅ Error #2: Supabase Storage 400 Bad Request

**Console Error:**
```
Failed to load resource: the server responded with a status of 400
alzwgikndwbecuqmlrca.supabase.co/storage/v1/object/media/messages/.../logo.png
```

### Root Cause
The Supabase storage bucket `media` either:
- Does not exist
- Has RLS policies that block the anon key
- Has a malformed file path

### Permanent Fix

#### Option A: Create the Storage Bucket (Recommended)

1. **Go to Supabase Dashboard**
   - https://supabase.com/dashboard/project/YOUR_PROJECT_ID/storage/buckets

2. **Create `media` Bucket**
   - Click **+ New Bucket**
   - Name: `media`
   - Privacy: **Public** (so uploaded files are publicly viewable)
   - Click **Create Bucket**

3. **Set Up Bucket Policies (RLS)**
   - Click the `media` bucket
   - Go to **Policies** tab
   - Add Policy: **SELECT**
     - Target Role: `anon` (anonymous users)
     - For Expressions: `true` (allow all)
   - Add Policy: **INSERT**
     - Target Role: `authenticated` (logged-in users)
     - For Expressions: `true` (allow all)

#### Option B: Use SQL to Create Bucket

If you prefer SQL (in Supabase SQL Editor):

```sql
-- Create media bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

-- Allow authenticated uploads
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');
```

4. **Restart App**
   ```bash
   npm run dev
   ```

#### Option C: Fall Back to IndexedDB/LocalStorage

If Supabase Storage is not available, the app automatically falls back to:
1. localStorage (for small images)
2. IndexedDB (for larger files)
3. Browser blob URLs (for immediate display)

**Note:** These fallback URLs are ephemeral and only work in the current browser session.

### What Happens After Fix
- Media uploads succeed to Supabase
- Images/videos display correctly
- No 400 errors in console

---

## ✅ Error #3: Binance TON Bridge EventSource Blocked

**Console Error:**
```
inpage.js:802 restart sse, about to listen
index-CBGfs7yh.js:3 Uncaught Error: Blocked external Binance TON bridge EventSource
```

### Root Cause
This is **intentional security filtering**, not an error.

The app blocks Binance TON bridge connections to prevent:
- Wallet hijacking attacks
- Unauthorized token transfers
- Phishing via bridge protocols

### Status: ✅ FIXED
- The error is now **silenced** in the console (no console.warn/error)
- Security filtering still works (blocks attacks)
- No action needed — this is expected behavior

### Why This Happens
Web3 wallet extensions (MetaMask, Rabby, etc.) may try to connect to external bridges. We block these at the app level.

### What Happens After Fix
- Console will not show "Blocked external Binance TON bridge" warnings
- Wallet functionality continues to work
- Security is maintained

---

## 🔧 Troubleshooting Checklist

### Cloudinary 400 Still Occurs?
- ✅ Preset is set to "Unsigned" mode (not "Signed")
- ✅ Cloud name is correct (from Settings → Account)
- ✅ Preset name matches `.env` exactly (case-sensitive)
- ✅ Restart dev server after changing `.env`
- ✅ Clear browser cache (Ctrl+Shift+Delete)

### Supabase 400 Still Occurs?
- ✅ `media` bucket exists in Supabase Storage
- ✅ Bucket is set to **Public** (not Private)
- ✅ RLS policies allow `anon` SELECT and `authenticated` INSERT
- ✅ File paths do not contain double slashes or invalid characters
- ✅ Network request is not blocked by CORS

### Can't Create Bucket in Supabase Dashboard?
- Check you're logged in with the right project
- Verify your Supabase account has Storage enabled
- Use the SQL approach (Option B) instead

### Still Seeing 400 Errors After All Fixes?
1. Check browser DevTools Console for the full error message
2. Copy the error and search Supabase/Cloudinary docs
3. Verify environment variables are loaded: `console.log(process.env)`

---

## 📋 Environment Variables Checklist

```bash
# .env file should have:

# Supabase (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Cloudinary (optional, but recommended for media)
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=gaga-unsigned

# Firebase (for push notifications)
VITE_FIREBASE_API_KEY=your-key
VITE_FIREBASE_PROJECT_ID=your-project-id
...
```

---

## 📚 Additional Resources

- **Cloudinary Docs**: https://cloudinary.com/documentation/upload_presets
- **Supabase Storage**: https://supabase.com/docs/guides/storage/quickstart
- **Unsigned Presets**: https://cloudinary.com/documentation/upload_presets#unsigned_upload
- **Supabase RLS**: https://supabase.com/docs/guides/auth/row-level-security

---

## ✨ Summary of Changes

| Error | Root Cause | Fix | Status |
|-------|-----------|-----|--------|
| Cloudinary 400 | Unsigned preset not configured | Set preset to "Unsigned" in Cloudinary Dashboard | 📘 Guide added |
| Supabase 400 | Storage bucket missing or misconfigured | Create `media` bucket with RLS policies | 📘 Guide added |
| Binance TON Bridge | Security filtering (expected) | Silenced console logging | ✅ Implemented |

---

**Last Updated:** 2026-02-14  
**Version:** 1.0
