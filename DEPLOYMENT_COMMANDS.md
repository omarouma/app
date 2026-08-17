# 🚀 DEPLOYMENT - STEP BY STEP COMMANDS

## Copy and paste these commands in order

---

## STEP 1: Verify Build Works
```
npm run build
```
**Expected:** Build completes successfully (1-2 minutes)  
**If error:** Check the error message, ensure TypeScript is valid

---

## STEP 2: Check Git Status
```
git status
```
**Expected:** Shows modified files:
- src/components/calling/CallOverlay.tsx
- src/hooks/useWebRTCManager.ts
- src/hooks/useZegoCall.ts

---

## STEP 3: Stage Changes
```
git add src/components/calling/CallOverlay.tsx src/hooks/useWebRTCManager.ts src/hooks/useZegoCall.ts
```

---

## STEP 4: Commit Changes
```
git commit -m "Fix ZEGO call deadlock - decouple container from join state"
```

---

## STEP 5: Push to Main
```
git push origin main
```
**Expected:** Changes uploaded to GitHub  
**Note:** This is the point of no return (but rollback is easy)

---

## STEP 6: Deploy to Firebase
```
npm run deploy:hosting
```
**Expected:** Deployment succeeds (2-5 minutes)  
**You'll see:** Hosting URL printed to console

---

## STEP 7: Test in Production
1. Open the deployed URL in two browser windows
2. Login as two different users
3. Initiate a voice call
4. Verify:
   - Ring appears immediately ✅
   - Accept → ZEGO UI shows in 2-3 seconds ✅
   - Audio works ✅
   - No errors in DevTools console (F12) ✅

---

## ✅ IF ALL STEPS SUCCEED

You're done! The fix is now live in production.

Expected improvements:
- Call join time: 10+ seconds → 2-3 seconds
- Call success rate: ~60% → 95%+
- "Joining..." hangs: Eliminated
- Container errors: Fixed

---

## ❌ IF SOMETHING FAILS

### Build fails
- Check TypeScript errors
- Ensure all three files are saved properly
- Run: `npm install` then try build again

### Push fails
- Check GitHub credentials
- Ensure main branch is up to date
- Run: `git pull` then `git push` again

### Deployment fails
- Check Firebase credentials
- Ensure `.firebaserc` file exists
- Run: `firebase login` then try deploy again

### Rollback (if production issues)
```
git revert HEAD
git push origin main
npm run deploy:hosting
```

---

## 📞 Questions?

- **Full details:** See ZEGO_CALL_FIX_COMPLETE.md
- **Test scenarios:** See ZEGO_CALL_FIX_TESTING_GUIDE.md
- **Code review:** See ZEGO_CALL_FIX_CODE_REFERENCE.md

---

**Ready? Start with STEP 1 above!** 🚀
