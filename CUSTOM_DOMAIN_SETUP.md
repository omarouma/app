# Custom Domain Setup for gagachat.app

## Firebase Console Steps

1. **Go to Firebase Hosting Console**
   - URL: https://console.firebase.google.com/project/oumagachat/hosting

2. **Add Custom Domain**
   - Click **"Add custom domain"**
   - Enter: `gagachat.app`
   - Click **Continue**

3. **Firebase Will Provide DNS Records**
   - Typically 2 A records pointing to Firebase IPs:
     - `151.101.1.195`
     - `151.101.65.195`
   - Or 2 AAAA records (IPv6)

4. **Add DNS Records to Namecheap**
   - Log in to: https://ap.www.namecheap.com/
   - Go to **Domain List** → Click **Manage** next to `gagachat.app`
   - Go to **Advanced DNS** tab
   - Add these records:

     | Type | Host | Value | TTL |
     |------|------|-------|-----|
     | A Record | @ | 151.101.1.195 | Automatic |
     | A Record | @ | 151.101.65.195 | Automatic |
     | CNAME | www | oumagachat.web.app | Automatic |

5. **Verify Ownership**
   - Firebase may ask you to add a TXT record for verification
   - Add the TXT record in Namecheap as instructed by Firebase

6. **Wait for SSL**
   - Firebase will automatically provision SSL certificate
   - This can take 1-24 hours

7. **Done!**
   - Your app will be live at: `https://gagachat.app`

## Update App References

After the domain is active, update these in the app:
- `index.html` canonical URL: Already updated to `gagachat.app`
- `public/manifest.json` start_url: Update if needed
- `public/sw.js` share target redirect: Update if needed

## Supabase Auth Redirect URL

Make sure to add `https://gagachat.app` to Supabase Auth redirect URLs:
1. Go to: https://app.supabase.com/project/xqeriudcoozuvcmzniow/auth/url-configuration
2. Add: `https://gagachat.app` to Site URL
3. Add: `https://gagachat.app/**` to Redirect URLs

## Cloudinary Allowed Origins

Add `https://gagachat.app` to Cloudinary allowed origins if you have CORS restrictions.
