# Google Play Store assets

Everything the Play Console "Main store listing" needs for `gagachat.app`.
Copy lives in [`store-listing.md`](store-listing.md); graphics live here.

## Status

| Asset | Spec | File | Status |
| --- | --- | --- | --- |
| App icon | 512×512 PNG (32-bit, no alpha required) | `icon-512.png` | ✅ regenerated from the real launcher assets |
| Feature graphic | 1024×500 PNG/JPEG | `feature-graphic-1024x500.png` | ✅ |
| Phone screenshots | 2–8 images, 320–3840 px, aspect 16:9–9:16 | `screenshots/` | ⏳ capture from the release build |
| Short description | ≤ 80 chars | `store-listing.md` | ✅ |
| Full description | ≤ 4000 chars | `store-listing.md` | ✅ |
| Release notes | ≤ 500 chars | `store-listing.md` | ✅ |
| App name | ≤ 30 chars | `store-listing.md` | ✅ |

## Icon

`icon-512.png` is generated from the **real** app assets so the listing icon
matches the installed launcher icon exactly. Regenerate it any time the launcher
icon changes:

```bash
python3 make_icon.py
```

The script composites the adaptive-icon foreground
(`app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png`, the 108 dp
adaptive grid at 4×) onto a full-bleed `gaga_green` (#00C300) square. Google
applies its own rounding mask, so the file is a plain square with no transparent
corners.

> The previous `icon-512.png` was a purple speech bubble that did not match the
> green GaGa brand or the installed icon. It has been replaced.

## Feature graphic

`feature-graphic-1024x500.png` — green brand gradient, the GaGa wordmark and the
"Chat • Call • Connect" tagline. Keep text inside the central safe area; Play
crops the edges on some surfaces.

## Screenshots

See [`screenshots/README.md`](screenshots/README.md). Screenshots must be real
captures of the release build — never mock-ups or placeholder art.

Capture helper: `../ci/capture_store_screenshots.sh`.
Framing helper (guarantees 1080×1920 / 9:16, adds an accurate caption band):
`frame_screenshots.py`.

## Play Console forms and runbook

The console answers and the end-to-end procedure are now stored here so the
listing is reproducible:

| Document | Covers |
| --- | --- |
| [`data-safety.md`](data-safety.md) | Data safety form — every data type, purpose and security answer |
| [`content-rating.md`](content-rating.md) | Content rating questionnaire + interactive-element flags |
| [`publish-runbook.md`](publish-runbook.md) | Full Console runbook: upload key → internal test → production |
| [`store-listing.md`](store-listing.md) | App name, short/full description, release notes, categorisation |

Still entered directly in the console (not files): app category **Communication**,
contact email/website/privacy policy (see `store-listing.md`), target audience
(**13+**) and the ads declaration (**no ads**).
