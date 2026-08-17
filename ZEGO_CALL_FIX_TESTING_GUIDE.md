# ZEGO Call Join Fix - Manual Testing Guide

## Overview
The ZEGO call deadlock has been fixed by decoupling container ref mounting from the `isZegoActive` state. This guide walks you through verifying the fix works end-to-end in a real browser environment.

---

## Prerequisites
- Development environment running: `npm run dev`
- Two browser windows or tabs for testing calls
- Two user accounts (or ability to create them)
- Camera/microphone access enabled in browser

---

## Test Scenarios

### Scenario 1: One-to-One Voice Call (Quickest Validation)

**Goal:** Verify a voice call connects without hanging on "Joining..."

**Steps:**
1. Open browser to `http://localhost:5173` in two windows (User A and User B)
2. Login with User A in first window, User B in second window
3. From User A's window: Find User B in contacts → click to initiate voice call
4. Observe User B's window:
   - ✅ EXPECTED: Ring overlay appears immediately
   - ❌ FAIL: Blank black screen with "Joining..." that never progresses

5. From User B's window: Click "Accept" to accept the call
6. Observe both windows:
   - ✅ EXPECTED: Both sides show ZEGO prebuilt UI (controls visible, audio/video indicators)
   - ✅ EXPECTED: Call connects within 2-3 seconds
   - ❌ FAIL: Stuck on black screen / "Joining..." overlay

7. From User A's window: Click end call button
8. Observe:
   - ✅ EXPECTED: Both sides cleanly exit call and return to chat UI
   - ❌ FAIL: Call hangs or shows error

---

### Scenario 2: One-to-One Video Call

**Goal:** Verify video call with container ref mounting timing

**Steps:**
1. From User A: Initiate video call to User B
2. Observe User B's incoming call notification:
   - ✅ EXPECTED: Ring overlay with video preview appears immediately
   - ❌ FAIL: Ring appears but no preview, or "Joining..." hangs

3. User B accepts call
4. Observe both sides:
   - ✅ EXPECTED: ZEGO prebuilt UI shows with video stream from both sides
   - ✅ EXPECTED: Video/audio controls visible and responsive
   - ❌ FAIL: Black screen, frozen video, or "Joining..." state persists

5. Test controls:
   - Click mute → Audio indicator should toggle
   - Click camera off → Video should freeze/disable
   - ✅ EXPECTED: Controls work smoothly
   - ❌ FAIL: Controls unresponsive or cause UI to hang

6. End call from either side
7. Observe:
   - ✅ EXPECTED: Clean return to chat UI, no console errors
   - ❌ FAIL: "Double-end" error in logs, or app in weird state

---

### Scenario 3: Room Switch / Rapid Call Changes

**Goal:** Verify the fix handles room replacement without double-ending

**Steps:**
1. Initiate call between User A and User B (same as Scenario 1)
2. While call is active, User A initiates a separate call with User C
   - Observe: Original call should end gracefully
   - ✅ EXPECTED: "Call ended" notification appears, switch to new call starts
   - ❌ FAIL: Console shows double-end error, or app state becomes inconsistent

3. Accept the new call with User C
4. Observe:
   - ✅ EXPECTED: Seamlessly transitions to new call UI
   - ❌ FAIL: Flickering, black screens, or "join" errors in console

---

### Scenario 4: Rejecting / Timing Out

**Goal:** Verify call rejection doesn't leave container mounted

**Steps:**
1. User A initiates call to User B
2. Observe User B's incoming call notification
   - ✅ EXPECTED: Ring overlay appears
3. User B clicks "Reject" or waits for 60-second timeout
4. Observe:
   - ✅ EXPECTED: Ring overlay disappears, clean return to chat UI
   - ✅ EXPECTED: No black screen or lingering ZEGO container
   - ❌ FAIL: Black screen remains, or "Joining..." persists

---

## What to Look For: Signs the Fix is Working

