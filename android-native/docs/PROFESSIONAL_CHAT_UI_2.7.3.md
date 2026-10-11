# GaGa 2.7.3 — Professional Chats UI source package

**Target:** Android native Kotlin / Jetpack Compose.
**Parent branch:** `fix/gaga-2.7.3-release-hardening`. This chat polish is based on the API 36 and signing-guard repair work; do not apply the changed Kotlin files against unrelated APKs without checking source compatibility.

## What is implemented

1. **Chats inbox** — accessible chips for All, Unread, Pinned and Groups; meaningful empty states; title + recent-preview search; existing pinned-first sorting and conversation ID routing preserved. No fake archive feature.
2. **Conversation rows** — clearer long-press labels for accessibility, unread-badge announcement and explicit *Delete for everyone* wording. Existing confirmation is mandatory. **Important:** the repository currently calls a shared-conversation deletion endpoint; this is destructive for participants, not equivalent to a private archive.
3. **Chat header** — voice/video controls appear only for direct conversations, because group calling is not proven to be supported.
4. **Message selection** — forward action is enabled only for one selected message (actual current picker behavior), copy is enabled only when text is selected, and delete-selected label explicitly says *for me*.
5. **Message bubble taps** — only images, videos and files open the media/document viewer. Audio, location, contact, poll and call-event cards retain their own interactions.
6. **Composer** — one large trailing primary action (record when blank, send/save when text exists), accessible emoji label, 6-line composer and restrained separator; Schedule remains available in the attachment sheet. Existing media-picker, caption, upload, call and chat actions are preserved.
7. **Regression tests** — pure policy tests for viewer routing and forwarding, in `ChatUiPolicyTest.kt`.

## Modified and new source files

- `android-native/feature/home/src/main/kotlin/app/gagachat/feature/home/presentation/HomeScreen.kt`
- `android-native/feature/home/src/main/kotlin/app/gagachat/feature/home/presentation/HomeViewModel.kt`
- `android-native/feature/home/src/main/kotlin/app/gagachat/feature/home/presentation/ConversationRow.kt`
- `android-native/feature/chat/src/main/kotlin/app/gagachat/feature/chat/presentation/ChatScreen.kt`
- `android-native/feature/chat/src/main/kotlin/app/gagachat/feature/chat/presentation/ChatUiPolicy.kt` (new)
- `android-native/feature/chat/src/main/kotlin/app/gagachat/feature/chat/presentation/components/MessageBubble.kt`
- `android-native/feature/chat/src/main/kotlin/app/gagachat/feature/chat/presentation/components/MessageComposer.kt`
- `android-native/feature/chat/src/test/kotlin/app/gagachat/feature/chat/presentation/ChatUiPolicyTest.kt` (new)

## Build it yourself

Option 1: check out the full branch:

```bash
git clone https://github.com/omarouma/app.git
cd app
git checkout feat/gaga-professional-chats-2.7.3
python3 android-native/ci/prepare.py
cd android-native
gradle --no-daemon :feature:chat:testReleaseUnitTest :app:assembleRelease :app:bundleRelease
```

`android-native/ci/prepare.py` supplies the repository's public backend configuration, not private signing material. You must configure Firebase and signing in your trusted build environment as described in the existing release documentation.

Option 2: download the changed-file ZIP from GitHub Actions and overlay it onto the exact parent branch at the same relative paths. **Do not replace the entire project with this ZIP**: it contains only files changed by this chat-focused work.

Signed Play Store APK/AAB output requires the authentic release keystore and securely configured credentials; no private key is bundled.

## Manual acceptance test matrix

- Chat inbox: All, Unread, Pinned, Groups each show correct conversations; changing chips does not delete or mutate data; searching names or recent previews works and empty states are clear.
- Conversation actions: long-press Pin/Mute/Mark read; destructive Delete for everyone always requires confirmation and clearly conveys the multi-user impact.
- Chat header: direct chat offers valid call actions, group chat does not advertise unsupported 1:1 calling.
- Composer: blank input → voice button; nonblank → Send; edit mode → Save; 6-line growth, Enter-to-send preference, reply preview, emoji toggle, attachment sheet and Schedule action all work.
- Messages: media/file open correct viewer or document handler; call-event cards, contacts, location, audio and polls never open generic media viewer on bubble tap.
- Multi-select: copy only text, forwarding one selected item succeeds, forwarding two items is disabled, Delete for me does not remove the other person's copy.
- Accessibility: TalkBack labels, 200% font scaling, keyboard/IME behavior, small width and night mode.
- Regressions: send photos/videos/audio, retry interrupted uploads, long histories, message receipts and real two-device call flows.

## Known follow-up work (NOT fixed in this package)

- Friend discovery, full backend reconciliation, Settings account synchronization, real-device call reliability and production rollout approval require separate tests.
- In-app updater sender automation, Play Core update flow and live hosted release-manifest deployment are separate from this chat polish.
- Never claim test or signed-release success until GitHub CI and signing verification establish it.
