#!/bin/bash
# ZEGO Call Join Fix - Verification Commands
# Run these to verify the fix is applied correctly

echo "🔍 Verifying ZEGO Call Join Fix Implementation..."
echo ""

# Check 1: Verify CallOverlay container mounting is unconditional
echo "✅ Check 1: CallOverlay.tsx - Container mounting"
grep -A 5 "ref={zegocontainerRef}" src/components/calling/CallOverlay.tsx | grep -c "activeCall && !isGroup" > /dev/null
if [ $? -eq 0 ]; then
  echo "   ✅ Container mounts unconditionally when activeCall exists"
else
  echo "   ❌ FAIL: Container mounting not fixed"
fi

# Check 2: Verify useWebRTCManager has container polling
echo ""
echo "✅ Check 2: useWebRTCManager.ts - Container polling"
grep -c "containerCheck = setInterval" src/hooks/useWebRTCManager.ts > /dev/null
if [ $? -eq 0 ]; then
  echo "   ✅ Join waits for container with polling loop"
else
  echo "   ❌ FAIL: Container polling not implemented"
fi

# Check 3: Verify useZegoCall has leave guard
echo ""
echo "✅ Check 3: useZegoCall.ts - Double-end prevention"
grep -c "isLeavingRef" src/hooks/useZegoCall.ts > /dev/null
if [ $? -eq 0 ]; then
  echo "   ✅ Programmatic leave guarded to prevent double-end"
else
  echo "   ❌ FAIL: Leave guard not implemented"
fi

# Check 4: TypeScript compilation
echo ""
echo "✅ Check 4: TypeScript Validation"
npm run build 2>&1 | grep -i "error" > /dev/null
if [ $? -ne 0 ]; then
  echo "   ✅ Code compiles without TypeScript errors"
else
  echo "   ⚠️  WARNING: TypeScript errors detected"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📋 MANUAL VERIFICATION STEPS:"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. Start dev server:     npm run dev"
echo "2. Open two browser tabs: http://localhost:5173"
echo "3. Login with two users"
echo "4. Initiate voice call from User A to User B"
echo "5. Observe:"
echo "   ✅ Ring overlay appears immediately on User B"
echo "   ✅ User B accepts, ZEGO UI appears within 2-3 seconds"
echo "   ✅ No 'Joining...' hangs or black screen stalls"
echo "6. Check DevTools Console (F12):"
echo "   ✅ No 'Cannot read property of null' errors"
echo "   ✅ No 'onLeaveRoom called twice' warnings"
echo ""
echo "See: ZEGO_CALL_FIX_TESTING_GUIDE.md for detailed test scenarios"
echo ""
