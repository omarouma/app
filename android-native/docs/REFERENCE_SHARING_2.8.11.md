# Screenshot-driven sharing improvements — GaGa 2.8.11 (66)

The five supplied references cover an attachment tray, a media action sheet,
a file-source selector, an indexed contact directory and photo review/editing.
No personal names, photos, document details or screenshot bytes are committed.

| Reference feature | Implementation in this change |
| --- | --- |
| Paged attachment tray / Contact Card / Files / Music | Two swipeable attachment pages with page count and navigation controls; routes to real contact/file/audio flows. |
| Send media to chats / recent recipients | Viewer Send to chat uses the existing multi-destination confirmation flow. Recent chat avatar shortcuts select recipients without sending. |
| Favorite | Viewer saves the selected media through the existing owner-scoped saved_messages repository. |
| Save image/video / Open with / share | Uses an account-scoped, bounded private download and grants a content URI to the chosen Android app; saving uses the system destination picker. |
| Edit | Viewer opens a non-destructive editor, then returns the edited copy to the photo review/caption/send step. |
| Locate in chat | Closes the viewer and scrolls to the corresponding currently displayed message. |
| All images and videos | Opens the existing chat-info media browser. |
| Extract text / Translate / Search | Bundled offline Latin and Chinese OCR; selectable/copied text; separately confirmed existing cloud translation; explicit web-text search. No automatic image upload. Bengali OCR is not supported by these models. |
| Chat / Favorite / Gallery / Phone files | File browser uses loaded current-chat files and this account's saved attachments; Gallery and Phone files invoke scoped system pickers. Empty selection cannot send. |
| Phone file / Music selection | Retains URI grants when supported, shows filename/size and destination, and requires Send before queueing. |
| Contact search / sections / alphabet index | Uses actual accepted GaGa friends, searchable name/username and scrollable section buttons with 48dp targets. Phone contacts use the platform picker. |
| Verified accounts | Filters real is_verified values; does not invent official/service-account categories. |
| Photo crop / rotate / sticker / drawing / text / HD / caption | Existing tools retained. Editor expanded to full screen; Original/Mono/Warm/Cool filters use one shared matrix for preview and exported bytes. Full-screen review includes save-copy, caption, original-quality toggle, recipient and explicit Send. |
| Album media actions | Actions refer to the selected image, not the primary image's local file. Per-image forwarding identities avoid one album member replacing another. |

## Deliberately remaining backend/product work

- View-once delivery needs atomic server consumption, access revocation across devices,
  restricted media signing and sender/recipient lifecycle tests. It is not a cosmetic toggle.
- Official/service accounts need real roles, enrollment, verification and directory APIs.
- Visual image search needs a supported provider/Android integration and explicit image
  sharing disclosure. This change provides extracted-text search only.
- Device-side file and music reviews are single-item; current-chat source lists explicitly
  describe loaded files. Cross-chat server search and arbitrary multi-file batches are separate work.
- Play acceptance and physical-device end-to-end media/OCR/provider tests remain required.

## Verification

Added unit tests for account/file cache separation, album selected-image identity,
Unicode contact grouping/search and excluding hidden/deleted/unavailable attachments.
Added native tests for explicit media action confirmation and actual filtered bitmap export
without annotations, including preservation of the original file. Existing contact-phone
opt-in tests remain active. CI results must be read before labeling the build validated.

Saved Messages RLS was checked read-only on the existing Supabase project. No schema,
production policies, functions or live release metadata are changed by this feature PR.
The previously prepared 2.8.10 rollout remains paused.
