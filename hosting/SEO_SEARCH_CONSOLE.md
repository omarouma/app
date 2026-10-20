# GaGa Chat website — SEO and Search Console verification

## What this change implements

- The **exact Google URL-prefix HTML-tag verification** supplied by the owner is
  inside `hosting/public/index.html`'s `<head>`:
  `<meta name="google-site-verification" content="nmyW__zH-LC191JoeiIxM8EQbOOrcTYUL8A0nuay7l0">`
- Consistent titles, descriptions, social cards and self-referential canonical
  URLs for the homepage and Android download page.
- Canonical, sitemap and internal links point to Firebase Hosting's **clean URLs**.
  Both `firebase.json` and `hosting/firebase.json` specify `cleanUrls: true`;
  Firebase Hosting 301 redirects `*.html` requests to the extensionless path.
- The old `/open` app deep-link fallback remains `noindex`. Do not index user
  chats, call links, profile deep links or private content.
- Download instructions match **current email login**, not future phone OTP.
  Do not link to a Play Store listing until the app is really published.

## Safe validation

Run from repository root:

```bash
python3 -m unittest discover -s hosting/tests -p 'test_seo.py'
```

When approved, deploy **Hosting only**, not Android, FCM, Supabase schema, or
update registry. With an authorized Firebase CLI login:

```bash
firebase deploy --only hosting --project oumagachat
```

The two Firebase Hosting configurations should be checked to confirm that
the CLI's chosen working directory serves `hosting/public` on site
`oumagachat`. Publishing should occur only after human review of the diff.
Do not run `firebase init` because it may overwrite project settings.

After deployment (these checks have NOT been performed on the live domain):

1. Open `https://gagachat.app/` and inspect **View page source**: the exact
   google-site-verification tag must be in `<head>`. Confirm canonical is
   `https://gagachat.app/` and the page is accessible with HTTP 200.
2. Confirm `https://gagachat.app/sitemap.xml` is XML, contains only
   `/`, `/download`, `/privacy`, `/terms`, and the URLs return
   healthy responses.
3. Confirm `https://gagachat.app/robots.txt` points to the sitemap and the
   `/open` app-link fallback is tagged `noindex`.
4. In **Google Search Console**, select the **URL-prefix** property
   `https://gagachat.app/`, choose **HTML tag**, then click **Verify**.
   A **Domain** property needs a DNS TXT record instead; the HTML tag by
   itself does not verify a Domain property.
5. Submit `https://gagachat.app/sitemap.xml` under **Sitemaps** and use
   **URL Inspection** on homepage and `/download`. Request indexing only for
   genuinely public, canonical pages; Google controls indexing and ranking.
6. Check canonical redirects for `/download.html`, `/privacy.html` and
   `/terms.html`, social-card image loading, mobile layout, accessibility,
   HTTPS certificates and Core Web Vitals using live tools.

## Deployment scope and privacy

The website update is separate from GaGa 2.8.15 RC #139. No
`hosting/public/app-updates/android.json` change, release redirects change,
APK/keystore, Firebase Admin credentials or Play Console publication is
authorized by this SEO patch. A Google Play developer registration **fee
invoice is not evidence that the app is published or searchable in Play**.

The original Google HTML verification file
`hosting/public/googlec61001ae56256580.html` remains untouched. Both
verification methods may coexist.
