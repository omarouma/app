# Auth Section - Fix Plan Checklist

## ✅ Fix 1: Remove duplicate CallProvider from main.tsx
- Remove `CallProvider` import and wrapper from `src/main.tsx`
- Kept only in `src/App.tsx`

## ✅ Fix 2: Fix circular dependency risk in useSettingsStore
- Replace module-level `import { useAuthStore }` with dynamic import inside functions

## ✅ Fix 3: Reset needsEmailVerification state in AuthContext
- Reset `needsEmailVerification` to `false` when switching to login mode

## ⬜ Fix 4: Rename resetPassword import alias for clarity
- Use `import { resetPassword as resetPasswordApi }` to avoid confusion
