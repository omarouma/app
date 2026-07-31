# GaGa Chat - Deploy Fix TODO

## Issues Identified from Console Errors on gagachat.app/auth

### 1. Firebase Config Uses Placeholder Values (`your-project-id`, `your_app_id`)
### 2. GA4 Measurement ID mismatch (`G-GK2JKHSS9E` hardcoded in index.html vs correct `G-TGV1QBFEES`)
### 3. Missing `databaseURL` in firebase-env.txt
### 4. Restore `.env` with correct Firebase values from firebase-env.txt + Firebase Console data
### 5. Remove duplicate GA4 tracking (GTM + hardcoded + hook)
### 6. Rebuild and Redeploy to Firebase Hosting

## Steps

- [x] Step 0: Analyzed all errors and codebase
- [ ] Step 1: Fix `.env` with correct Firebase config values
- [ ] Step 2: Fix `index.html` - remove hardcoded gtag, let GTM manage GA4
- [ ] Step 3: Add `databaseURL` to firebase.ts config
- [ ] Step 4: Rebuild the app
- [ ] Step 5: Deploy to Firebase Hosting
- [ ] Step 6: Verify the fix

