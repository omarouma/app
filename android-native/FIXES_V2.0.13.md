# GaGa Chat v2.0.13 — Startup Crash Fix

## Root cause of the "app stops on launch" crash

The v2.0.12 build bundled native libraries for **two** ABIs (`arm64-v8a` and
`armeabi-v7a`), but the ZEGOCLOUD Call Kit's transitive dependency
`com.tencent:mmkv:2.2.2` **only publishes `arm64-v8a` and `x86_64`** native
libraries — there is **no `armeabi-v7a/libmmkv.so`**.

ZEGO registers an auto-run `ContentProvider`
(`com.zegocloud.uikit.prebuilt.call.core.startup.PrebuiltCallInitializer`) whose
`onCreate()` calls `MMKV.initialize(context)` **during process startup, before
`Application.onCreate()`**. On any 32-bit ARM device the missing library throws:

```
java.lang.UnsatisfiedLinkError: dlopen failed: library "libmmkv.so" not found
  at com.tencent.mmkv.MMKV.initialize(MMKV.java)
  at com.zegocloud.uikit.prebuilt.call.core.startup.PrebuiltCallInitializer.onCreate(...)
```

Because the crash happens inside a ContentProvider, the process is killed before
any of the app's own code runs — the app "gets stopped" immediately.

## The fix

Pin MMKV to **1.3.17**, the last release that still ships `armeabi-v7a`
(plus `arm64-v8a`, `x86` and `x86_64`), via a Gradle resolution strategy:

```kotlin
configurations.configureEach {
    resolutionStrategy {
        force("com.tencent:mmkv:1.3.17")
    }
}
```

This is safe because ZEGO only ever calls the **core** MMKV API —
`initialize`, `mmkvWithID`, `defaultMMKV`, `encode`, `decodeBool/Int/Long/String`,
`contains`, `remove`, `getString` — and those method descriptors are
byte-for-byte identical between 1.3.17 and 2.2.2 (verified by disassembling the
ZEGO classes and comparing the `invokevirtual` descriptors). Both the Java and
native halves come from the same 1.3.17 artifact, so there is no JNI mismatch.

Result: `libmmkv.so` is now present for **both** bundled ABIs, and 32-bit ARM
devices no longer crash at startup.

## Other hardening in this build

- `LocaleHelper.wrap()` is wrapped in a defensive `try/catch`; it runs from
  `Activity.attachBaseContext`, so a failure there would be fatal. It now falls
  back to the default context instead of crashing.
- Version bumped to **2.0.13 / versionCode 15**.

## Verification

- `lib/arm64-v8a/libmmkv.so` — present
- `lib/armeabi-v7a/libmmkv.so` — present (was missing in 2.0.12)
- All native libraries depend only on system libs (no `libc++_shared.so` needed).
- Signed (v1+v2+v3), zipaligned, DEX valid, `native-code: arm64-v8a, armeabi-v7a`.
