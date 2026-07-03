# GaGa Chat — Launch Checklist

> Last updated: 2026-06-22
> Your app is **built and compiled**. This is your step-by-step guide to go live.

---

## PHASE 1: Firebase Console Setup (Required before deploy)

### 1.1 Enable Firestore Database
1. Go to [Firebase Console](https://console.firebase.google.com/project/oumagachat) → Firestore Database
2. Click **"Create database"**
3. Choose **"Start in production mode"**
4. Select location: `asia-southeast1` (Singapore) — closest to Bangladesh for low latency
5. Click **Enable**

### 1.2 Upload Security Rules
**Firestore Rules:**
1. Firestore Database → Rules tab
2. Copy contents of `firestore.rules` (in your project root)
3. Paste and click **Publish**

**Firestore Indexes:**
1. Firestore Database → Indexes tab
2. Click **"Add index"** for each composite index, OR
3. Use Firebase CLI to deploy indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

**Storage Rules:**
1. Firebase Console → Storage → Rules tab
2. Copy contents of `storage.rules`
3. Paste and click **Publish**
4. **Important:** Create the default Storage bucket if it doesn't exist

### 1.3 Enable Authentication
1. Firebase Console → Authentication → Sign-in method
2. Enable **Email/Password** (Email link: OFF for now)
3. Enable **Phone** (you may need to add a test phone number for development)
4. Enable **Google** (for social sign-in)
5. Go to **Settings** → **Authorized domains** → add `oumagachat.web.app` (should already be there)

### 1.4 Enable Firebase Storage
1. Firebase Console → Storage → Get started
2. Choose **"Start in production mode"**
3. Select same location as Firestore (`asia-southeast1`)
4. Upload `storage.rules` (see step 1.2)

### 1.5 Cloud Messaging (Push Notifications)
1. Firebase Console → Cloud Messaging → Web Push certificates
2. Click **"Generate key pair"**
3. Copy the **public key** (VAPID key)
4. Add to your `.env`:
   ```bash
   VITE_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY_HERE
   ```
5. Rebuild and redeploy

---

## PHASE 2: Deploy the App

### 2.1 Rebuild with latest changes
```bash
cd "F:\OumaGa\Production Ready app\Kimi_Agent_GaGa Chat Build Review\app"
npm run build
```

### 2.2 Deploy all Firebase services
```bash
# Login (one-time if token expired)
firebase login --reauth

# Deploy everything
firebase deploy --only hosting,firestore,storage

# Or deploy individually:
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

### 2.3 Verify deployment
- Open `https://oumagachat.web.app` in browser
- Check DevTools → Network → sw.js is loaded
- Check DevTools → Application → Service Workers → registered
- Check DevTools → Application → Manifest → valid
- Check DevTools → Console → no Firebase errors

---

## PHASE 3: Post-Launch Verification (Test everything)

### 3.1 Core Authentication Tests
| Test | Expected Result | Status |
|------|-----------------|--------|
| Sign up with email + password | Creates account, redirects to /contacts | ⬜ |
| Password complexity check | Rejects < 8 chars, no uppercase, no number | ⬜ |
| Sign in with existing account | Logs in, loads chats | ⬜ |
| Phone OTP sign up | Sends OTP, verifies, creates account | ⬜ |
| Google sign-in | Opens popup, redirects back, creates account | ⬜ |
| Password reset | Sends email, link works | ⬜ |
| Email verification | Sends email, verifies on click | ⬜ |
| Log out | Returns to landing page | ⬜ |
| Sign in again | Works smoothly | ⬜ |

### 3.2 Social Features Tests
| Test | Expected Result | Status |
|------|-----------------|--------|
| Create post with text | Appears in timeline | ⬜ |
| Create post with poll | Shows poll options, can vote | ⬜ |
| Add photo to post | Uploads, shows in timeline | ⬜ |
| React to post (Like, Love, etc.) | Emoji picker shows, count updates | ⬜ |
| Comment on post | Comment appears, can reply | ⬜ |
| Share post | Share modal opens | ⬜ |
| Save post to bookmarks | Saved in Bookmarks page | ⬜ |
| Create story | 24h story visible to friends | ⬜ |
| View reels | Vertical video feed loads | ⬜ |
| Create event | Event appears in Events page | ⬜ |
| RSVP to event | Attendee count updates | ⬜ |
| Create marketplace listing | Listing appears in Marketplace | ⬜ |
| Send friend request | Request appears in notifications | ⬜ |
| Accept friend request | Both become friends | ⬜ |
| Block user | User disappears from searches | ⬜ |
| Report post | Report appears in Admin dashboard | ⬜ |

### 3.3 Messaging Tests
| Test | Expected Result | Status |
|------|-----------------|--------|
| Start direct chat | Chat opens, messages sync | ⬜ |
| Send text message | Appears in real-time | ⬜ |
| Send image | Uploads, shows thumbnail | ⬜ |
| Send voice message | Records, sends, plays back | ⬜ |
| Create group chat | Group appears in chat list | ⬜ |
| Add members to group | Members see group | ⬜ |
| Send message while offline | Queued, sends when back online | ⬜ |
| Voice call | Ringing, connects, audio works | ⬜ |
| Video call | Ringing, connects, video works | ⬜ |
| Missed call notification | Shows in notifications | ⬜ |

### 3.4 Monetization Tests
| Test | Expected Result | Status |
|------|-----------------|--------|
| View premium plans | Pricing page shows tiers | ⬜ |
| Upgrade to premium | Simulated payment, badge appears | ⬜ |
| View analytics | Stats show for premium users | ⬜ |
| Ad banners appear | "Promoted" label in feed | ⬜ |
| Dismiss ad | Ad disappears | ⬜ |
| Tip creator on post | Tip modal opens, coins deducted | ⬜ |
| Referral code at signup | Code stored, reward applied | ⬜ |
| Wallet balance | Coins visible, transactions log | ⬜ |
| Earn coins daily | Interest/streak bonuses | ⬜ |

### 3.5 Admin Tests (requires admin account)
| Test | Expected Result | Status |
|------|-----------------|--------|
| Access /admin | Redirects if not admin | ⬜ |
| Admin sees reports | Pending reports list | ⬜ |
| Ban reported user | User gets banned | ⬜ |
| Delete offensive post | Post removed from timeline | ⬜ |
| View analytics dashboard | Charts and stats load | ⬜ |
| Verify user | Verified badge appears | ⬜ |

### 3.6 PWA & Performance Tests
| Test | Expected Result | Status |
|------|-----------------|--------|
| Add to home screen (Android) | PWA install prompt shows | ⬜ |
| Add to home screen (iOS) | Safari share → Add to Home Screen | ⬜ |
| Open offline | Offline page shows | ⬜ |
| Back online | Auto-reload to app | ⬜ |
| Push notification | Test message arrives | ⬜ |
| Lighthouse score | >90 on Performance, Accessibility, Best Practices, SEO | ⬜ |

---

## PHASE 4: Monetization Setup (Your Revenue Streams)

### 4.1 Premium Subscriptions (URGENT)
Your Premium page looks real but uses **mock payment**. To actually collect money:

**Option A: bKash (Bangladesh)**
- Contact bKash for Merchant API access
- Integrate bKash checkout API in `usePremiumStore.ts` → `upgradePlan()`
- Replace instant Firestore write with: `await bKashCheckout(amount) → on success → write to Firestore`

**Option B: Stripe (International)**
- Create Stripe account
- Set up Stripe Checkout or Elements
- Backend: Create Stripe Checkout session → redirect user → webhook confirms payment → update Firestore

**Option C: Nagad (Bangladesh)**
- Contact Nagad for Merchant API
- Similar integration pattern to bKash

### 4.2 In-App Ads (Medium Priority)
Current AdBanner uses **mock ads**. To earn real money:

1. **Google AdSense** (easiest for web):
   - Sign up at [AdSense](https://www.google.com/adsense)
   - Get ad unit code
   - Replace MOCK_ADS in `AdBanner.tsx` with real AdSense `<ins>` tags
   - Or use **Google Ad Manager** for more control

2. **Facebook Audience Network** (better for social apps):
   - Sign up at [Meta Audience Network](https://www.facebook.com/audiencenetwork)
   - Integrate their web SDK

3. **Direct Sponsored Content** (highest revenue for startups):
   - Manually manage ad slots in Firestore `ads` collection
   - Charge local businesses directly for promoted posts
   - Full control over pricing and content

### 4.3 Creator Tips & Coins (High Priority for Engagement)
Current tip system is functional but needs:
1. **Coin purchase flow**: Users buy coins with real money (bKash/Stripe)
2. **Coin economy**: Define value (e.g., 100 coins = ৳10 BDT)
3. **Creator payouts**: Allow creators to withdraw tips (requires admin approval + bank transfer)
4. **Platform fee**: Take 10-30% of each tip as commission

### 4.4 Marketplace Commission (Medium Priority)
- Charge 5-10% fee on each successful sale
- Or charge listing fees for featured items
- Implement in `useMarketplaceStore.ts` → `markAsSold()`

### 4.5 Referral System (Already Working — Just Needs Promotion)
- Users get referral code in `GagaRewardsPage`
- New users enter code at signup
- Both get 100 coins
- **You earn**: More users = more ad impressions = more revenue

---

## PHASE 5: Growth & Marketing

### 5.1 Immediate Actions (Week 1)
- [ ] Share `oumagachat.web.app` on Facebook, Twitter, LinkedIn, Instagram
- [ ] Create a Facebook page: "GaGa Chat - Bangladesh's #1 Free Messaging App"
- [ ] Post in Bangladesh tech groups: "Free messaging app, no VPN needed, HD video calls"
- [ ] Share your referral code with friends and family
- [ ] Ask first 10 users for feedback
- [ ] Fix any critical bugs found in testing

### 5.2 Week 2-4 Actions
- [ ] Add app to [Product Hunt](https://www.producthunt.com)
- [ ] Submit to [AlternativeTo](https://alternativeto.net)
- [ ] Create TikTok/Instagram Reels showing app features
- [ ] Partner with Bangladeshi tech influencers for reviews
- [ ] Add to Google Search Console (already has verification meta tag)
- [ ] Submit sitemap to Google
- [ ] Set up Google Analytics 4 for the landing page

### 5.3 Month 2-3
- [ ] Launch Android app wrapper (PWA to APK via [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity))
- [ ] Launch iOS app (via [PWABuilder](https://www.pwabuilder.com/) or Capacitor)
- [ ] Apply for Google Play Store
- [ ] Apply for Apple App Store (harder, but possible with PWA wrapper)
- [ ] Run Facebook/Instagram ads targeting Bangladesh (start small: ৳500/day)
- [ ] Collect user testimonials and add to landing page

---

## PHASE 6: Firebase Backend Maintenance

### 6.1 Ongoing Tasks
- [ ] Monitor Firestore usage daily (Firebase Console → Usage)
- [ ] Monitor Storage usage (images, videos can grow fast)
- [ ] Check Firebase Auth for suspicious sign-in patterns
- [ ] Review reports in Admin dashboard weekly
- [ ] Backup Firestore data monthly (Firebase Console → Export)
- [ ] Monitor app errors via Firebase Crashlytics (if integrated)
- [ ] Track user growth via Firebase Analytics

### 6.2 Cost Optimization
| Service | Free Tier | Your Plan | Est. Monthly Cost |
|---------|-----------|-----------|-----------------|
| Firebase Hosting | 10GB/month, 10GB transfer | 1 site | **Free** |
| Firestore | 1GB storage, 50K reads/day, 20K writes/day | Monitor usage | ~$0-25 |
| Firebase Storage | 5GB, 1GB/day download | Images/videos | ~$0-10 |
| Firebase Auth | 10K users/month | 0-10K | **Free** |
| Cloud Functions | 2M invocations/month | If added | ~$0-10 |
| **Total** | | | **$0-45/month** |

> **Note:** At 10K+ active users, Firestore reads become your main cost. Optimize by:
> - Using client-side caching (already done in stores)
> - Limiting query results (already done with `limit(50)`)
> - Using pagination for large lists (to be added)
> - Adding Cloud Functions for aggregation (instead of counting in real-time)

---

## Quick Commands Reference

```bash
# Rebuild
npm run build

# Deploy all
firebase deploy --only hosting,firestore,storage

# Deploy just hosting
firebase deploy --only hosting

# Check Firebase project
firebase projects:list

# Check Firebase status
firebase status

# Login if token expired
firebase login --reauth

# Open Firebase console
firebase open
```

---

## Emergency Contacts & Resources

- **Firebase Support**: [Firebase Help Center](https://firebase.google.com/support)
- **Firebase Status**: [Status Dashboard](https://status.firebase.google.com/)
- **Firebase Pricing**: [Pricing Calculator](https://firebase.google.com/pricing)
- **Firestore Security Rules**: [Rules Simulator](https://firebase.google.com/docs/firestore/security/get-started)
- **bKash Merchant API**: [bKash Developer](https://developer.bka.sh/)
- **Stripe Docs**: [Stripe Checkout](https://stripe.com/docs/checkout/quickstart)
- **AdSense**: [AdSense Signup](https://www.google.com/adsense/start)
- **Meta Audience Network**: [Meta for Developers](https://developers.facebook.com/products/audience-network/)

---

## Your Next Single Action

**Right now, open this in your browser and do it:**

1. Go to [Firebase Console](https://console.firebase.google.com/project/oumagachat)
2. Click **Firestore Database** → **Create database**
3. Click **Authentication** → **Get started** → Enable **Email/Password** and **Phone**
4. Click **Storage** → **Get started**
5. Open terminal in your project folder
6. Run: `firebase login --reauth` → click Allow in browser
7. Run: `firebase deploy --only hosting,firestore,storage`
8. Open `https://oumagachat.web.app` and test sign-up

**Your app is live. Go get users.** 🚀
