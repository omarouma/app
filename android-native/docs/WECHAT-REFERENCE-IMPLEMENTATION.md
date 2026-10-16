# WeChat screenshot implementation — 16 October 2026

References are the ten screenshots supplied in chat. No contact names, phone
numbers, photographs, or screenshot files are committed to the repository.

| Screenshot time | Visible interaction | GaGa implementation / remaining boundary |
| --- | --- | --- |
| 05:19:23 | Contact selection, destination confirmation, optional note | Phone-row picker reads only the chosen number; confirmation names the destination and offers an optional message. Forwarding a received card now also requires destination confirmation. GaGa account/profile cards and in-app alphabetical friend selection remain separate work. |
| 05:19:28 | Contact card in chat | Existing contact message transport retained; receiver can open details, dial, copy, or save to their device address book. |
| 05:19:46 | Caller cancellation, declined call, connected duration | Existing CallOutcome rendering already distinguishes these. Real two-account call lifecycle verification remains required. |
| 05:20:13 | Numbered photo selection, original quality, grouped sending | Existing numbered selection/reordering retained. Adds no-additional-compression option and grouped/separate sending. Edited images remain the edited JPEG copy, not the untouched source. Provider picker remains Android's picker. Total byte-size estimate remains pending. |
| 05:20:26 | Collapsed grouped album | Existing ordered album message transport/gallery retained; separate-photo mode now optional. WeChat's specific stacked-card presentation is not copied. |
| 05:21:04 | Drawing, stickers, text, crop, mosaic, undo/redo, AI | Adds drawing, emoji stickers, mosaic brush and bounded undo/redo. Actual bitmap renderer supplies preview and saved image. Existing rotate/flip/crop/text retained. AI editing needs a separately configured service and is not exposed as a non-working button. |
| 05:22:33 | Location search/results, distance, selected pin | Search displays explicit selectable results with addresses and distances, selection checkmark, recenter and zoom. Selected place label travels in existing location message text. |
| 05:22:43 | Reposition pin and search | Map tap chooses a pin; search does not automatically change it. Drag/pinch map gestures remain pending. |
| 05:22:48 | Nearby address list | Uses the Android geocoder's real nearby addresses; this is not advertised as a complete business/POI catalogue. Coverage depends on the device provider. |
| 05:23:03 | Received pin, directions, favorite, ride | Existing in-app map and directions retained. Existing message-saving flow can save location messages. Dedicated location favorites/distance panel and ride-provider integration remain pending. |

## Video increment (stacked dependency)

The preceding video PR adds trim, mute, text placement, emoji sticker, undo/redo,
restore original, verified export and exported preview before sending. It includes
real MP4 codec tests with a synthetic video/audio fixture; these are not substitutes
for a sender/recipient device test or verification across hardware encoders.

## Validation and release boundary

Unit tests cover edit history and invalid ranges. Android instrumentation covers
actual export/decoding, overlays, muted and retained audio, unchanged original,
contact confirmation/send latching, address validation, and image drawing/mosaic.
CI results are reported on each PR. No live backend schema changes are needed for
this increment. Existing message metadata and media upload queues are reused.
No public deployment, PR merge, Play upload, or release-signing change is included.
