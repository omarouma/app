#!/usr/bin/env python3
"""Frame raw phone captures into Google Play-compliant store screenshots.

Google Play phone-screenshot rules (as of 2024/2025):
  * JPEG or 24-bit PNG (no alpha channel).
  * Each side between 320 px and 3840 px.
  * Aspect ratio between 16:9 (1.78) and 9:16 (0.5625).
  * 2-8 screenshots recommended.

This tool takes the raw captures produced by ``ci/capture_store_screenshots.sh``
(or any phone screenshot) and composites each one onto a 1080x1920 (9:16) branded
canvas with an optional caption band, so the result is always Play-compliant
regardless of the source device's aspect ratio.

Usage
-----
    python3 frame_screenshots.py <input_dir> <output_dir> [captions.json]

``captions.json`` is optional and maps an input file stem to a caption, e.g.::

    {
      "01-chats":    {"title": "All your chats", "subtitle": "Fast, private messaging"},
      "02-call":     {"title": "HD voice & video", "subtitle": "Crystal-clear calls"}
    }

Only Pillow is required (``pip install pillow``).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- Brand + canvas constants -------------------------------------------------
W, H = 1080, 1920            # 9:16, within Play's allowed range
GREEN = (0x00, 0xC3, 0x00)   # gaga_green (matches the launcher icon)
GREEN_DARK = (0x07, 0x5F, 0x3B)
WHITE = (0xFF, 0xFF, 0xFF)
MUTED = (0xD9, 0xF2, 0xE3)

MARGIN = 72                  # canvas margin around the framed device
CAPTION_TOP = 150            # space reserved for the caption band
CAPTION_BOTTOM = 90
RADIUS = 44                  # rounded-corner radius for the framed capture

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _background() -> Image.Image:
    """Vertical brand gradient, 1080x1920, RGB."""
    bg = Image.new("RGB", (W, H), GREEN)
    top, bottom = GREEN, GREEN_DARK
    for y in range(H):
        t = y / (H - 1)
        row = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        ImageDraw.Draw(bg).line([(0, y), (W, y)], fill=row)
    return bg


def _rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([(0, 0), img.size], radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def frame_one(src: Path, dst: Path, caption: dict | None) -> None:
    shot = Image.open(src).convert("RGB")

    # Available area for the capture inside the canvas.
    avail_w = W - 2 * MARGIN
    avail_h = H - CAPTION_TOP - CAPTION_BOTTOM - 2 * MARGIN

    scale = min(avail_w / shot.width, avail_h / shot.height)
    new_size = (max(1, int(shot.width * scale)), max(1, int(shot.height * scale)))
    shot = shot.resize(new_size, Image.LANCZOS)

    canvas = _background().convert("RGBA")

    # Caption band.
    if caption and (caption.get("title") or caption.get("subtitle")):
        draw = ImageDraw.Draw(canvas)
        y = MARGIN
        if caption.get("title"):
            f = _font(FONT_BOLD_CANDIDATES, 62)
            draw.text((W // 2, y), caption["title"], font=f, fill=WHITE, anchor="ma")
            y += 82
        if caption.get("subtitle"):
            f = _font(FONT_CANDIDATES, 38)
            draw.text((W // 2, y), caption["subtitle"], font=f, fill=MUTED, anchor="ma")

    # Centre the framed capture in the device area.
    area_top = CAPTION_TOP + MARGIN
    x = (W - shot.width) // 2
    y = area_top + (avail_h - shot.height) // 2
    canvas.alpha_composite(_rounded(shot, RADIUS), (x, y))

    # Play rejects alpha, so flatten to 24-bit RGB.
    canvas.convert("RGB").save(dst, "PNG", optimize=True)
    print(f"  {src.name}  ->  {dst.name}  ({new_size[0]}x{new_size[1]} framed)")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    in_dir, out_dir = Path(argv[1]), Path(argv[2])
    captions: dict = {}
    if len(argv) >= 4 and Path(argv[3]).exists():
        captions = json.loads(Path(argv[3]).read_text())

    if not in_dir.is_dir():
        print(f"input directory not found: {in_dir}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        p for p in in_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"}
    )
    if not sources:
        print(f"no images found in {in_dir}", file=sys.stderr)
        return 1

    print(f"Framing {len(sources)} capture(s) -> {out_dir} (1080x1920)")
    for src in sources:
        frame_one(src, out_dir / f"{src.stem}.png", captions.get(src.stem))
    print("Done. Upload 2-8 of these to the Play Console 'Phone screenshots' slot.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