### Visual Indicators
- ✅ Call initiation → Ring overlay appears **immediately** (no delay)
- ✅ Container mounts when `activeCall` exists, **before** ZEGO connects
- ✅ ZEGO prebuilt UI appears **quickly** after accept (within 2-3 seconds)
- ✅ Video/audio controls are **visible and responsive**
- ✅ Call end is **clean** — UI returns to chat, no residual black screen

### Console Indicators
Open DevTools (F12) and check the **Console** tab:
- ✅ EXPECTED: No errors when call starts
- ✅ EXPECTED: Logs show: `[ZEGO] Joining call-{id}...` → `[ZEGO] Successfully joined call-{id}`
- ❌ FAIL: `TypeError: Cannot read property of null` (container ref issue)
- ❌ FAIL: `[ZEGO] onLeaveRoom called twice` (double-end issue)

### Network Indicators
- ✅ EXPECTED: WebRTC/ZEGO connection establishes (check Network tab in DevTools)
- ✅ EXPECTED: Audio/video packets flow between peers
- ❌ FAIL: No packets sent/received (join didn't happen)

---

## Debugging: If Tests Fail

### Symptom: "Joining..." hangs forever
**Likely Cause:** Container ref not mounting  
**Fix Verification:**
1. Open DevTools (F12) → Inspector tab
2. Search for: `<div class="absolute inset-0 bg-black">`
3. ✅ Should exist in DOM even while `isZegoActive` is false
4. If not found: The container mounting fix wasn't applied

### Symptom: Call connects then immediately ends
**Likely Cause:** Double-end cleanup firing  
**Fix Verification:**
1. Check Console for: `onLeaveRoom fired during programmatic leave`
2. ✅ Should NOT appear in logs (the guard prevents this)
3. If it appears: The `isLeavingRef` guard wasn't applied correctly

### Symptom: "Cannot read property of null" errors
**Likely Cause:** Join attempted before container mounted  
**Fix Verification:**
1. Check Console for stack trace
2. Look for: `zegoRef.current.containerRef.current` in error
3. ✅ Should not appear (polling waits for container now)
4. If it appears: The join polling logic wasn't applied

---

## Quick Regression Check

Run this sequence in 2-3 minutes to confirm everything works:

| Step | Action | Expected Result | ✅ Pass |
|------|--------|-----------------|--------|
| 1 | Initiate voice call | Ring appears immediately | |
| 2 | Accept call | ZEGO UI shows within 2-3s | |
| 3 | Check audio works | Can speak and hear | |
| 4 | End call | Clean exit to chat UI | |
| 5 | Initiate video call | Ring + video preview | |
| 6 | Accept call | ZEGO video UI appears | |
| 7 | Test controls | Mute/camera work smoothly | |
| 8 | End call | No errors in console | |

---

## Files Changed (For Reference)

The fix touches three files:

### 1. `src/components/calling/CallOverlay.tsx` (Container Mounting)
```tsx
// Container now mounts when activeCall exists, NOT when isZegoActive is true
{activeCall && !isGroup && (
  <div ref={zegocontainerRef} className="absolute inset-0 bg-black" />
)}
```

### 2. `src/hooks/useWebRTCManager.ts` (Join Timing)
```typescript
// Join waits for container ref to exist (polls every 100ms)
const containerCheck = setInterval(() => {
  if (!zegoRef.current.containerRef.current) return; // Wait...
  // Container exists! Now join.
  await zegoRef.current.join(...);
}, 100);
```

### 3. `src/hooks/useZegoCall.ts` (Double-End Prevention)
```typescript
// Guard prevents onLeaveRoom firing during programmatic leave
isLeavingRef.current = true;
zego.destroy();
```

---

## Production Deployment Notes

Once manual testing confirms the fix works:

1. **Commit & Push:** Submit PR with the three files changed
2. **Code Review:** Share this testing guide with reviewers
3. **Deploy:** Merge to main, trigger Firebase deploy
4. **Monitor:** Watch for call-related errors in production analytics
5. **Rollback Plan:** If issues appear, revert the three files

---

## Contact & Support

If you encounter issues during testing:
- Check console for error messages
- Compare your DOM structure to the expected output above
- Verify all three files have been modified (use `git diff` to confirm)
- Re-run the development server (`npm run dev`)

