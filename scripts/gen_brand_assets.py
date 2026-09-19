#!/usr/bin/env python3
"""Generate the complete GaGa Chat brand asset set from the master logo.

Source of truth: public/brand/gaga-logo-master.png (512x512 RGBA, green
gradient rounded-square with a white chat-bubble "GaGa" mark).

Produces (all under public/):
  - icons/icon-{72,96,128,144,152,192,384,512}.png   (PWA "any")
  - icons/icon-maskable.png + icon-maskable-512.png  (PWA "maskable")
  - favicon-16x16.png, favicon-32x32.png, favicon-48x48.png
  - apple-touch-icon.png (180x180)
  - logo-192.png, logo-512.png, logo-maskable-512.png
  - og-image.png (1200x630 social share card)
  - brand/gaga-logo-master.png (canonical copy)

Also regenerates the Android launcher icons + splash screens via
scripts/gen_android_assets.py.
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
ICONS = os.path.join(PUBLIC, "icons")
BRAND = os.path.join(PUBLIC, "brand")
MASTER = os.path.join(BRAND, "gaga-logo-master.png")

GREEN = (0, 200, 83, 255)      # #00C853 brand green
GREEN_DARK = (0, 138, 0, 255)  # #008A00
WHITE = (255, 255, 255, 255)


def load_master() -> Image.Image:
    return Image.open(MASTER).convert("RGBA")


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def circle_mask(size):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size[0] - 1, size[1] - 1], fill=255)
    return mask


def resize(master, px):
    return master.resize((px, px), Image.LANCZOS)


def make_maskable(master, px, safe_ratio=0.72):
    """Maskable icon: brand background fills the canvas, mark sits in the
    central safe zone (Android/iOS may crop up to ~20% on each edge)."""
    bg = Image.new("RGBA", (px, px), GREEN)
    # subtle vertical gradient for depth
    grad = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(px):
        t = y / max(1, px - 1)
        r = int(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t)
        g = int(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t)
        b = int(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t)
        gd.line([(0, y), (px, y)], fill=(r, g, b, 255))
    bg = Image.alpha_composite(bg, grad)
    side = int(px * safe_ratio)
    art = resize(master, side)
    bg.paste(art, ((px - side) // 2, (px - side) // 2), art)
    return bg


def make_og_image(master, w=1200, h=630):
    """Social share card: brand gradient background + logo + wordmark."""
    card = Image.new("RGBA", (w, h), GREEN)
    gd = ImageDraw.Draw(card)
    for y in range(h):
        t = y / (h - 1)
        r = int(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t)
        g = int(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t)
        b = int(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t)
        gd.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # logo on the left
    side = 300
    art = resize(master, side)
    mask = rounded_mask((side, side), int(side * 0.22))
    art_r = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    art_r.paste(art, (0, 0), mask)
    card.paste(art_r, (110, (h - side) // 2), art_r)

    # wordmark + tagline on the right
    try:
        font_big = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 96)
        font_small = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 40)
    except Exception:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    tx = 110 + side + 70
    gd.text((tx, h // 2 - 110), "GaGa Chat", font=font_big, fill=WHITE)
    gd.text((tx, h // 2 + 10), "Free Global Messaging", font=font_small, fill=WHITE)
    gd.text((tx, h // 2 + 70), "HD Voice & Video Calls", font=font_small, fill=WHITE)
    return card.convert("RGB")


def main():
    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(BRAND, exist_ok=True)
    master = load_master()

    # PWA "any" icons
    for px in (72, 96, 128, 144, 152, 192, 384, 512):
        resize(master, px).save(os.path.join(ICONS, f"icon-{px}x{px}.png"))
    print("icons -> icons/icon-*.png")

    # PWA maskable
    make_maskable(master, 512).save(os.path.join(ICONS, "icon-maskable.png"))
    make_maskable(master, 512).save(os.path.join(ICONS, "icon-maskable-512.png"))
    print("icons -> icons/icon-maskable*.png")

    # favicons
    for px in (16, 32, 48):
        resize(master, px).save(os.path.join(PUBLIC, f"favicon-{px}x{px}.png"))
    print("favicons -> favicon-*.png")

    # apple touch icon (opaque, no transparency for iOS)
    apple = Image.new("RGBA", (180, 180), GREEN)
    art = resize(master, 180)
    apple.paste(art, (0, 0), art)
    apple.convert("RGB").save(os.path.join(PUBLIC, "apple-touch-icon.png"))
    print("apple-touch-icon.png")

    # legacy logo aliases
    resize(master, 192).save(os.path.join(PUBLIC, "logo-192.png"))
    resize(master, 512).save(os.path.join(PUBLIC, "logo-512.png"))
    make_maskable(master, 512).save(os.path.join(PUBLIC, "logo-maskable-512.png"))
    resize(master, 512).save(os.path.join(PUBLIC, "logo.png"))
    print("logo-*.png")

    # OG social card
    make_og_image(master).save(os.path.join(PUBLIC, "og-image.png"))
    print("og-image.png")

    # Android launcher icons + splash
    gen_android = os.path.join(ROOT, "scripts", "gen_android_assets.py")
    if os.path.exists(gen_android):
        subprocess.run([sys.executable, gen_android], check=True)
        print("android assets regenerated")


if __name__ == "__main__":
    main()
